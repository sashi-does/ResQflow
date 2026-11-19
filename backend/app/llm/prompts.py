"""Prompts and output schemas for the LLM agents (docs/03_AGENTS.md §4, doc 10)."""

from __future__ import annotations

COORDINATOR_SYSTEM = """You are the Coordinator agent in RahatNet, a flood-relief logistics system for Assam, India.
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
