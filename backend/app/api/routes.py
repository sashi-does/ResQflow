"""REST routes under /api (docs/05_API_CONTRACT.md)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import get_settings
from app.geo.hazards import hazard_from_preset
from app.sim.live import get_live
from app.sim.scenario import load_scenario

VERSION = "0.1.0"

router = APIRouter(prefix="/api")


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


@router.get("/scenario")
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
        "constants": sc.constants,
        "timeline": sc.raw["timeline"],
    }


@router.get("/state")
async def state() -> dict:
    return get_live().snapshot()


@router.post("/sim/start")
async def sim_start() -> dict:
    live = get_live()
    live.clock.running = not live.cmp.agentic.ended
    live.broadcast("tick", live.tick_payload())
    return {"running": live.clock.running}


@router.post("/sim/pause")
async def sim_pause() -> dict:
    live = get_live()
    live.clock.running = False
    live.broadcast("tick", live.tick_payload())
    return {"running": False}


@router.post("/sim/reset")
async def sim_reset(body: ResetBody | None = None) -> dict:
    live = get_live()
    live.reset(demo_timeline=body.demo_timeline if body else True)
    return live.snapshot()


@router.post("/sim/speed")
async def sim_speed(body: SpeedBody) -> dict:
    live = get_live()
    live.clock.speed = body.multiplier
    live.broadcast("tick", live.tick_payload())
    return {"speed": live.clock.speed}


@router.post("/sim/advance")
async def sim_advance(body: AdvanceBody) -> dict:
    """Dev/test helper: advance sim time by N minutes immediately (fixed 30 s steps)."""
    live = get_live()
    live.advance(max(0, body.minutes) * 2)
    live.broadcast("tick", live.tick_payload())
    return live.sim_view()


@router.post("/demo/run")
async def demo_run() -> dict:
    live = get_live()
    live.reset(demo_timeline=True)
    live.clock.running = True
    live.broadcast("tick", live.tick_payload())
    return {"running": True, "sim": live.sim_view()}


@router.post("/hazards/trigger")
async def hazards_trigger(body: TriggerBody) -> dict:
    live = get_live()
    if body.preset_id not in live.world.scenario.presets:
        raise HTTPException(404, f"unknown preset {body.preset_id}")
    hazard = live.trigger_preset(body.preset_id)
    if hazard is None:
        existing = next(h for h in live.world.hazards.values() if h.preset_id == body.preset_id)
        return existing.model_dump()
    return hazard.model_dump()


@router.post("/hazards/custom")
async def hazards_custom(body: CustomHazardBody) -> dict:
    if body.polygon.get("type") not in ("Polygon", "MultiPolygon"):
        raise HTTPException(422, "polygon must be a GeoJSON Polygon or MultiPolygon")
    return get_live().add_custom(body.label, body.polygon).model_dump()


@router.delete("/hazards/{hazard_id}")
async def hazards_delete(hazard_id: str) -> dict:
    live = get_live()
    if hazard_id == "all":
        return {"removed": True, "hazard_ids": live.remove_all_floods()}
    if not live.remove_hazard(hazard_id):
        raise HTTPException(404, f"no active hazard {hazard_id}")
    return {"removed": True}


@router.post("/replan")
async def replan() -> dict:
    get_live().replan()
    return {"started": True}


@router.get("/orders")
async def orders(status: str | None = None) -> list[dict]:
    w = get_live().world
    return [o.model_dump() for o in w.orders.values() if status is None or o.status == status]


@router.post("/approvals/{order_id}")
async def approvals(order_id: str, body: ApprovalBody) -> dict:
    live = get_live()
    order = live.world.orders.get(order_id)
    if order is None:
        raise HTTPException(404, f"unknown order {order_id}")
    if order.status != "awaiting_approval":
        raise HTTPException(409, f"order {order_id} is {order.status}, not awaiting approval")
    if body.decision == "approve":
        return live.approve(order_id, body.note)
    return live.reject(order_id, body.note)


@router.get("/log")
async def log_entries(limit: int = Query(200, ge=1, le=2000), agent: str | None = None) -> list[dict]:
    entries = get_live().world.bus.entries
    picked = [e for e in reversed(entries) if agent is None or e.agent == agent]
    return [e.model_dump() for e in picked[:limit]]


@router.get("/kpis")
async def kpis() -> dict:
    return get_live().cmp.kpis()
