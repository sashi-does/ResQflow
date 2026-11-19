"""REST routes under /api (docs/05_API_CONTRACT.md)."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.agents.copilot import ask, freeze
from app.agents.field_intake import load_demo_reports
from app.auth.context import who
from app.auth.security import check_scope, current_user, issue_token, require_role
from app.auth.users import User, authenticate, demo_cards
from app.auth.visibility import Visibility
from app.config import get_settings
from app.geo.hazards import hazard_from_preset
from app.models import ApprovalPolicy, Supplies
from app.sim.live import get_live
from app.sim.scenario import load_scenario

VERSION = "0.1.0"

router = APIRouter(prefix="/api")

# Role guards (doc 11 §1). Officers can read everything; field roles only their own scope.
OFFICER = [Depends(require_role("officer"))]
AnyUser = Depends(current_user)
CAMP = Depends(require_role("camp"))
DRIVER = Depends(require_role("driver"))
WAREHOUSE = Depends(require_role("warehouse"))
CAMP_OR_OFFICER = Depends(require_role("camp", "officer"))
DRIVER_OR_OFFICER = Depends(require_role("driver", "officer"))
WAREHOUSE_OR_OFFICER = Depends(require_role("warehouse", "officer"))


def _vis(user: User) -> Visibility:
    live = get_live()
    wh = live.world.warehouses.get(user.scope_id)
    return Visibility(user, live.world.orders, wh.name if wh else "")


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def login(body: LoginBody) -> dict:
    user = await asyncio.to_thread(authenticate, body.username, body.password)  # bcrypt is slow on purpose
    if user is None:
        raise HTTPException(401, "wrong username or password")
    return {"token": issue_token(user), "user": user.public()}


@router.get("/auth/me")
async def me(user: User = AnyUser) -> dict:
    return user.public()


@router.get("/auth/demo-users")
async def demo_users() -> list[dict]:
    return demo_cards()


class ResetBody(BaseModel):
    demo_timeline: bool = True


class SpeedBody(BaseModel):
    multiplier: Literal[30, 120, 600]


class TriggerBody(BaseModel):
    preset_id: str


class CustomHazardBody(BaseModel):
    label: str = "Reported flooding"
    polygon: dict[str, Any]


class ApprovalBody(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = None


class AdvanceBody(BaseModel):
    minutes: int = 30


@router.get("/health")
async def health() -> dict:
    s = get_settings()
    return {
        "ok": True,
        "llm_provider": s.effective_llm_provider,
        "llm_model": s.llm_model,
        "weather_mode": s.weather_mode,
        "demo_inject_fault": s.demo_inject_fault,
        "version": VERSION,
    }


@router.get("/scenario", dependencies=[AnyUser])
async def scenario() -> dict:
    """Static scenario data: nodes, edges (with geometry), warehouses, camps, trucks, presets."""
    sc = load_scenario()
    g = sc.graph
    presets = []
    for p in sc.presets.values():
        h = hazard_from_preset(p, g, p["id"], 0)
        presets.append({**p, "polygon": h.polygon, "edge_ids": h.edge_ids})
    return {
        "id": sc.raw["id"],
        "name": sc.raw["name"],
        "start_clock": sc.raw["start_clock"],
        "nodes": [n.model_dump() for n in g.nodes.values()],
        "edges": [e.model_dump(exclude={"blocked", "blocked_by"}) for e in g.edges.values()],
        "warehouses": sc.raw["warehouses"],
        "camps": sc.raw["camps"],
        "trucks": sc.raw["trucks"],
        "presets": presets,
        "constants": sc.constants | {"status_thresholds": {"critical_below_days": 0.5, "low_below_days": 1.0}},
        "timeline": sc.raw["timeline"],
    }


@router.get("/state")
async def state(user: User = AnyUser) -> dict:
    return _vis(user).snapshot(get_live().snapshot())


@router.post("/sim/start", dependencies=OFFICER)
async def sim_start() -> dict:
    live = get_live()
    live.clock.running = not live.cmp.agentic.ended
    live.broadcast("tick", live.tick_payload())
    return {"running": live.clock.running}


@router.post("/sim/pause", dependencies=OFFICER)
async def sim_pause() -> dict:
    live = get_live()
    live.clock.running = False
    live.broadcast("tick", live.tick_payload())
    return {"running": False}


@router.post("/sim/reset", dependencies=OFFICER)
async def sim_reset(body: ResetBody | None = None) -> dict:
    live = get_live()
    live.reset(demo_timeline=body.demo_timeline if body else True)
    return live.snapshot()


@router.post("/sim/speed", dependencies=OFFICER)
async def sim_speed(body: SpeedBody) -> dict:
    live = get_live()
    live.clock.speed = body.multiplier
    live.broadcast("tick", live.tick_payload())
    return {"speed": live.clock.speed}


@router.post("/sim/advance", dependencies=OFFICER)
async def sim_advance(body: AdvanceBody) -> dict:
    """Dev/test helper: advance sim time by N minutes immediately (fixed 30 s steps)."""
    live = get_live()
    live.advance(max(0, body.minutes) * 2)
    live.broadcast("tick", live.tick_payload())
    return live.sim_view()


class FaultBody(BaseModel):
    enabled: bool


@router.post("/sim/inject-fault", dependencies=OFFICER)
async def inject_fault(body: FaultBody) -> dict:
    """Demo tool: corrupt one coordinator plan per demo run so the Validator visibly stops it (next Run Demo)."""
    get_settings().demo_inject_fault = body.enabled
    return {"enabled": body.enabled}


@router.post("/demo/run", dependencies=OFFICER)
async def demo_run() -> dict:
    live = get_live()
    live.reset(demo_timeline=True)
    live.clock.running = True
    live.broadcast("tick", live.tick_payload())
    return {"running": True, "sim": live.sim_view()}


@router.post("/hazards/trigger", dependencies=OFFICER)
async def hazards_trigger(body: TriggerBody) -> dict:
    live = get_live()
    if body.preset_id not in live.world.scenario.presets:
        raise HTTPException(404, f"unknown preset {body.preset_id}")
    hazard = live.trigger_preset(body.preset_id)
    live.touch()
    if hazard is None:
        existing = next(h for h in live.world.hazards.values() if h.preset_id == body.preset_id)
        return existing.model_dump()
    return hazard.model_dump()


@router.post("/hazards/custom", dependencies=OFFICER)
async def hazards_custom(body: CustomHazardBody) -> dict:
    if body.polygon.get("type") not in ("Polygon", "MultiPolygon"):
        raise HTTPException(422, "polygon must be a GeoJSON Polygon or MultiPolygon")
    return get_live().add_custom(body.label, body.polygon).model_dump()


@router.delete("/hazards/{hazard_id}", dependencies=OFFICER)
async def hazards_delete(hazard_id: str) -> dict:
    live = get_live()
    if hazard_id == "all":
        return {"removed": True, "hazard_ids": live.remove_all_floods()}
    if not live.remove_hazard(hazard_id):
        raise HTTPException(404, f"no active hazard {hazard_id}")
    return {"removed": True}


@router.post("/replan", dependencies=OFFICER)
async def replan() -> dict:
    get_live().replan()
    return {"started": True}


@router.get("/orders")
async def orders(status: str | None = None, user: User = AnyUser) -> list[dict]:
    w = get_live().world
    vis = _vis(user)
    out = [o.model_dump() for o in w.orders.values() if status is None or o.status == status]
    return [o for o in out if vis.order(o)]


@router.post("/orders/{order_id}/loaded")
async def order_loaded(order_id: str, user: User = WAREHOUSE_OR_OFFICER) -> dict:
    live = get_live()
    order = live.world.orders.get(order_id)
    if order is None:
        raise HTTPException(404, f"unknown order {order_id}")
    check_scope(user, "warehouse", order.warehouse_id)
    if order.status != "dispatched":
        raise HTTPException(409, f"order {order_id} is {order.status}, not on the loading queue")
    out = live.mark_loaded(order_id)
    live.touch()
    return out


@router.post("/approvals/{order_id}", dependencies=OFFICER)
async def approvals(order_id: str, body: ApprovalBody) -> dict:
    live = get_live()
    order = live.world.orders.get(order_id)
    if order is None:
        raise HTTPException(404, f"unknown order {order_id}")
    if order.status != "awaiting_approval":
        raise HTTPException(409, f"order {order_id} is {order.status}, not awaiting approval")
    out = live.approve(order_id, body.note) if body.decision == "approve" else live.reject(order_id, body.note)
    live.touch()
    return out


@router.get("/log", dependencies=OFFICER)
async def log_entries(limit: int = Query(200, ge=1, le=2000), agent: str | None = None) -> list[dict]:
    entries = get_live().world.bus.entries
    picked = [e for e in reversed(entries) if agent is None or e.agent == agent]
    return [e.model_dump() for e in picked[:limit]]


@router.get("/policy", dependencies=OFFICER)
async def get_policy() -> dict:
    return get_live().policy.model_dump()


@router.post("/policy", dependencies=OFFICER)
async def set_policy(body: ApprovalPolicy) -> dict:
    return get_live().set_policy(body).model_dump()


class ReportBody(BaseModel):
    text: str
    source: Literal["camp", "demo"] = "camp"


class DecisionBody(BaseModel):
    decision: Literal["confirm", "reject"]


class DemoReportBody(BaseModel):
    report_id: str


class RoadReportBody(BaseModel):
    edge_id: str
    kind: Literal["waterlogged", "blocked", "landslide"]
    note: str = ""


class AdjustBody(BaseModel):
    delta: Supplies
    note: str = ""


class ReceiptBody(BaseModel):
    received: Supplies


async def _submit_report(camp_id: str, text: str, origin: str) -> dict:
    live = get_live()
    if camp_id not in live.world.camps:
        raise HTTPException(404, f"unknown camp {camp_id}")
    if not text.strip():
        raise HTTPException(422, "empty report")
    report = live.new_field_report(camp_id, text[:2000], origin)
    name, pop, water_days = live.parse_inputs(camp_id)
    outcome = await asyncio.to_thread(live.intake.parse, name, pop, water_days, report.text)  # LLM off the loop
    out = live.finish_field_report(report, outcome).model_dump()
    live.touch()
    return out


@router.post("/camps/{camp_id}/reports")
async def camp_report(camp_id: str, body: ReportBody, user: User = CAMP) -> dict:
    check_scope(user, "camp", camp_id)
    return await _submit_report(camp_id, body.text, body.source)


@router.get("/camps/{camp_id}/alerts")
async def camp_alerts(camp_id: str, user: User = CAMP_OR_OFFICER) -> list[dict]:
    check_scope(user, "camp", camp_id)
    return [a for a in reversed(get_live().alerts) if a["camp_id"] == camp_id]


@router.get("/field-reports")
async def field_reports(status: str | None = None, user: User = AnyUser) -> list[dict]:
    vis = _vis(user)
    reports = [r.model_dump() for r in get_live().field_reports.values() if status is None or r.status == status]
    return [r for r in reports if vis.report(r)]


@router.post("/field-reports/{report_id}/decision", dependencies=OFFICER)
async def field_report_decision(report_id: str, body: DecisionBody) -> dict:
    live = get_live()
    if report_id not in live.field_reports:
        raise HTTPException(404, f"unknown report {report_id}")
    out = live.decide_field_report(report_id, body.decision).model_dump()
    live.touch()
    return out


@router.get("/demo/reports", dependencies=[Depends(require_role("camp", "officer"))])
async def demo_reports() -> list[dict]:
    return [{k: v for k, v in r.items() if k != "recorded"} for r in load_demo_reports()]


@router.post("/demo/field-report", dependencies=OFFICER)
async def demo_field_report(body: DemoReportBody) -> dict:
    rep = next((r for r in load_demo_reports() if r["id"] == body.report_id), None)
    if rep is None:
        raise HTTPException(404, f"unknown demo report {body.report_id}")
    return await _submit_report(rep["camp_id"], rep["text"], "demo")


@router.post("/camps/{camp_id}/deliveries/{order_id}/confirm")
async def confirm_delivery(camp_id: str, order_id: str, body: ReceiptBody, user: User = CAMP) -> dict:
    check_scope(user, "camp", camp_id)
    live = get_live()
    order = live.world.orders.get(order_id)
    if order is None or order.camp_id != camp_id:
        raise HTTPException(404, f"no order {order_id} for camp {camp_id}")
    if order.status != "delivered":
        raise HTTPException(409, f"order {order_id} is {order.status}, not delivered")
    out = live.confirm_delivery(camp_id, order_id, body.received)
    live.touch()
    return out


@router.post("/trucks/{truck_id}/ack")
async def truck_ack(truck_id: str, user: User = DRIVER) -> dict:
    check_scope(user, "driver", truck_id)
    live = get_live()
    if truck_id not in live.world.trucks:
        raise HTTPException(404, f"unknown truck {truck_id}")
    out = live.acknowledge(truck_id)
    live.touch()
    return out


@router.post("/trucks/{truck_id}/road-report")
async def road_report(truck_id: str, body: RoadReportBody, user: User = DRIVER) -> dict:
    check_scope(user, "driver", truck_id)
    live = get_live()
    if truck_id not in live.world.trucks or body.edge_id not in live.world.graph.edges:
        raise HTTPException(404, "unknown truck or road")
    out = live.road_report(truck_id, body.edge_id, body.kind, body.note.strip()[:200]).model_dump()
    live.touch()
    return out


@router.get("/trucks/{truck_id}/history")
async def truck_history(truck_id: str, user: User = DRIVER_OR_OFFICER) -> list[dict]:
    check_scope(user, "driver", truck_id)
    live = get_live()
    if truck_id not in live.world.trucks:
        raise HTTPException(404, f"unknown truck {truck_id}")
    return live.truck_history(truck_id)


@router.post("/hazards/{hazard_id}/confirm", dependencies=OFFICER)
async def hazard_confirm(hazard_id: str) -> dict:
    live = get_live()
    if hazard_id not in live.world.hazards:
        raise HTTPException(404, f"no active hazard {hazard_id}")
    out = live.confirm_hazard(hazard_id).model_dump()
    live.touch()
    return out


@router.post("/warehouses/{warehouse_id}/adjust")
async def warehouse_adjust(warehouse_id: str, body: AdjustBody, user: User = WAREHOUSE) -> dict:
    check_scope(user, "warehouse", warehouse_id)
    live = get_live()
    if warehouse_id not in live.world.warehouses:
        raise HTTPException(404, f"unknown warehouse {warehouse_id}")
    out = live.adjust_stock(warehouse_id, body.delta, body.note)
    live.touch()
    return out


class CopilotBody(BaseModel):
    question: str


@router.get("/agents", dependencies=OFFICER)
async def agents() -> dict:
    return get_live().agents_view()


@router.post("/copilot", dependencies=OFFICER)
async def copilot(body: CopilotBody) -> dict:
    """Read-only: state is frozen here (sim thread); the LLM and its tools run on that copy off the event loop."""
    live = get_live()
    frozen = freeze(live.world, live.cmp.kpis())
    t0 = time.perf_counter()
    out = await asyncio.to_thread(ask, live.llm, frozen, body.question)
    if not out.get("needs_key"):
        live.world.bus.log(
            "human",
            "copilot.asked",
            f'{who("Command")} asked the copilot: "{body.question.strip()[:140]}"',
            out.get("answer", ""),
        )
        live.world.bus.record_ms("copilot", (time.perf_counter() - t0) * 1000)
    return out


@router.post("/report", dependencies=OFFICER)
async def report() -> dict:
    """End & report: pause, then write the after-action report from the current KPIs and log."""
    live = get_live()
    live.clock.running = False
    out = await live.generate_report()
    live.touch()
    return out


@router.get("/report", dependencies=OFFICER)
async def latest_report() -> dict | None:
    """The latest after-action report, or null before one is written (not a 404: the page asks on every visit)."""
    return get_live().report


@router.get("/kpis", dependencies=OFFICER)
async def kpis() -> dict:
    return get_live().cmp.kpis()
