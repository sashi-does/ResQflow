"""Orchestrator: decides when to run the agent cycle, and runs it.

Cycle: Monitor → Routing (fast path) → Inventory → Routing (matrix) → Coordinator → Validator → Dispatcher.
Debounces and timers are in sim time, so headless runs are reproducible.
"""

from __future__ import annotations

from app.agents.coordinator import CoordinatorAgent
from app.agents.dispatcher import DispatcherAgent
from app.agents.inventory import InventoryAgent
from app.agents.monitor import MonitorAgent
from app.agents.routing import RoutingAgent
from app.agents.types import PlanResult
from app.models import Hazard
from app.sim.runner import TimelineEvent
from app.sim.world import WorldState


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
    ) -> None:
        self.monitor = MonitorAgent(weather_mode)
        self.inventory = InventoryAgent()
        self.routing = RoutingAgent()
        self.coordinator = CoordinatorAgent(approval_threshold_kg, max_orders)
        self.dispatcher = DispatcherAgent(approval_threshold_kg, auto_approve_after_s)
        self.replan_every_s = replan_every_min * 60
        self.debounce_s = debounce_min * 60
        self.pending: list[str] = []
        self.last_cycle_at: int | None = None
        self.last_result: PlanResult | None = None
        self._free_trucks: set[str] = set()
        self.ended = False

    # ------------------------------------------------------------ Policy
    def on_step(self, world: WorldState, events: list[TimelineEvent]) -> None:
        for ev in events:
            self.handle_event(world, ev)
        for cid in self.inventory.track(world):
            self.request(f"{world.camps[cid].name} became critical")
        free = {t.id for t in world.trucks.values() if world.truck_is_free(t.id)}
        if free - self._free_trucks and self._unmet_demand(world):
            self.request("a truck became free while camps still need supplies")
        self._free_trucks = free
        self.dispatcher.auto_approve(world)
        if self.last_cycle_at is None:
            self.request("scenario start")
        elif world.sim_seconds - self.last_cycle_at >= self.replan_every_s:
            self.request("hourly re-plan")
        if self.pending and (self.last_cycle_at is None or world.sim_seconds - self.last_cycle_at >= self.debounce_s):
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
        hazard = self.monitor.add_preset(world, preset_id, source)
        if hazard:
            self.routing.on_hazard_added(world, hazard)
            self.request(f"new hazard: {hazard.label}")
        return hazard

    def remove_hazard(self, world: WorldState, hazard_id: str) -> Hazard | None:
        hazard = self.monitor.remove_hazard(world, hazard_id)
        if hazard:
            self.routing.on_hazard_removed(world, hazard)
            self.request(f"hazard cleared: {hazard.label}")
        return hazard

    def request(self, trigger: str) -> None:
        if trigger not in self.pending:
            self.pending.append(trigger)

    # ------------------------------------------------------------ the cycle
    def run_cycle(self, world: WorldState) -> PlanResult:
        trigger = "; ".join(self.pending)
        self.pending = []
        self.last_cycle_at = world.sim_seconds
        self.routing.resume_holding(world)
        statuses = self.inventory.run(world)
        self.dispatcher.recall_cut_off(world)
        statuses = {
            cid: self.inventory.camp_status(world, world.camps[cid], reachable=not st.cut_off)
            for cid, st in statuses.items()
        }  # refresh incoming after recalls
        world.bus.publish("plan.started", {"trigger": trigger})
        result = self.coordinator.plan(world, statuses, trigger)
        self.dispatcher.execute(world, result)
        world.bus.publish(
            "plan.completed",
            {
                "orders": [o.__dict__ | {"items": o.items.as_dict()} for o in result.validation.orders],
                "source": result.source,
                "attempts": result.attempts,
                "latency_ms": result.latency_ms,
                "summary": result.plan.get("summary", ""),
                "unserved": result.plan.get("unserved", []),
            },
        )
        self.last_result = result
        return result

    def _unmet_demand(self, world: WorldState) -> bool:
        return any(
            not self.inventory.camp_status(world, c, reachable=not c.cut_off).deficit_24h.is_empty() and not c.cut_off
            for c in world.camps.values()
        )
