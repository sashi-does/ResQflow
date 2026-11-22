"""After-action report (doc 10 E): numbers come only from the KPIs and the event log (code); the LLM writes prose.

The LLM never types a figure: it refers to facts with {{placeholders}} that code fills in. An audit then rejects any
number in the prose that isn't one of the facts (road names like NH-715 and sim times are allowed); on failure, or
without a key, a deterministic template writes the narrative instead.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from app.llm.client import LLMClient, LLMError, display_name
from app.llm.journal import purpose
from app.models import FieldReport
from app.sim.world import WorldState

KPI_ROWS = [
    ("people_hours_without_water", "People-hours without water", True),
    ("people_hours_without_food", "People-hours without food", True),
    ("deliveries_on_time_pct", "On-time deliveries (%)", False),
    ("deliveries_total", "Deliveries", False),
    ("truck_hours_stuck", "Truck-hours stuck", True),
    ("avg_delivery_min", "Avg delivery time (min)", True),
    ("supplies_delivered_kg", "Supplies delivered (kg)", False),
]
TIMELINE_KINDS = {
    "hazard.added",
    "hazard.removed",
    "weather.advisory",
    "weather.eased",
    "warehouse.offline",
    "warehouse.online",
    "supply.ordered",
    "supply.arrived",
    "hazard.confirmed",
    "hazard.unverified",
    "truck.rerouted",
    "truck.holding",
    "order.cancelled",
    "order.recalled",
    "camp.cut_off",
    "camp.reconnected",
    "field_report.applied",
    "field_report.pending",
    "field_report.confirmed",
    "field_report.rejected",
    "driver.ack",
    "plan.rejected",
    "plan.fallback",
    "demo.fault",
    "policy.updated",
    "scenario.end",
}

NARRATIVE_SYSTEM = """You write the narrative of an after-action report for a district disaster management office
in Assam.
You get FACTS as JSON. Write plainly, like a calm operations officer.
Rules:
- NEVER type a number yourself. Every figure must be a placeholder from FACTS.placeholders, written as {{name}}.
- Road names (e.g. NH-715) and sim times (e.g. D1 07:15) may be written as they appear in FACTS.
- summary: 3-5 sentences: what happened, what the agents did, the Agentic vs Static result.
- recommendations: 3-5 concrete actions for next monsoon, grounded in FACTS (cut-off camps, detoured roads,
  warehouses that hit reserve, needs the system doesn't stock)."""

NARRATIVE_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}, "recommendations": {"type": "array", "items": {"type": "string"}}},
    "required": ["summary", "recommendations"],
    "additionalProperties": False,
}


def _fmt(v: float, key: str = "") -> str:
    if key.endswith("_pct"):
        return f"{v:.1f}%"
    if isinstance(v, int) or float(v).is_integer():
        return f"{int(v):,}"
    return f"{v:,.1f}"


