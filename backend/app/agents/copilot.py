"""Ask RahatNet: a read-only copilot for District Command.

The LLM answers from a compact world summary + the last 50 log entries, and may call three read-only tools.
Tools run on a *frozen snapshot* taken on the simulation thread (plain dicts + the immutable road graph), so the
copilot can never change world state and never races the simulation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.geo.graph import RoadGraph
from app.llm.client import LLMClient, LLMError, ToolSpec, display_name
from app.sim.world import WorldState

COPILOT_SYSTEM = """You are "Ask RahatNet", the copilot for the District Disaster Management Officer
during the Assam floods.
Answer the officer's question in 2-6 short sentences, in the language of the question (English or Assamese).
Use ONLY the state JSON, the recent decision log and the tools. Cite specifics: camp names, days of water, people,
road names, truck ids, times. Never invent numbers; if something isn't in the data, say so.
You are read-only: you can't change anything. If the officer should act, say what they could do in the dashboard."""

_TOOLS_SCHEMA = {
    "get_camp": {
        "type": "object",
        "properties": {"camp_id": {"type": "string", "description": "Camp id like C2, or its name"}},
        "required": ["camp_id"],
        "additionalProperties": False,
    },
    "get_route": {
        "type": "object",
        "properties": {
            "from_id": {"type": "string", "description": "Warehouse id (W1..W5), camp id (C1..C8) or node id"},
            "to_id": {"type": "string", "description": "Warehouse id, camp id or node id"},
        },
        "required": ["from_id", "to_id"],
        "additionalProperties": False,
    },
    "simulate_closure": {
        "type": "object",
        "properties": {
            "roads": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Edge ids (E1..E22) or road names such as 'NH-27'",
            }
        },
        "required": ["roads"],
        "additionalProperties": False,
    },
}


@dataclass(frozen=True)
class Frozen:
    """Everything the copilot may read, copied at question time."""

    sim_time: str
    graph: RoadGraph
    blocked: frozenset[str]
    camps: dict[str, dict[str, Any]]
    warehouses: dict[str, dict[str, Any]]
    trucks: dict[str, dict[str, Any]]
    hazards: list[dict[str, Any]]
    log: list[str]
    kpis: dict[str, Any]


def freeze(world: WorldState, kpis: dict[str, Any]) -> Frozen:
    camps = {}
    for c in world.camps.values():
        burn = world.burn_per_day(c)
        camps[c.id] = {
            "id": c.id,
            "name": c.name,
            "node_id": c.node_id,
            "district": c.district,
            "population": c.population,
            "stock": c.stock.as_dict(),
            "incoming": world.incoming(c.id).as_dict(),
            "days_of_cover": round(world.days_of_cover(c), 2),
            "water_days": round(c.stock.water_l / burn["water_l"], 2) if burn["water_l"] else None,
            "cut_off": c.cut_off,
            "unserved_reason": c.unserved_reason,
            "urgent_needs": list(c.urgent_needs),
            "health_flags": list(c.health_flags),
        }
    return Frozen(
        sim_time=world.sim_time,
        graph=world.graph,
        blocked=frozenset(world.blocked_edge_ids()),
        camps=camps,
        warehouses={
            w.id: {
                "id": w.id,
                "name": w.name,
                "node_id": w.node_id,
                "stock": w.stock.as_dict(),
                "available": world.available(w).as_dict(),
            }
            for w in world.warehouses.values()
        },
        trucks={
            t.id: {
                "id": t.id,
                "status": t.status,
                "order_id": t.order_id,
                "at_warehouse": t.at_warehouse,
                "route_edges": list(t.path_edge_ids),
                "eta_sim_seconds": t.eta_sim_seconds,
            }
            for t in world.trucks.values()
        },
        hazards=[
            {
                "id": h.id,
                "label": h.label,
                "kind": h.kind,
                "verified": h.verified,
                "roads": sorted({world.graph.edges[e].road for e in h.edge_ids}),
            }
            for h in world.hazards.values()
        ],
        log=[f"[{e.sim_time}] {e.agent}: {e.summary}" for e in world.bus.entries[-50:]],
        kpis=kpis,
    )


