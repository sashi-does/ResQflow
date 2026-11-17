"""Coordinator agent: decides the allocation plan (which truck takes what, from where, to which camp).

Phase 3: offline mode only (heuristic planner). Phase 4 adds the LLM with retry-on-violations.
"""

from __future__ import annotations

import time

from app.agents.heuristic_planner import heuristic_plan
from app.agents.types import CampStatus, PlanResult
from app.agents.validator import describe, validate
from app.sim.world import WorldState
from app.text import fmt_duration


class CoordinatorAgent:
    """Produces a validated `PlanResult`. LLM output (Phase 4) never bypasses the validator."""

    def __init__(self, approval_threshold_kg: float, max_orders: int = 8) -> None:
        self.approval_threshold_kg = approval_threshold_kg
        self.max_orders = max_orders
        self.last: PlanResult | None = None
        self._last_unserved: tuple[str, ...] = ()

    def plan(self, world: WorldState, statuses: dict[str, CampStatus], trigger: str) -> PlanResult:
        t0 = time.perf_counter()
        plan = heuristic_plan(
            world, statuses, max_orders=self.max_orders, approval_threshold_kg=self.approval_threshold_kg
        )
        res = validate(world, plan, max_orders=self.max_orders, statuses=statuses)
        latency = int((time.perf_counter() - t0) * 1000)
        if not res.ok:  # cannot happen by construction; tested. Never dispatch an invalid plan.
            world.bus.log("validator", "plan.rejected", f"Validator rejected the fallback plan: {describe(res)}")
            plan = {"orders": [], "unserved": plan.get("unserved", []), "summary": "No safe plan this cycle."}
            res = validate(world, plan, max_orders=self.max_orders, statuses=statuses)
        result = PlanResult(plan, res, "heuristic", 1, latency, trigger)
        self._log(world, result)
        self.last = result
        return result

    def _log(self, world: WorldState, r: PlanResult) -> None:
        orders = r.validation.orders
        unserved_key = tuple(sorted(u["camp_id"] for u in r.plan.get("unserved", []) if "Cut off" in u["why"]))
        if not orders and unserved_key == self._last_unserved:
            return  # nothing new to say
        self._last_unserved = unserved_key
        lines = [
            f"• {o.truck_id}: {world.warehouses[o.warehouse_id].name} → {world.camps[o.camp_id].name} "
            f"({o.weight_kg / 1000:.1f} t, {fmt_duration(o.eta_min or 0)}). {o.reason}"
            for o in orders
        ]
        unserved = [f"• Unserved: {world.camps[u['camp_id']].name}: {u['why']}." for u in r.plan.get("unserved", [])]
        world.bus.log(
            "coordinator",
            "plan.proposed",
            f"Coordinator (offline mode) proposed {len(orders)} order{'s' if len(orders) != 1 else ''}. "
            f"{r.plan.get('summary', '')}",
            f"Trigger: {r.trigger}.\n" + "\n".join(lines + unserved),
            truck_ids=[o.truck_id for o in orders],
            camp_ids=sorted({o.camp_id for o in orders}),
        )
        if orders:
            soft = r.validation.soft
            world.bus.log(
                "validator",
                "plan.validated",
                f"All hard checks passed for {len(orders)} order{'s' if len(orders) != 1 else ''}"
                + (f"; {len(soft)} warning{'s' if len(soft) != 1 else ''}." if soft else "."),
                "\n".join(f"Warning: {v.message}" for v in soft)
                or "Capacity, stock, safe routes and truck availability all check out.",
            )
