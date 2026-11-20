"""Live (real-time) simulation for the API: agentic + baseline worlds in lockstep, events fanned out to WebSockets."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Any

from shapely.geometry import LineString, shape

from app.agents.field_intake import FieldIntakeAgent, ParseOutcome
from app.agents.inventory import camp_level
from app.agents.orchestrator import Orchestrator
from app.agents.report import assemble, build_facts, llm_narrative
from app.agents.types import CampLevel
from app.auth.context import who
from app.config import Settings
from app.geo.hazards import hazard_from_preset
from app.llm.client import display_name, make_llm
from app.llm.journal import JOURNAL
from app.models import ApprovalPolicy, Camp, FieldReport, Hazard, Supplies
from app.persist import Store
from app.sim import alerts as camp_alerts
from app.sim.clock import ALLOWED_SPEEDS, STEP_S, TICK_REAL_S, SimClock
from app.sim.comparison import Comparison, build_comparison
from app.sim.scenario import DEFAULT_CASE, get_case, load_scenario
from app.sim.world import WorldState
from app.text import fmt_items, fmt_signed

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
        self.store = Store(settings.database_url)
        self.store.start()
        self.run_id: str | None = None
        JOURNAL.sink = lambda call: self.store.llm_call(self.run_id, call.as_dict())
        self.case_id = DEFAULT_CASE
        self._task: asyncio.Task | None = None
        self._ticks = 0
        self.reset(demo_timeline=True)

    # ------------------------------------------------------------ lifecycle
    def reset(self, demo_timeline: bool = True, case: str | None = None) -> None:
        old = getattr(self, "cmp", None)
        if old is not None:
            old.agentic.policy.coordinator.shutdown()  # type: ignore[attr-defined]
        self.demo_timeline = demo_timeline
        if case is not None:
            get_case(case)  # KeyError for an unknown case
            self.case_id = case
        sc = load_scenario(case=self.case_id)
        self.cmp: Comparison = build_comparison(
            self.settings, scenario=sc, timeline=demo_timeline, headless=False, policy=self.policy, llm=self.llm
        )
        self.run_id = self.store.new_run(
            case_id=self.case_id,
            case_title=sc.raw["case"]["title"] if demo_timeline else "Free play (no scripted events)",
            mode="live",
            seed=self.settings.seed,
            provider=self.settings.effective_llm_provider if self.llm.available else "mock",
            model=self.llm.model if self.llm.available else "heuristic",
        )
        self._ended_saved = False
        self.world.bus.subscribe(self._on_event)
        self.clock.running = False
        self.clock.reset()
        self._hazard_map: dict[str, str] = {}  # agentic hazard id -> baseline hazard id
        self.field_reports: dict[str, FieldReport] = {}
        self.report: dict[str, Any] | None = None
        self._report_task: asyncio.Task | None = None
        self.receipts: dict[str, dict[str, Any]] = {}
        self.pending_reroute: dict[str, dict[str, Any]] = {}  # truck id -> latest unacknowledged route change
        self.alerts: list[dict[str, Any]] = []  # camp alerts (doc 11 §3.2), newest last
        self._alerted: set[tuple[str, str]] = set()
        self.intake = FieldIntakeAgent(self.llm)
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
            if self.orch.poll_plan(self.world):
                break  # the clock waits while the AI plans: both runs pause, so the comparison stays fair
            self.cmp.step()
        bucket = self.world.sim_seconds // KPI_EVERY_S
        if bucket != self._last_kpi_bucket:
            self._last_kpi_bucket = bucket
            k = self.cmp.kpis()
            self.broadcast("kpis", k)
            if self.world.sim_seconds % 3600 < KPI_EVERY_S and self.run_id:  # hourly history
                self.store.kpis(self.run_id, self.world.sim_seconds, self.world.sim_time, k["agentic"], k["baseline"])
        if self.cmp.agentic.ended:
            self.clock.running = False
            self._save_end(None)
            self._schedule_report()

    def _save_end(self, report: dict[str, Any] | None) -> None:
        if self.run_id and (report is not None or not self._ended_saved):
            self._ended_saved = True
            k = self.cmp.kpis()
            self.store.end_run(self.run_id, self.world.sim_time, k["agentic"], k["baseline"], report)

    def _schedule_report(self) -> None:
        """Scenario over: write the after-action report once, in the background (needs a running event loop)."""
        if self.report is not None or self._report_task is not None:
            return
        with contextlib.suppress(RuntimeError):  # no event loop (sync tests)
            self._report_task = asyncio.get_running_loop().create_task(self.generate_report())

    async def generate_report(self) -> dict[str, Any]:
        f = build_facts(self.world, self.cmp.kpis(), list(self.field_reports.values()))  # numbers: sim thread, now
        narrative, note = None, ""
        if self.llm.available:
            narrative, note = await asyncio.to_thread(llm_narrative, self.llm, f)
        self.report = assemble(f, narrative, note, self.llm)
        k = self.report["kpis"]
        self.world.bus.log(
            "system",
            "report.ready",
            f"After-action report ready ({self.report['generated_at_sim']}): people-hours without water "
            f"{k['agentic']['people_hours_without_water']:,.0f} vs {k['baseline']['people_hours_without_water']:,.0f} "
            "for the static plan.",
            self.report["narrative_note"],
        )
        self.broadcast("report.ready", self.report)
        self._save_end(self.report)
        return self.report

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
        if type_ in ("field_report.created", "field_report.updated") and self.run_id:
            self.store.field_report(self.run_id, payload)
        msg = {"type": type_, "payload": payload}
        for q in list(self.clients):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:  # a stuck client: drop it, it will reconnect and get a snapshot
                self.clients.discard(q)

    def _on_event(self, type_: str, payload: dict[str, Any]) -> None:
        if type_ == "log" and self.run_id:
            self.store.log_entry(self.run_id, payload)
        if type_ == "truck.rerouted":
            self.pending_reroute[payload["truck_id"]] = {
                "message": payload.get("message", ""),
                "at": self.world.sim_time,
                "new_eta_sim_seconds": payload.get("new_eta_sim_seconds"),
                "cycle": self.world.bus.forced_cycle or self.world.bus.open_cycle,  # the re-route's cycle
            }
        self.broadcast(type_, payload)
        self._maybe_alert(type_, payload)

    def _maybe_alert(self, type_: str, payload: dict[str, Any]) -> None:
        """Camp alerts on dispatch, re-route (delay) and arrival; text is templated from world numbers."""
        w = self.world
        if type_ == "order.updated" and payload.get("status") in ("dispatched", "delivered"):
            oid, status = payload["id"], payload["status"]
            if (oid, status) in self._alerted:
                return
            self._alerted.add((oid, status))
            o = w.orders[oid]
            if status == "dispatched":
                eta = w.trucks[o.truck_id].eta_sim_seconds
                text = camp_alerts.dispatch(o.truck_id, o.items, w.fmt(eta) if eta else None)
                kind = "dispatch"
            else:
                text, kind = camp_alerts.arrival(o.truck_id, o.items), "arrival"
        elif type_ == "truck.rerouted":
            t = w.trucks[payload["truck_id"]]
            o = w.orders.get(t.order_id or "")
            if o is None or o.status != "dispatched" or t.leg != "delivery":
                return
            eta = payload.get("new_eta_sim_seconds")
            text, kind = (
                camp_alerts.delay(t.id, payload.get("reason", "road closed"), w.fmt(eta) if eta else None),
                "delay",
            )
        else:
            return
        alert = camp_alerts.make(len(self.alerts) + 1, o.camp_id, w.sim_time, kind, o.id, o.truck_id, text)
        self.alerts.append(alert)
        self.broadcast("camp.alert", alert)

    # ------------------------------------------------------------ roles (doc 10 C)
    def new_field_report(self, camp_id: str, text: str, origin: str = "camp") -> FieldReport:
        w = self.world
        report = FieldReport(
            id=f"R-{len(self.field_reports) + 1}",
            camp_id=camp_id,
            text=text.strip(),
            sim_time=w.sim_time,
            sim_seconds=w.sim_seconds,
            origin=origin,  # type: ignore[arg-type]
        )
        self.field_reports[report.id] = report
        camp = w.camps[camp_id]
        w.bus.log(
            "field_intake",
            "field_report.received",
            f"Field report received from {camp.name}.",
            f'"{report.text}"',
            camp_ids=[camp_id],
        )
        self.broadcast("field_report.created", report.model_dump())
        return report

    def parse_inputs(self, camp_id: str) -> tuple[str, int, float]:
        camp = self.world.camps[camp_id]
        return camp.name, camp.population, self.world.water_days(camp)

    def finish_field_report(self, report: FieldReport, outcome: ParseOutcome) -> FieldReport:
        if report.id not in self.field_reports:  # the world was reset while the AI was reading
            return report
        if outcome.latency_ms is not None:
            self.world.bus.record_ms("field_intake", outcome.latency_ms)
        self.intake.apply(self.world, report, outcome)
        if report.status == "applied":
            self._mirror_report_to_baseline(report)
            self.orch.request(f"field report from {self.world.camps[report.camp_id].name}")
        self.broadcast("field_report.updated", report.model_dump())
        return report

    def decide_field_report(self, report_id: str, decision: str) -> FieldReport:
        report = self.field_reports[report_id]
        if report.status not in ("pending_confirmation", "unparsed"):
            return report
        if decision == "confirm":
            self.intake.confirm(self.world, report)
            self._mirror_report_to_baseline(report)
            self.orch.request(f"confirmed field report from {self.world.camps[report.camp_id].name}")
        else:
            self.intake.reject(self.world, report)
        self.broadcast("field_report.updated", report.model_dump())
        return report

    def _mirror_report_to_baseline(self, report: FieldReport) -> None:
        """Ground truth (more people, empty stock) is the same in both worlds, so the comparison stays fair."""
        if report.parsed is None:
            return
        self.intake._apply_numbers(self.baseline, self.baseline.camps[report.camp_id], report.parsed)

    def agents_view(self) -> dict[str, Any]:
        stats = self.world.bus.agent_stats()
        coord = stats.setdefault(
            "coordinator", {"count": 0, "last_summary": None, "last_at": None, "avg_latency_ms": None}
        )
        coord["model"] = display_name(self.llm.model) if self.llm.available else "offline (heuristic)"
        coord["retries"] = sum(1 for e in self.world.bus.entries if e.kind == "plan.rejected")
        coord["busy"] = self.orch.coordinator.busy
        return stats

    def touch(self) -> None:
        """Push current state to every role view now (ticks only flow while the sim runs)."""
        self.broadcast("tick", self.tick_payload())

    def acknowledge(self, truck_id: str) -> dict[str, Any]:
        pending = self.pending_reroute.pop(truck_id, None)
        what = pending["message"] if pending else "its current route"
        self.world.bus.log(
            "human",
            "driver.ack",
            f"{who(f'The driver of Truck {truck_id}')} acknowledged: {what}",
            truck_ids=[truck_id],
            cycle=pending.get("cycle") if pending else None,  # the answer belongs with the re-route it answers
        )
        self.broadcast("truck.ack", {"truck_id": truck_id, "sim_time": self.world.sim_time})
        return {"ok": True}

    def road_report(self, truck_id: str, edge_id: str, kind: str, note: str = "") -> Hazard:
        w = self.world
        e = w.graph.edges[edge_id]
        road = e.road.split(" (")[0]
        for h in w.hazards.values():  # a second report on the same road verifies it
            if h.kind == "driver_report" and edge_id in h.edge_ids and not h.verified and truck_id not in h.reported_by:
                h.reported_by.append(truck_id)
                w.bus.log(
                    "monitor",
                    "hazard.second_source",
                    f"Second report of {kind} on {road} (Truck {truck_id}): treating it as verified.",
                    truck_ids=[truck_id],
                    hazard_ids=[h.id],
                    edge_ids=[edge_id],
                )
                self._verify(h)
                return h
        hazard = Hazard(
            id=w.new_hazard_id(),
            label=f"{kind.capitalize()} on {road} (driver report)",
            kind="driver_report",
            edge_ids=[edge_id],
            severity="medium",
            created_at_sim=w.sim_seconds,
            verified=False,
            source="driver",
            reported_by=[truck_id],
        )
        w.add_hazard(hazard)
        w.bus.log(
            "monitor",
            "hazard.unverified",
            f"Unverified report from the driver of Truck {truck_id}: {kind} on {road} between "
            f"{w.node_name(e.a)} and {w.node_name(e.b)}. Not closing the road yet."
            + (f' Driver\'s note: "{note}"' if note else ""),
            "One report isn't enough to close a highway. It needs a second source or Command's confirmation; "
            "then every "
            "truck using that road is re-routed.",
            truck_ids=[truck_id],
            hazard_ids=[hazard.id],
            edge_ids=[edge_id],
        )
        w.bus.publish("hazard.added", {"hazard": hazard.model_dump(), "blocked_edge_ids": sorted(w.blocked_edge_ids())})
        return hazard

    def mark_loaded(self, order_id: str) -> dict[str, Any]:
        """Warehouse manager confirms the truck is loaded. Logged for accountability; sim timing is unchanged."""
        w = self.world
        o = w.orders[order_id]
        if not o.loaded_confirmed:
            o.loaded_confirmed = True
            w.bus.log(
                "human",
                "order.loaded",
                f"{who('The warehouse manager')} confirmed Truck {o.truck_id} loaded at "
                f"{w.warehouses[o.warehouse_id].name} for {w.camps[o.camp_id].name}: {fmt_items(o.items)}.",
                order_ids=[o.id],
                truck_ids=[o.truck_id],
            )
            w.bus.publish("order.updated", o.model_dump())
        return o.model_dump()

    def truck_history(self, truck_id: str) -> list[dict[str, Any]]:
        """Completed trips for the driver's History page (numbers from the world and the KPI tracker)."""
        w = self.world
        out = []
        for o in w.orders.values():
            if o.truck_id != truck_id or o.status != "delivered" or o.delivered_at_sim is None:
                continue
            out.append(
                {
                    "order_id": o.id,
                    "warehouse": w.warehouses[o.warehouse_id].name,
                    "camp": w.camps[o.camp_id].name,
                    "items": o.items.as_dict(),
                    "weight_kg": o.weight_kg,
                    "dispatched": w.fmt(o.created_at_sim),
                    "delivered": w.fmt(o.delivered_at_sim),
                    "minutes": round((o.delivered_at_sim - o.created_at_sim) / 60),
                    "on_time": o.id not in w.kpi.late_order_ids,
                }
            )
        return sorted(out, key=lambda r: r["delivered"], reverse=True)

    def confirm_hazard(self, hazard_id: str) -> Hazard:
        h = self.world.hazards[hazard_id]
        if not h.verified:
            self.world.bus.log(
                "human",
                "hazard.confirmed",
                f"{who('Command')} confirmed: {h.label}. Closing the road.",
                hazard_ids=[h.id],
                edge_ids=list(h.edge_ids),
            )
            self._verify(h)
        return h

    def _verify(self, h: Hazard) -> None:
        w = self.world
        h.verified = True
        w.bus.publish("hazard.updated", {"hazard": h.model_dump(), "blocked_edge_ids": sorted(w.blocked_edge_ids())})
        self.orch.routing.on_hazard_added(w, h)
        self.orch.request(f"road closure confirmed: {h.label}")
        bh = h.model_copy(update={"id": self.baseline.new_hazard_id()})
        self.baseline.add_hazard(bh)
        self._hazard_map[h.id] = bh.id

    def adjust_stock(self, warehouse_id: str, delta: Supplies, note: str) -> dict[str, Any]:
        for world in (self.world, self.baseline):
            wh = world.warehouses[warehouse_id]
            wh.stock = (wh.stock + delta).clamp0()
        wh = self.world.warehouses[warehouse_id]
        self.world.bus.log(
            "human",
            "stock.adjusted",
            f"{wh.name} warehouse stock adjusted by {who('the warehouse manager')}: {fmt_signed(delta)}."
            + (f' Note: "{note}"' if note else ""),
            "Applied to both runs (same ground truth); the coordinator re-plans with the new availability.",
        )
        self.orch.request(f"stock adjusted at {wh.name}")
        return self.warehouse_view(warehouse_id)

    def confirm_delivery(self, camp_id: str, order_id: str, received: Supplies) -> dict[str, Any]:
        w = self.world
        order = w.orders[order_id]
        camp = w.camps[camp_id]
        shortfall = (order.items - received).clamp0()
        if shortfall.is_empty():
            w.bus.log(
                "human",
                "delivery.confirmed",
                f"{who(camp.name)} confirmed delivery {order_id} received in full.",
                camp_ids=[camp_id],
                order_ids=[order_id],
            )
        else:
            camp.stock = (camp.stock - shortfall).clamp0()  # the sim credited the full load; correct the record
            w.bus.log(
                "human",
                "delivery.shortfall",
                f"{who(camp.name)} confirmed delivery {order_id} but it was short: {fmt_items(shortfall)} missing. "
                "Camp stock corrected and flagged to Command.",
                "The coordinator will plan the missing amount in its next cycle.",
                camp_ids=[camp_id],
                order_ids=[order_id],
            )
            self.orch.request(f"delivery shortfall at {camp.name}")
        self.receipts[order_id] = {"received": received.as_dict(), "shortfall": shortfall.as_dict()}
        return {"ok": True, "shortfall": shortfall.as_dict()}

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
            "population": camp.population,
            "urgent_needs": list(camp.urgent_needs),
            "health_flags": list(camp.health_flags),
        }

    def warehouse_view(self, wid: str) -> dict[str, Any]:
        w = self.world.warehouses[wid]
        return {
            "id": w.id,
            "stock": w.stock.as_dict(),
            "available": self.world.available(w).as_dict(),
            "reserve": self.world.reserve_held(w).as_dict(),
        }

    def route_roads(self, tid: str) -> list[dict[str, Any]]:
        t = self.world.trucks[tid]
        g = self.world.graph
        out = []
        for i, eid in enumerate(t.path_edge_ids):
            e = g.edges[eid]
            out.append(
                {
                    "edge_id": eid,
                    "road": e.road,
                    "from": g.nodes[t.path_nodes[i]].name,
                    "to": g.nodes[t.path_nodes[i + 1]].name,
                    "km": round(e.length_km),
                    "blocked": eid in self.world.blocked_edge_ids(),
                }
            )
        return out

    def job_view(self, tid: str) -> dict[str, Any] | None:
        t = self.world.trucks[tid]
        order = self.world.orders.get(t.order_id or "")
        if order is None:
            return None
        return {
            "order_id": order.id,
            "status": order.status,
            "from": self.world.warehouses[order.warehouse_id].name,
            "to": self.world.camps[order.camp_id].name,
            "camp_id": order.camp_id,
            "items": order.items.as_dict(),
            "weight_kg": order.weight_kg,
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
            "route_roads": self.route_roads(t.id),
            "pending_reroute": self.pending_reroute.get(t.id),
            "job": self.job_view(t.id),
        }

    def sim_view(self) -> dict[str, Any]:
        return {
            "sim_time": self.world.sim_time,
            "sim_seconds": self.world.sim_seconds,
            "running": self.clock.running,
            "speed": self.clock.speed,
            "demo_timeline": self.demo_timeline,
            "case_id": self.case_id,
            "run_id": self.run_id,
            "db": self.store.status,
            "ended": self.cmp.agentic.ended,
            "held": self.orch.coordinator.busy,
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
            "field_reports": [r.model_dump() for r in self.field_reports.values()],
            "agents": self.agents_view(),
            "receipts": self.receipts,
            "alerts": self.alerts[-100:],
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
            "held": self.orch.coordinator.busy,
            "trucks": [self.truck_view(t) for t in sorted(w.trucks)],  # full views: role pages are live from WS
            "camps": [self.camp_view(c) for c in w.camps.values()],
            "warehouses": [self.warehouse_view(x) for x in sorted(w.warehouses)],
            "agents": self.agents_view(),
        }


_live: LiveSim | None = None


def get_live() -> LiveSim:
    global _live
    if _live is None:
        from app.config import get_settings

        load_scenario()
        _live = LiveSim(get_settings())
    return _live
