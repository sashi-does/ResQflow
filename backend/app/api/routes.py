"""REST routes under /api (see docs/05_API_CONTRACT.md)."""

from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.geo.hazards import hazard_from_preset
from app.sim.scenario import load_scenario

VERSION = "0.1.0"

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
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
def scenario() -> dict:
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
    }