def build_facts(world: WorldState, kpis: dict[str, Any], reports: list[FieldReport]) -> dict[str, Any]:
    """Everything numeric in the report, computed by code."""
    rows = []
    for key, label, lower_better in KPI_ROWS:
        a, b, d = kpis["agentic"][key], kpis["baseline"][key], kpis["delta_pct"].get(key)
        better = None if d is None or a == b else ((a < b) == lower_better)
        rows.append({"key": key, "label": label, "agentic": a, "static": b, "delta_pct": d, "better": better})
    entries = world.bus.entries
    timeline = [
        {"sim_time": e.sim_time, "agent": e.agent, "kind": e.kind, "summary": e.summary}
        for e in entries
        if e.kind in TIMELINE_KINDS
    ][:40]
    reroutes = [e for e in entries if e.kind == "truck.rerouted"]
    road_counts = Counter(
        world.graph.edges[eid].road.split(" (")[0]
        for e in reroutes
        for eid in e.refs.edge_ids
        if eid in world.graph.edges
    )
    cut_off = [
        {
            "camp": c.name,
            "population": c.population,
            "reason": c.unserved_reason or "cut off by flooding",
            "since": next((e.sim_time for e in entries if e.kind == "camp.cut_off" and c.id in e.refs.camp_ids), None),
        }
        for c in world.camps.values()
        if c.cut_off or any(e.kind == "camp.cut_off" and c.id in e.refs.camp_ids for e in entries)
    ]
    reserve_wh = sorted({world.warehouses[o.warehouse_id].name for o in world.orders.values() if o.uses_reserve})
    needs = sorted({n for c in world.camps.values() for n in c.urgent_needs})
    escalations = (
        [
            {
                "what": f"Field report from {world.camps[r.camp_id].name}",
                "status": r.status,
                "why": "; ".join(r.reasons),
            }
            for r in reports
            if r.status in ("pending_confirmation", "confirmed", "rejected", "unparsed")
        ]
        + [
            {"what": h.label, "status": "verified" if h.verified else "awaiting confirmation", "why": "driver report"}
            for h in world.hazards.values()
            if h.kind == "driver_report"
        ]
        + [{"what": f"{c['camp']} cut off", "status": "escalated", "why": "request boat/air drop"} for c in cut_off]
    )
    human = sum(1 for e in entries if e.agent == "human" and e.kind == "order.approved")
    policy = sum(1 for e in entries if e.kind == "order.approved" and e.agent == "dispatcher")
    ferry_closed = any(h.kind == "edge_closure" for h in world.hazards.values()) or any(
        e.kind == "hazard.added" and "ferry" in e.summary.lower() for e in entries
    )
    counts = {
        "reroutes": len(reroutes),
        "deliveries": kpis["agentic"]["deliveries_total"],
        "human_approvals": human,
        "policy_approvals": policy,
        "validator_rejections": sum(1 for e in entries if e.kind == "plan.rejected"),
        "hours": round(world.sim_seconds / 3600, 1),
    }
    placeholders = {
        "water_agentic": _fmt(round(kpis["agentic"]["people_hours_without_water"])),
        "water_static": _fmt(round(kpis["baseline"]["people_hours_without_water"])),
        "water_delta_pct": _pct(kpis["delta_pct"].get("people_hours_without_water")),
        "deliveries_agentic": _fmt(kpis["agentic"]["deliveries_total"]),
        "deliveries_static": _fmt(kpis["baseline"]["deliveries_total"]),
        "stuck_agentic": f"{kpis['agentic']['truck_hours_stuck']:.1f}",
        "stuck_static": f"{kpis['baseline']['truck_hours_stuck']:.1f}",
        "supplies_t_agentic": _fmt(round(kpis["agentic"]["supplies_delivered_kg"] / 1000, 1)),
        "supplies_t_static": _fmt(round(kpis["baseline"]["supplies_delivered_kg"] / 1000, 1)),
        "reroutes": _fmt(counts["reroutes"]),
        "hours": _fmt(counts["hours"]),
        "human_approvals": _fmt(human),
        "policy_approvals": _fmt(policy),
        "validator_rejections": _fmt(counts["validator_rejections"]),
    }
    return {
        "scenario": world.scenario.raw["name"],
        "sim_time": world.sim_time,
        "kpis": kpis,
        "kpi_rows": rows,
        "timeline": timeline,
        "cut_off": cut_off,
        "escalations": escalations,
        "detoured_roads": road_counts.most_common(3),
        "reserve_warehouses": reserve_wh,
        "unstocked_needs": needs,
        "ferry_closed": ferry_closed,
        "counts": counts,
        "placeholders": placeholders,
    }


def _pct(d: float | None) -> str:
    return "n/a" if d is None else f"{d:+.0f}%"