class CopilotTools:
    """Pure functions over a Frozen snapshot."""

    def __init__(self, f: Frozen) -> None:
        self.f = f

    def _node(self, ref: str) -> tuple[str, str]:
        r = ref.strip()
        if r in self.f.camps:
            return self.f.camps[r]["node_id"], self.f.camps[r]["name"]
        if r in self.f.warehouses:
            return self.f.warehouses[r]["node_id"], self.f.warehouses[r]["name"] + " warehouse"
        if r in self.f.graph.nodes:
            return r, self.f.graph.nodes[r].name
        for c in self.f.camps.values():
            if r.lower() in c["name"].lower():
                return c["node_id"], c["name"]
        for n in self.f.graph.nodes.values():
            if r.lower() in n.name.lower():
                return n.id, n.name
        raise ValueError(f"unknown place '{ref}'")

    def get_camp(self, args: dict[str, Any]) -> dict[str, Any]:
        ref = args["camp_id"].strip()
        camp = self.f.camps.get(ref) or next(
            (c for c in self.f.camps.values() if ref.lower() in c["name"].lower()), None
        )
        if camp is None:
            raise ValueError(f"unknown camp '{ref}'")
        reachable_from = []
        for w in self.f.warehouses.values():
            p = self.f.graph.safe_path(w["node_id"], camp["node_id"], self.f.blocked)
            if p:
                reachable_from.append({"warehouse": w["name"], "eta_min": round(p.minutes), "via": p.roads[:4]})
        return {**camp, "reachable_from": reachable_from}

    def get_route(self, args: dict[str, Any]) -> dict[str, Any]:
        a, an = self._node(args["from_id"])
        b, bn = self._node(args["to_id"])
        p = self.f.graph.safe_path(a, b, self.f.blocked)
        if p is None:
            open_p = self.f.graph.safe_path(a, b)
            closed = sorted(
                {self.f.graph.edges[e].road for e in (open_p.edge_ids if open_p else []) if e in self.f.blocked}
            )
            return {"from": an, "to": bn, "reachable": False, "closed_roads_on_normal_route": closed}
        return {
            "from": an,
            "to": bn,
            "reachable": True,
            "eta_min": round(p.minutes),
            "km": round(p.km),
            "via": p.roads,
            "towns": [self.f.graph.nodes[n].name for n in p.nodes],
        }

    def _edges_for(self, roads: list[str]) -> set[str]:
        out: set[str] = set()
        for r in roads:
            r = r.strip()
            if r in self.f.graph.edges:
                out.add(r)
                continue
            for e in self.f.graph.edges.values():
                if r.lower() in e.road.lower():
                    out.add(e.id)
        if not out:
            raise ValueError(f"no road matches {roads}")
        return out

    def simulate_closure(self, args: dict[str, Any]) -> dict[str, Any]:
        """Dry run: which camps lose every road from every warehouse, and which trucks' routes cross the closure."""
        extra = self._edges_for(args["roads"])
        blocked = set(self.f.blocked) | extra
        newly_cut, slower = [], []
        for c in self.f.camps.values():
            before = [
                self.f.graph.safe_path(w["node_id"], c["node_id"], self.f.blocked) for w in self.f.warehouses.values()
            ]
            after = [self.f.graph.safe_path(w["node_id"], c["node_id"], blocked) for w in self.f.warehouses.values()]
            if any(before) and not any(after):
                newly_cut.append(c["name"])
            elif any(after):
                b = min(p.minutes for p in before if p) if any(before) else None
                a = min(p.minutes for p in after if p)
                if b is not None and a > b * 1.15:
                    slower.append({"camp": c["name"], "fastest_eta_min_before": round(b), "after": round(a)})
        trucks = [t["id"] for t in self.f.trucks.values() if extra & set(t["route_edges"])]
        return {
            "closed": sorted({f"{self.f.graph.edges[e].road} ({e})" for e in extra}),
            "camps_newly_cut_off": newly_cut,
            "camps_slower": slower,
            "trucks_that_would_be_rerouted": trucks,
            "note": "Dry run on a copy of the current state; nothing was changed.",
        }

    def specs(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                "get_camp",
                "Live status of one relief camp: people, stock, days of cover, cut-off, reachable from which "
                "warehouses (ETA, roads).",
                _TOOLS_SCHEMA["get_camp"],
                self.get_camp,
            ),
            ToolSpec(
                "get_route",
                "Fastest currently-safe route between two places (warehouse, camp or town).",
                _TOOLS_SCHEMA["get_route"],
                self.get_route,
            ),
            ToolSpec(
                "simulate_closure",
                "What-if: close extra roads on a copy of the state and report camps that would be cut "
                "off or slowed, and trucks that would be re-routed. Changes nothing.",
                _TOOLS_SCHEMA["simulate_closure"],
                self.simulate_closure,
            ),
        ]


def overview(f: Frozen) -> dict[str, Any]:
    return {
        "sim_time": f.sim_time,
        "camps": [
            {k: c[k] for k in ("id", "name", "population", "days_of_cover", "water_days", "cut_off", "unserved_reason")}
            for c in f.camps.values()
        ],
        "warehouses": [{"id": w["id"], "name": w["name"], "available": w["available"]} for w in f.warehouses.values()],
        "trucks": [{k: t[k] for k in ("id", "status", "order_id")} for t in f.trucks.values()],
        "hazards": f.hazards,
        "kpis_so_far": {"agentic": f.kpis.get("agentic"), "static_plan": f.kpis.get("baseline")},
    }


def ask(llm: LLMClient, f: Frozen, question: str) -> dict[str, Any]:
    """Runs off the event loop. Returns {answer, tools_used, model, latency_ms} or {needs_key: True}."""
    if not llm.available:
        return {"needs_key": True, "answer": "Ask RahatNet needs an API key (set ANTHROPIC_API_KEY in .env)."}
    tools = CopilotTools(f)
    user = (
        "STATE:\n"
        + json.dumps(overview(f), separators=(",", ":"), ensure_ascii=False)
        + "\n\nRECENT DECISION LOG (oldest first):\n"
        + "\n".join(f.log)
        + f"\n\nQUESTION: {question.strip()[:500]}"
    )
    try:
        r = llm.run_tools(COPILOT_SYSTEM, user, tools.specs(), max_turns=6, max_tokens=2000)
    except LLMError as exc:
        return {
            "answer": f"The copilot couldn't answer: {exc}.",
            "tools_used": [],
            "model": display_name(llm.model),
            "latency_ms": None,
            "error": True,
        }
    return {"answer": r.text, "tools_used": r.tool_calls, "model": display_name(r.model), "latency_ms": r.latency_ms}
