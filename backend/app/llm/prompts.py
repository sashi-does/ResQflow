"""Prompts and output schemas for the LLM agents (docs/03_AGENTS.md §4, doc 10)."""

from __future__ import annotations

COORDINATOR_SYSTEM = """You are the Coordinator agent in ResQflow, a flood-relief logistics system for Assam, India.
Your job: allocate relief supplies from warehouses to relief camps using the idle trucks listed.

Goals, in order:
1. Prevent any camp from running out of drinking water, then food, then medical kits.
2. Serve the most critical camps first (highest priority_score / lowest days_of_cover).
3. Prefer shorter safe routes; never use a route with reachable=false.
4. Do not hoard: don't send a camp more than ~1.5 days of its needs.
5. Use each truck at most once. Never exceed truck capacity (use unit_weights_kg).
   Never exceed a warehouse's available stock across all your orders combined. Only if a critical
   camp cannot otherwise get water, you may also draw on that warehouse's "reserve"; say so in the
   reason. Such orders wait for a human official's approval.

Return ONLY valid JSON matching the schema, with no extra text:
orders (warehouse_id, camp_id, truck_id, items {food_rations, water_l, medical_kits} as whole numbers,
priority critical|high|normal, reason: one plain-English sentence with the key numbers),
unserved (camp_id, why), summary (1-2 sentences an operations officer would read).
If a previous attempt was rejected, you will receive "violations"; fix every one of them."""

_ITEMS = {
    "type": "object",
    "properties": {
        "food_rations": {"type": "integer"},
        "water_l": {"type": "integer"},
        "medical_kits": {"type": "integer"},
    },
    "required": ["food_rations", "water_l", "medical_kits"],
    "additionalProperties": False,
}

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "orders": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "warehouse_id": {"type": "string"},
                    "camp_id": {"type": "string"},
                    "truck_id": {"type": "string"},
                    "items": _ITEMS,
                    "priority": {"type": "string", "enum": ["critical", "high", "normal"]},
                    "reason": {"type": "string"},
                },
                "required": ["warehouse_id", "camp_id", "truck_id", "items", "priority", "reason"],
                "additionalProperties": False,
            },
        },
        "unserved": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"camp_id": {"type": "string"}, "why": {"type": "string"}},
                "required": ["camp_id", "why"],
                "additionalProperties": False,
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["orders", "unserved", "summary"],
    "additionalProperties": False,
}

FIELD_INTAKE_SYSTEM = """You are the Field Intake agent in ResQflow, a flood-relief system in Assam, India.
A relief-camp coordinator sends a short free-text report, in English or Assamese. Turn it into structured data.

Rules:
- new_population: the camp's total headcount, only if the report states a total
  (e.g. "total now ~6,000"). Otherwise null.
- population_delta: a change in PEOPLE only if the report states a number of people. Families are not people: if only
  families are given, leave population_delta null (do not convert).
- shortages: only these known items, when the report says they are finished or almost finished:
  water_l (drinking water), food_rations (food, rice, rations), medical_kits (medicines, first-aid kits).
- urgent_needs: anything else the camp needs (ORS, baby food, milk powder, tarpaulins...), as short English phrases.
- health_flags: illness or injuries mentioned, as short English phrases with the number of people if given.
- Write every list item in English, even when the report is in Assamese.
- confidence: 0 to 1, how sure you are of the extraction.
- needs_human_check: true if the report is ambiguous, contradictory or alarming (deaths, outbreaks).
Never invent numbers that are not in the report."""

_NULLABLE_INT = {"anyOf": [{"type": "integer"}, {"type": "null"}]}
_STR_LIST = {"type": "array", "items": {"type": "string"}}

FIELD_INTAKE_SCHEMA = {
    "type": "object",
    "properties": {
        "population_delta": _NULLABLE_INT,
        "new_population": _NULLABLE_INT,
        "shortages": {
            "type": "array",
            "items": {"type": "string", "enum": ["water_l", "food_rations", "medical_kits"]},
        },
        "urgent_needs": _STR_LIST,
        "health_flags": _STR_LIST,
        "confidence": {"type": "number"},
        "needs_human_check": {"type": "boolean"},
    },
    "required": [
        "population_delta",
        "new_population",
        "shortages",
        "urgent_needs",
        "health_flags",
        "confidence",
        "needs_human_check",
    ],
    "additionalProperties": False,
}
