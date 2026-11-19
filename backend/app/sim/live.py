"""Live (real-time) simulation for the API: agentic + baseline worlds in lockstep, events fanned out to WebSockets."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

from shapely.geometry import LineString, shape

from app.agents.inventory import camp_level
from app.agents.orchestrator import Orchestrator
from app.agents.types import CampLevel
from app.config import Settings
from app.geo.hazards import hazard_from_preset
from app.llm.client import display_name, make_llm
from app.models import ApprovalPolicy, Camp, Hazard
from app.sim.clock import ALLOWED_SPEEDS, STEP_S, TICK_REAL_S, SimClock
from app.sim.comparison import Comparison, build_comparison
from app.sim.scenario import load_scenario
from app.sim.world import WorldState

log = logging.getLogger(__name__)
KPI_EVERY_S = 300  # broadcast KPIs every 5 sim-min
TICKS_PER_BROADCAST = 4  # ~1 s real time


class LiveSim:
    """Owns the running comparison, the clock, and the set of connected WebSocket clients."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.clock = SimClock(speed=settings.sim_speed if settings.sim_speed in ALLOWED_SPEEDS else 120)
        self.clients: set[asyncio.Queue] = set()
        self.demo_timeline = True
        self.policy = ApprovalPolicy()
        self.llm = make_llm(settings)
        self._task: asyncio.Task | None = None
        self._ticks = 0
        self.reset(demo_timeline=True)

    # ------------------------------------------------------------ lifecycle
    def reset(self, demo_timeline: bool = True) -> None:
        old = getattr(self, "cmp", None)
        if old is not None:
            old.agentic.policy.coordinator.shutdown()  # type: ignore[attr-defined]
        self.demo_timeline = demo_timeline
        self.cmp: Comparison = build_comparison(
            self.settings, timeline=demo_timeline, headless=False, policy=self.policy, llm=self.llm
        )
        self.world.bus.subscribe(self._on_event)
        self.clock.running = False
        self.clock.reset()
        self._hazard_map: dict[str, str] = {}  # agentic hazard id -> baseline hazard id
        self._last_kpi_bucket = -1
        self.broadcast("snapshot", self.snapshot())

    async def run(self) -> None:
        """Background task: every 250 ms run the fixed steps the clock allows, broadcast ticks/KPIs."""
        while True:
            await asyncio.sleep(TICK_REAL_S)
            try:
                n = self.clock.steps_for_tick()
                if n:
                    self.advance(n)
                self._ticks += 1
                if self.clock.running and self._ticks % TICKS_PER_BROADCAST == 0:
                    self.broadcast("tick", self.tick_payload())
            except Exception:  # never let the loop die during a demo
                log.exception("simulation loop error")

    def start_background(self) -> None:
        self._task = asyncio.create_task(self.run())

    async def stop_background(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    def advance(self, steps: int) -> None:
        for _ in range(steps):
            if self.cmp.agentic.ended:
                self.clock.running = False
                break
            self.cmp.step()
        bucket = self.world.sim_seconds // KPI_EVERY_S
        if bucket != self._last_kpi_bucket:
            self._last_kpi_bucket = bucket
            self.broadcast("kpis", self.cmp.kpis())
        if self.cmp.agentic.ended:
            self.clock.running = False

    # ------------------------------------------------------------ accessors
    @property
    def world(self) -> WorldState:
        return self.cmp.agentic.world

    @property
    def baseline(self) -> WorldState:
        return self.cmp.baseline.world

    @property
    def orch(self) -> Orchestrator:
        return self.cmp.agentic.policy  # type: ignore[return-value]

    # ------------------------------------------------------------ fan-out
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=5000)
        self.clients.add(q)
        return q

    def fresh_session_reset(self) -> bool:
        """A page load with nobody else connected and the sim not running starts clean (doc 10 A1)."""
        if self.clients or self.clock.running:
            return False
        if self.world.sim_seconds == 0 and not self.world.hazards and not self.world.bus.entries:
            return False  # already pristine
        self.reset(demo_timeline=True)
        return True

    def set_policy(self, policy: ApprovalPolicy) -> ApprovalPolicy:
        self.policy = policy
        self.orch.dispatcher.set_policy(self.world, policy)
        self.broadcast("policy.updated", policy.model_dump())
        return policy

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.clients.discard(q)

    def broadcast(self, type_: str, payload: dict[str, Any]) -> None:
        msg = {"type": type_, "payload": payload}
        for q in list(self.clients):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:  # a stuck client: drop it, it will reconnect and get a snapshot
                self.clients.discard(q)

    def _on_event(self, type_: str, payload: dict[str, Any]) -> None:
        self.broadcast(type_, payload)

    # ------------------------------------------------------------ actions
    def trigger_preset(self, preset_id: str) -> Hazard | None:
        hazard = self.orch.add_preset(self.world, preset_id, source="district control room (manual report)")
        if hazard:
            preset = self.world.scenario.presets[preset_id]
            bh = hazard_from_preset(
                preset, self.baseline.graph, self.baseline.new_hazard_id(), self.baseline.sim_seconds
            )
            self.baseline.add_hazard(bh)
            self._hazard_map[hazard.id] = bh.id
        return hazard

    def add_custom(self, label: str, polygon: dict[str, Any]) -> Hazard:
        poly = shape(polygon)
        g = self.world.graph
        edges = [
            eid for eid, e in g.edges.items() if LineString([(lon, lat) for lat, lon in e.geometry]).intersects(poly)
        ]
        hazard = Hazard(
            id=self.world.new_hazard_id(),
            label=label or "Reported flooding",
            kind="flood",
            polygon=polygon,
            edge_ids=edges,
            created_at_sim=self.world.sim_seconds,
        )
        self.world.add_hazard(hazard)
        n = len(edges)
        self.world.bus.log(
            "monitor",
            "hazard.added",
            f"Flood reported: {hazard.label}. {n} road segment{'s' if n != 1 else ''} closed.",
            "Drawn on the map by the district officer.",
            hazard_ids=[hazard.id],
            edge_ids=edges,
        )
        self.world.bus.publish(
            "hazard.added", {"hazard": hazard.model_dump(), "blocked_edge_ids": sorted(self.world.blocked_edge_ids())}
        )
        self.orch.routing.on_hazard_added(self.world, hazard)
        self.orch.request(f"new hazard: {hazard.label}")
        bh = hazard.model_copy(update={"id": self.baseline.new_hazard_id()})
        self.baseline.add_hazard(bh)
        self._hazard_map[hazard.id] = bh.id
        return hazard

    def remove_hazard(self, hazard_id: str) -> bool:
        if hazard_id not in self.world.hazards:
            return False
        preset_id = self.world.hazards[hazard_id].preset_id
        self.orch.remove_hazard(self.world, hazard_id)
        bid = self._hazard_map.pop(hazard_id, None)
        if bid:
            self.baseline.remove_hazard(bid)
        elif preset_id:  # scripted hazards: match the baseline copy by preset
            for k, h in list(self.baseline.hazards.items()):
                if h.preset_id == preset_id:
                    self.baseline.remove_hazard(k)
        return True

    def remove_all_floods(self) -> list[str]:
        ids = [hid for hid, h in self.world.hazards.items() if h.kind != "rain_advisory"]
        for hid in ids:
            self.remove_hazard(hid)
        return ids

    def replan(self) -> None:
        self.orch.request("manual re-plan request")
        if not self.orch.coordinator.busy:  # never two planning cycles at once
            self.orch.run_cycle(self.world)

    def approve(self, order_id: str, note: str | None) -> dict:
        order = self.orch.dispatcher.approve(self.world, order_id, note)
        return order.model_dump()

    def reject(self, order_id: str, note: str | None) -> dict:
        order = self.orch.dispatcher.reject(self.world, order_id, note)
        self.orch.request("order rejected by the district officer")
        return order.model_dump()

    # ------------------------------------------------------------ views
    def camp_level(self, camp: Camp) -> CampLevel:
        return camp_level(self.world.days_of_cover(camp))

    def camp_view(self, camp: Camp) -> dict[str, Any]:
        w = self.world
        return {
            "id": camp.id,
            "stock": camp.stock.as_dict(),
            "incoming": w.incoming(camp.id).as_dict(),
            "days_of_cover": round(w.days_of_cover(camp), 3),
            "water_days": round(w.water_days(camp), 3),
            "status": self.camp_level(camp),
            "cut_off": camp.cut_off,
            "unserved_reason": camp.unserved_reason,
            "priority_boost": camp.priority_boost,
        }

    def warehouse_view(self, wid: str) -> dict[str, Any]:
        w = self.world.warehouses[wid]
        return {
            "id": w.id,
            "stock": w.stock.as_dict(),
            "available": self.world.available(w).as_dict(),
            "reserve": self.world.reserve_held(w).as_dict(),
        }

    def truck_view(self, tid: str) -> dict[str, Any]:
        t = self.world.trucks[tid]
        order = self.world.orders.get(t.order_id or "")
        return {
            "id": t.id,
            "status": t.status,
            "lat": t.position.lat,
            "lon": t.position.lon,
            "at_warehouse": t.at_warehouse,
            "path_coords": self.world.truck_path_coords(t),
            "order_id": t.order_id,
            "cargo": t.cargo.as_dict(),
            "eta_sim_seconds": t.eta_sim_seconds,
            "heading_to": order.camp_id if order and t.leg == "delivery" else t.destination_node,
            "leg": t.leg,
        }

    def sim_view(self) -> dict[str, Any]:
        return {
            "sim_time": self.world.sim_time,
            "sim_seconds": self.world.sim_seconds,
            "running": self.clock.running,
            "speed": self.clock.speed,
            "demo_timeline": self.demo_timeline,
            "ended": self.cmp.agentic.ended,
            "step_s": STEP_S,
        }

    def coordinator_view(self) -> dict[str, Any]:
        r = self.orch.last_result
        return {
            "busy": self.orch.coordinator.busy,
            "label": self.orch.coordinator.label,
            "model": display_name(self.llm.model) if self.llm.available else None,
            "last_plan_source": r.source if r else None,
            "last_latency_ms": r.latency_ms if r else None,
            "attempts": r.attempts if r else 0,
            "provider": self.settings.effective_llm_provider,
        }

    def snapshot(self) -> dict[str, Any]:
        w = self.world
        active = [o.model_dump() for o in w.orders.values() if o.status in ("awaiting_approval", "dispatched")]
        return {
            "sim": self.sim_view(),
            "trucks": [self.truck_view(t) for t in sorted(w.trucks)],
            "warehouses": [self.warehouse_view(x) for x in sorted(w.warehouses)],
            "camps": [self.camp_view(c) for c in w.camps.values()],
            "hazards": [h.model_dump() for h in w.hazards.values()],
            "blocked_edge_ids": sorted(w.blocked_edge_ids()),
            "orders": active,
            "kpis": self.cmp.kpis(),
            "coordinator": self.coordinator_view(),
            "policy": self.policy.model_dump(),
            "log": [e.model_dump() for e in w.bus.entries[-200:]],
        }

    def tick_payload(self) -> dict[str, Any]:
        w = self.world
        return {
            "sim_time": w.sim_time,
            "sim_seconds": w.sim_seconds,
            "running": self.clock.running,
            "speed": self.clock.speed,
            "ended": self.cmp.agentic.ended,
            "trucks": [
                {"id": t.id, "lat": t.position.lat, "lon": t.position.lon, "status": t.status}
                for t in w.trucks.values()
            ],
            "camps": [self.camp_view(c) for c in w.camps.values()],
            "warehouses": [self.warehouse_view(x) for x in sorted(w.warehouses)],
        }


_live: LiveSim | None = None


def get_live() -> LiveSim:
    global _live
    if _live is None:
        from app.config import get_settings

        load_scenario()
        _live = LiveSim(get_settings())
    return _live