def template_narrative(f: dict[str, Any]) -> dict[str, Any]:
    p = f["placeholders"]
    cut = ", ".join(c["camp"] for c in f["cut_off"])
    summary = (
        f"Over {p['hours']} hours of flooding, ResQflow's agents re-routed {p['reroutes']} truck "
        f"journey{'' if p['reroutes'] == '1' else 's'} around closed roads and made {p['deliveries_agentic']} "
        f"deliver{'y' if p['deliveries_agentic'] == '1' else 'ies'} ({p['supplies_t_agentic']} t). "
        f"People spent {p['water_agentic']} people-hours without water, against {p['water_static']} "
        f"under a static plan made at 06:00 ({p['water_delta_pct']}). "
        f"Trucks were stuck for {p['stuck_agentic']} hours (static plan: {p['stuck_static']})."
        + (f" {cut} could not be reached by road and was escalated for a boat or air drop." if cut else "")
    )
    recs = []
    for c in f["cut_off"]:
        recs.append(
            f"Pre-arrange boat or air-drop capacity for {c['camp']}: it was cut off by road"
            + (f" from {c['since']}." if c["since"] else ".")
        )
    for road, _n in f["detoured_roads"][:1]:
        recs.append(f"Plan and signpost a standing detour for {road}; it caused the most re-routes.")
    if f["ferry_closed"]:
        recs.append("Keep the north-bank road supply line for Majuli ready whenever the ferry is suspended.")
    for wh in f["reserve_warehouses"]:
        recs.append(f"Raise pre-monsoon stock at {wh}: orders had to draw on its safety reserve.")
    if f["unstocked_needs"]:
        recs.append(f"Add {', '.join(f['unstocked_needs'][:4])} to the standard relief kit: camps asked for them.")
    if not recs:
        recs.append("Keep pre-positioned stock close to the most flood-prone camps before the monsoon peak.")
    return {"summary": summary, "recommendations": recs[:5]}


_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _allowed_numbers(f: dict[str, Any]) -> set[str]:
    text = json.dumps({k: v for k, v in f.items() if k not in ("kpis", "kpi_rows", "counts", "placeholders")})
    nums = set(_NUM.findall(text)) | {"24", "06", "00"}
    return {n.replace(",", "") for n in nums}


def audit(text: str, f: dict[str, Any]) -> list[str]:
    """Numbers in the LLM prose that don't come from the facts (placeholders already filled are allowed)."""
    filled = set()
    for v in f["placeholders"].values():
        filled |= {n.replace(",", "") for n in _NUM.findall(v)}
    allowed = _allowed_numbers(f) | filled
    return [n for n in _NUM.findall(text) if n.replace(",", "") not in allowed]


def llm_narrative(llm: LLMClient, f: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    facts = {k: v for k, v in f.items() if k not in ("kpis", "kpi_rows")}
    try:
        with purpose("report"):
            res = llm.complete_json(NARRATIVE_SYSTEM, json.dumps(facts, default=str), NARRATIVE_SCHEMA, max_tokens=2000)
    except LLMError as exc:
        return None, f"AI narrative failed ({exc}); used the template"
    raw = res.data
    # numbers typed by the model (before placeholders are filled) are not allowed at all
    bad = audit(json.dumps(raw, ensure_ascii=False).replace("{{", "").replace("}}", ""), {**f, "placeholders": {}})
    fill = lambda s: re.sub(r"\{\{(\w+)\}\}", lambda m: f["placeholders"].get(m.group(1), m.group(0)), s)  # noqa: E731
    out = {"summary": fill(raw["summary"]), "recommendations": [fill(r) for r in raw["recommendations"]][:5]}
    if bad or "{{" in json.dumps(out):
        return (
            None,
            f"AI narrative contained figures not in the data ({', '.join(bad[:3]) or 'unknown placeholder'}); "
            "used the template",
        )
    return out, ""


def make_report(world: WorldState, kpis: dict[str, Any], reports: list[FieldReport], llm: LLMClient) -> dict[str, Any]:
    """Synchronous (headless/tests). The live server splits facts (sim thread) and narrative (worker thread)."""
    f = build_facts(world, kpis, reports)
    narrative, note = llm_narrative(llm, f) if llm.available else (None, "")
    return assemble(f, narrative, note, llm)


def assemble(f: dict[str, Any], narrative: dict[str, Any] | None, note: str, llm: LLMClient) -> dict[str, Any]:
    source = "llm" if narrative else "template"
    if narrative is None:
        narrative = template_narrative(f)
        note = note or "Narrative written by a template (no API key); every number comes from the simulation."
    return {
        "title": f"After-action report · {f['scenario']}",
        "generated_at_sim": f["sim_time"],
        "narrative": narrative,
        "narrative_source": source,
        "narrative_model": display_name(llm.model) if source == "llm" else None,
        "narrative_note": note,
        **{k: f[k] for k in ("kpis", "kpi_rows", "timeline", "cut_off", "escalations", "counts")},
    }
