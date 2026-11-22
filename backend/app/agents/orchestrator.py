"""Orchestrator: decides when to run the agent cycle, and runs it.

Cycle: Monitor → Routing (fast path) → Inventory → Routing (matrix) → Coordinator → Validator → Dispatcher.
Debounces and timers are in sim time, so headless runs are reproducible.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager

from app.agents.coordinator import CoordinatorAgent
from app.agents.dispatcher import DispatcherAgent
from app.agents.inventory import InventoryAgent
from app.agents.monitor import MonitorAgent
from app.agents.routing import RoutingAgent
from app.agents.supply import SupplyAgent
from app.agents.types import PlanResult
from app.llm.client import LLMClient
from app.models import ApprovalPolicy, Hazard
from app.sim.runner import TimelineEvent
from app.sim.world import WorldState

# Re-plans that only keep trucks busy use the instant heuristic planner; the AI is used when something changed.
ROUTINE = frozenset({"hourly re-plan", "a truck became free while camps still need supplies"})


@contextmanager
def timed(world: WorldState, agent: str) -> Iterator[None]:
    t0 = time.perf_counter()
    yield
    world.bus.record_ms(agent, (time.perf_counter() - t0) * 1000)


class Orchestrator:
    """The agentic policy. Implements the `Policy` protocol (`on_step`) used by `Simulation`."""

    def __init__(
        self,
        *,
        approval_threshold_kg: float = 6000,
        auto_approve_after_s: int | None = None,
        weather_mode: str = "cache",
        replan_every_min: int = 60,
        debounce_min: int = 5,
        max_orders: int = 8,
        policy: ApprovalPolicy | None = None,
        llm: LLMClient | None = None,
        background_llm: bool = False,
        inject_fault: bool = False,
    ) -> None:
        self.monitor = MonitorAgent(weather_mode)
        self.inventory = InventoryAgent()
        self.routing = RoutingAgent()
        self.coordinator = CoordinatorAgent(approval_threshold_kg, max_orders, llm, background=background_llm)
        self.inject_fault = inject_fault
        self.dispatcher = DispatcherAgent(approval_threshold_kg, auto_approve_after_s, policy)
        self.replan_every_s = replan_every_min * 60
        self.debounce_s = debounce_min * 60
        self.pending: list[str] = []
        self.last_cycle_at: int | None = None
        self.last_result: PlanResult | None = None
        self._free_trucks: set[str] = set()
        self.ended = False
        self.sitrep_every_s = 3 * 3600
        self.cycle_id: int | None = None
        self._last_sitrep = 0
        self.supply = SupplyAgent()
        self.weather_every_s = 3600  # the Monitor re-reads the forecast every sim-hour
        self._last_weather: int | None = None

    # ------------------------------------------------------------ Policy
    def on_step(self, world: WorldState, events: list[TimelineEvent]) -> None:
        for ev in events:
            self.handle_event(world, ev)
        self.poll_plan(world)
        if self._last_weather is None or world.sim_seconds - self._last_weather >= self.weather_every_s:
            self._last_weather = world.sim_seconds
            with timed(world, "monitor"):
                if self.monitor.weather_check(world):
                    self.request("weather forecast changed")
        with timed(world, "supply"):
            for trigger in self.supply.on_step(world):
                self.request(trigger)
        for cid in self.inventory.track(world):
            self.request(f"{world.camps[cid].name} became critical")
        free = {t.id for t in world.trucks.values() if world.truck_is_free(t.id)}
        if free - self._free_trucks and self._unmet_demand(world):
            self.request("a truck became free while camps still need supplies")
        self._free_trucks = free
        self.dispatcher.auto_approve(world)
        if world.sim_seconds - self._last_sitrep >= self.sitrep_every_s:
            self._last_sitrep = world.sim_seconds
            self.sitrep(world)
        if self.last_cycle_at is None:
            self.request("scenario start")
        elif world.sim_seconds - self.last_cycle_at >= self.replan_every_s:
            self.request("hourly re-plan")
        if (
            self.pending
            and not self.coordinator.busy
            and (self.last_cycle_at is None or world.sim_seconds - self.last_cycle_at >= self.debounce_s)
        ):
            self.run_cycle(world)

    # ------------------------------------------------------------ external triggers (timeline, API)
    def handle_event(self, world: WorldState, ev: TimelineEvent) -> None:
        if ev.action == "hazard_add" and ev.preset_id:
            self.add_preset(world, ev.preset_id)
        elif ev.action == "hazard_remove" and ev.preset_id:
            for hid, h in list(world.hazards.items()):
                if h.preset_id == ev.preset_id:
                    self.remove_hazard(world, hid)
        elif ev.action == "weather_check":
            if self.monitor.weather_check(world):
                self.request("heavy-rain advisory")
        elif ev.action == "population_change":
            camp = world.camps[ev.params["camp_id"]]
            delta = int(ev.params["delta"])
            world.bus.log(
                "monitor",
                "camp.population",
                f"{delta:,} more people reached {camp.name} ({ev.params.get('note', 'district update')}). "
                f"It now shelters {camp.population:,}.",
                f"District administration update. At this size the camp uses "
                f"{world.burn_per_day(camp)['water_l']:,.0f} L of water a day; it has "
                f"{world.water_days(camp):.1f} days left. The Coordinator re-plans.",
                camp_ids=[camp.id],
            )
            self.request(f"{delta:,} more people at {camp.name}")
        elif ev.action == "stock_arrival":
            wh = world.warehouses[ev.params["warehouse_id"]]
            items = ev.params["items"]
            world.bus.log(
                "monitor",
                "stock.arrived",
                f"A {ev.params.get('note', 'consignment')} reached the {wh.name} warehouse: "
                f"{items.get('water_l', 0):,} L water, {items.get('food_rations', 0):,} food rations, "
                f"{items.get('medical_kits', 0):,} medical kits.",
                "More stock is available, so the Coordinator re-plans with it.",
            )
            self.request(f"new stock at {wh.name}")
        elif ev.action == "warehouse_down":
            wh = world.warehouses[ev.params["warehouse_id"]]
            world.bus.log(
                "monitor",
                "warehouse.offline",
                f"Supply disruption: {wh.name} warehouse is offline ({wh.offline_reason}). "
                "Nothing can be loaded there until it reopens.",
                f"Its {wh.stock.water_l:,} L water and {wh.stock.food_rations:,} food rations are out of reach. "
                "Orders waiting on it are recalled and the Coordinator re-plans from the other warehouses.",
            )
            with timed(world, "dispatcher"):
                self.dispatcher.recall_offline(world, wh.id)
            world.bus.publish("warehouse.updated", {"warehouse_id": wh.id, "offline": True})
            self.request(f"{wh.name} warehouse went offline")
        elif ev.action == "warehouse_up":
            wh = world.warehouses[ev.params["warehouse_id"]]
            world.bus.log(
                "monitor",
                "warehouse.online",
                f"{wh.name} warehouse is open again: loading has resumed.",
                "Its stock is available to the planner again.",
            )
            world.bus.publish("warehouse.updated", {"warehouse_id": wh.id, "offline": False})
            self.request(f"{wh.name} warehouse reopened")
        elif ev.action == "end" and not self.ended:
            self.ended = True
            k = world.kpi.snapshot()
            world.bus.log(
                "system",
                "scenario.end",
                f"Scenario complete at {world.sim_time}: {k.deliveries_total} deliveries, "
                f"{k.deliveries_on_time_pct:.0f}% on time, "
                f"{k.people_hours_without_water:,.0f} people-hours without water.",
            )

    def add_preset(self, world: WorldState, preset_id: str, source: str = "scripted demo timeline") -> Hazard | None:
        with timed(world, "monitor"):
            hazard = self.monitor.add_preset(world, preset_id, source)
        if hazard:
            with timed(world, "routing"):
                self.routing.on_hazard_added(world, hazard)
            with timed(world, "inventory"):  # a camp cut off by this flood is flagged now, not at the next cycle
                self.inventory.run(world)
            self.dispatcher.recall_cut_off(world)
            self.request(f"new hazard: {hazard.label}")
            if self.inject_fault and not self.coordinator.injected:
                self.coordinator.inject_next = True  # DEMO_INJECT_FAULT: corrupt the next plan once
        return hazard

    def remove_hazard(self, world: WorldState, hazard_id: str) -> Hazard | None:
        with timed(world, "monitor"):
            hazard = self.monitor.remove_hazard(world, hazard_id)
        if hazard:
            with timed(world, "routing"):
                self.routing.on_hazard_removed(world, hazard)
            self.request(f"hazard cleared: {hazard.label}")
        return hazard

    def poll_plan(self, world: WorldState) -> bool:
        """Live mode: finish the cycle if the AI's answer has arrived. Returns True while it is still thinking."""
        if not self.coordinator.busy:
            return False
        with world.bus.in_cycle(self.cycle_id):
            result = self.coordinator.poll(world)
        if result is not None:
            self._complete(world, result)
        return self.coordinator.busy

    def request(self, trigger: str) -> None:
        if trigger not in self.pending:
            self.pending.append(trigger)

    # ------------------------------------------------------------ the cycle
    def run_cycle(self, world: WorldState) -> PlanResult | None:
        trigger = "; ".join(self.pending)
        self.pending = []
        self.last_cycle_at = world.sim_seconds
        self.cycle_id = world.bus.begin_cycle()  # what changed since the last plan + this plan share one cycle id
        with world.bus.in_cycle(self.cycle_id):
            world.bus.log(
                "coordinator",
                "cycle.started",
                f"Planning cycle #{self.cycle_id} started. Why now: {trigger}.",
                f"Coordinator: {self.coordinator.label}. Inventory refreshes every camp's days of cover, the "
                "Coordinator proposes a plan, the Validator checks it, and the Dispatcher sends or asks for approval.",
            )
            self.routing.resume_holding(world)
            with timed(world, "inventory"):
                statuses = self.inventory.run(world)
            self.dispatcher.recall_cut_off(world)
            statuses = {
                cid: self.inventory.camp_status(world, world.camps[cid], reachable=not st.cut_off)
                for cid, st in statuses.items()
            }  # refresh incoming after recalls
            world.bus.publish(
                "plan.started", {"trigger": trigger, "coordinator": self.coordinator.label, "cycle": self.cycle_id}
            )
            self.coordinator.cycle_id = self.cycle_id
            routine = all(t in ROUTINE for t in trigger.split("; "))
            result = self.coordinator.plan(world, statuses, trigger, routine=routine)
            if result is None:  # the LLM is thinking in the background; finished in on_step via poll()
                return None
            return self._complete(world, result)

    def _complete(self, world: WorldState, result: PlanResult) -> PlanResult:
        world.bus.record_ms("coordinator", result.latency_ms)
        with world.bus.in_cycle(self.cycle_id), timed(world, "dispatcher"):
            self.dispatcher.execute(world, result)
        world.bus.publish(
            "plan.completed",
            {
                "orders": [o.__dict__ | {"items": o.items.as_dict()} for o in result.validation.orders],
                "source": result.source,
                "attempts": result.attempts,
                "latency_ms": result.latency_ms,
                "summary": result.plan.get("summary", ""),
                "cycle": self.cycle_id,
                "unserved": result.plan.get("unserved", []),
            },
        )
        self.last_result = result
        return result

    def sitrep(self, world: WorldState) -> None:
        """Situation report every 3 sim-hours (template text in offline mode)."""
        floods = [h for h in world.hazards.values() if h.kind != "rain_advisory"]
        roads = sorted({world.graph.edges[e].road.split(" (")[0] for h in floods for e in h.edge_ids})
        levels = {c.id: self.inventory.level(c.id) for c in world.camps.values()}
        crit = [c.name.replace(" Relief Camp", "") for c in world.camps.values() if levels[c.id] == "critical"]
        cut = [c.name.replace(" Relief Camp", "") for c in world.camps.values() if c.cut_off]
        moving = sum(1 for t in world.trucks.values() if t.status in ("en_route", "returning", "loading"))
        waiting = sum(1 for o in world.orders.values() if o.status == "awaiting_approval")
        k = world.kpi.snapshot()

        def names(xs: list[str]) -> str:
            return ", ".join(xs) if xs else "none"

        world.bus.log(
            "coordinator",
            "sitrep",
            f"Situation report, {world.sim_time}: {len(roads)} road{'s' if len(roads) != 1 else ''} closed"
            + (f" ({', '.join(roads)})" if roads else "")
            + f". Critical camps: {names(crit)}. Cut off: {names(cut)}. {k.deliveries_total} deliveries so far, "
            f"{moving} of {len(world.trucks)} trucks working, "
            f"{waiting} order{'s' if waiting != 1 else ''} awaiting approval.",
            f"People-hours without water so far: {k.people_hours_without_water:,.0f}. "
            f"Supplies delivered: {k.supplies_delivered_kg / 1000:.1f} t. "
            f"On-time: {k.deliveries_on_time_pct:.0f}%. Truck-hours stuck: {k.truck_hours_stuck:.1f}.",
        )

    def _unmet_demand(self, world: WorldState) -> bool:
        return any(
            not self.inventory.camp_status(world, c, reachable=not c.cut_off).deficit_24h.is_empty() and not c.cut_off
            for c in world.camps.values()
        )
