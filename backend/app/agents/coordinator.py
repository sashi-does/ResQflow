"""Coordinator agent: decides the allocation plan (which truck takes what, from where, to which camp).

The LLM proposes; the validator checks every attempt. Hard violations are fed back (max 2 retries), then the
deterministic heuristic planner takes over. Without a key it runs in offline mode (heuristic only).

Headless runs call it synchronously (sim time waits). The live server runs LLM attempts in a worker thread and
polls each step, so the simulation never blocks; the plan is validated against the world *as it is when the
answer arrives*, and the Dispatcher re-validates each order again just before dispatch.
"""

from __future__ import annotations

import json
import math
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from app.agents.heuristic_planner import heuristic_plan
from app.agents.types import CampStatus, PlanResult
from app.agents.validator import describe, validate
from app.llm.client import LLMClient, LLMError, MockClient, display_name
from app.llm.journal import purpose
from app.llm.prompts import COORDINATOR_SYSTEM, PLAN_SCHEMA
from app.sim.world import WorldState
from app.text import fmt_duration

MAX_ATTEMPTS = 3  # first try + 2 retries with violations
INJECT_LABEL = "[demo] injected faulty plan to show the safety check"


@dataclass
class _Cycle:
    trigger: str
    context: dict[str, Any]
    attempt: int = 1
    started: float = field(default_factory=time.perf_counter)
    future: Future | None = None
    last_plan: dict[str, Any] | None = None
    violations: list[str] = field(default_factory=list)
    call_id: str | None = None  # the AI conversation behind the latest attempt


class CoordinatorAgent:
    """Produces a validated `PlanResult`. LLM output never bypasses the validator."""

    def __init__(
        self,
        approval_threshold_kg: float,
        max_orders: int = 8,
        llm: LLMClient | None = None,
        *,
        background: bool = False,
    ) -> None:
        self.approval_threshold_kg = approval_threshold_kg
        self.max_orders = max_orders
        self.llm: LLMClient = llm or MockClient()
        self.background = background
        self.last: PlanResult | None = None
        self.inject_next = False  # armed by the orchestrator for DEMO_INJECT_FAULT
        self.injected = False
        self.cycle_id: int | None = None  # set by the orchestrator for each planning cycle
        self._cycle: _Cycle | None = None
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="coordinator") if background else None
        self._last_unserved: tuple[str, ...] = ()

    def shutdown(self) -> None:
        """Stop the worker thread (live reset); an in-flight LLM answer is simply discarded."""
        if self._pool is not None:
            self._pool.shutdown(wait=False, cancel_futures=True)
        self._cycle = None

    @property
    def busy(self) -> bool:
        return self._cycle is not None

    @property
    def label(self) -> str:
        return f"Coordinator ({display_name(self.llm.model)})" if self.llm.available else "Coordinator (offline mode)"

    # ------------------------------------------------------------ entry points
    def plan(
        self, world: WorldState, statuses: dict[str, CampStatus], trigger: str, *, routine: bool = False
    ) -> PlanResult | None:
        """Start a planning cycle. Returns the result now (headless / offline / routine) or None while the LLM thinks.

        Routine re-plans (hourly, a truck came free) use the instant heuristic even when an AI is available: the AI
        is asked when something actually changed (a flood, a surge, a critical camp, a report)."""
        if not self.llm.available or routine:
            return self._offline(world, statuses, trigger, routine=routine and self.llm.available)
        self._cycle = _Cycle(trigger, build_context(world, statuses, self))
        self._launch(world)
        if self.background:
            return None
        while True:  # synchronous: drive the state machine to completion
            result = self.poll(world, block=True)
            if result is not None:
                return result

    def poll(self, world: WorldState, block: bool = False) -> PlanResult | None:
        c = self._cycle
        if c is None or c.future is None:
            return None
        if not block and not c.future.done():
            return None
        try:
            answer = c.future.result()
            c.call_id = answer.call_id
            plan = answer.data
        except LLMError as exc:
            return self._fallback(world, c, f"{display_name(self.llm.model)} failed: {exc}")
        except Exception as exc:  # never let an LLM problem crash the demo
            return self._fallback(world, c, f"unexpected error: {exc}")
        statuses = _statuses(world)
        plan, injected = self._maybe_inject(world, plan)
        res = validate(world, plan, max_orders=self.max_orders, statuses=statuses)
        if res.ok:
            latency = int((time.perf_counter() - c.started) * 1000)
            result = PlanResult(plan, res, "llm", c.attempt, latency, c.trigger)
            self._log_proposal(world, result, revised=c.attempt > 1, llm_call=c.call_id)
            self._finish()
            return result
        world.bus.log(
            "validator",
            "plan.rejected",
            f"Validator rejected the plan: {describe(res)}",
            (INJECT_LABEL + ". " if injected else "")
            + f"Attempt {c.attempt} of {MAX_ATTEMPTS}. Nothing was dispatched; "
            "the violations go back to the Coordinator.",
            llm_call=c.call_id,
        )
        if c.attempt >= MAX_ATTEMPTS:
            return self._fallback(world, c, f"{MAX_ATTEMPTS} attempts still had violations")
        c.attempt += 1
        c.last_plan = plan
        c.violations = [v.message for v in res.hard]
        c.context = build_context(world, statuses, self)  # the world moved on while it was thinking
        self._launch(world)
        return None if self.background else self.poll(world, block=True)

    # ------------------------------------------------------------ internals
    def _launch(self, world: WorldState) -> None:
        c = self._cycle
        assert c is not None
        payload = dict(c.context)
        if c.violations:
            payload["previous_plan"] = c.last_plan
            payload["violations"] = c.violations
        user = json.dumps(payload, separators=(",", ":"))
        meta = {"cycle": self.cycle_id, "attempt": c.attempt, "sim_time": world.sim_time, "trigger": c.trigger}

        def call() -> Any:
            with purpose("coordinator", **meta):
                return self.llm.complete_json(COORDINATOR_SYSTEM, user, PLAN_SCHEMA, max_tokens=8000)

        if self._pool is not None:
            c.future = self._pool.submit(call)
        else:
            f: Future = Future()
            try:
                f.set_result(call())
            except Exception as exc:
                f.set_exception(exc)
            c.future = f

    def _finish(self) -> None:
        self._cycle = None

    def _maybe_inject(self, world: WorldState, plan: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        if not self.inject_next or self.injected or not plan.get("orders"):
            return plan, False
        plan = json.loads(json.dumps(plan))
        o = plan["orders"][0]
        truck = world.trucks.get(o.get("truck_id", ""))
        if truck is None:
            return plan, False
        items = o.setdefault("items", {})
        weight = sum(int(items.get(k, 0)) * world.unit_weight[k] for k in world.unit_weight)
        items["water_l"] = int(items.get("water_l", 0)) + math.ceil(truck.capacity_kg - weight + 1200)
        self.injected, self.inject_next = True, False
        world.bus.log(
            "coordinator",
            "demo.fault",
            f"{INJECT_LABEL}: Truck {truck.id} overloaded on purpose.",
            "DEMO_INJECT_FAULT is on. This happens once per demo run, "
            "so the validator's rejection-and-retry is visible.",
            truck_ids=[truck.id],
        )
        return plan, True

    def _offline(
        self, world: WorldState, statuses: dict[str, CampStatus], trigger: str, *, routine: bool = False
    ) -> PlanResult:
        t0 = time.perf_counter()
        plan = self._heuristic(world, statuses)
        attempts = 1
        plan_try, injected = self._maybe_inject(world, plan)
        res = validate(world, plan_try, max_orders=self.max_orders, statuses=statuses)
        if injected and not res.ok:
            world.bus.log(
                "validator",
                "plan.rejected",
                f"Validator rejected the plan: {describe(res)}",
                INJECT_LABEL + ". Nothing was dispatched; the Coordinator re-plans.",
            )
            attempts = 2
            res = validate(world, plan, max_orders=self.max_orders, statuses=statuses)
        else:
            plan = plan_try
        if not res.ok:  # cannot happen by construction (tested). Never dispatch an invalid plan.
            world.bus.log("validator", "plan.rejected", f"Validator rejected the fallback plan: {describe(res)}")
            plan = {"orders": [], "unserved": plan.get("unserved", []), "summary": "No safe plan this cycle."}
            res = validate(world, plan, max_orders=self.max_orders, statuses=statuses)
        result = PlanResult(plan, res, "heuristic", attempts, int((time.perf_counter() - t0) * 1000), trigger)
        self._log_proposal(world, result, revised=attempts > 1, routine=routine)
        self.last = result
        return result

    def _fallback(self, world: WorldState, c: _Cycle, why: str) -> PlanResult:
        statuses = _statuses(world)
        plan = self._heuristic(world, statuses)
        res = validate(world, plan, max_orders=self.max_orders, statuses=statuses)
        world.bus.log(
            "coordinator",
            "plan.fallback",
            f"Coordinator fell back to the heuristic planner: {why}.",
            "The deterministic planner always produces a plan that passes the validator, so supplies keep moving.",
        )
        result = PlanResult(plan, res, "heuristic", c.attempt, int((time.perf_counter() - c.started) * 1000), c.trigger)
        self._log_proposal(world, result, revised=False, fallback=True)
        self._finish()
        return result

    def _heuristic(self, world: WorldState, statuses: dict[str, CampStatus]) -> dict[str, Any]:
        return heuristic_plan(
            world, statuses, max_orders=self.max_orders, approval_threshold_kg=self.approval_threshold_kg
        )

    def _log_proposal(
        self,
        world: WorldState,
        r: PlanResult,
        *,
        revised: bool,
        fallback: bool = False,
        routine: bool = False,
        llm_call: str | None = None,
    ) -> None:
        self.last = r
        orders = r.validation.orders
        unserved_key = tuple(sorted(u["camp_id"] for u in r.plan.get("unserved", []) if "Cut off" in u.get("why", "")))
        if not orders and unserved_key == self._last_unserved and not revised:
            return  # nothing new to say
        self._last_unserved = unserved_key
        lines = [
            f"• {o.truck_id}: {world.warehouses[o.warehouse_id].name} → {world.camps[o.camp_id].name} "
            f"({o.weight_kg / 1000:.1f} t, {fmt_duration(o.eta_min or 0)}). {o.reason}"
            for o in orders
        ]
        unserved = [
            f"• Unserved: {world.camps[u['camp_id']].name}: {u['why']}."
            for u in r.plan.get("unserved", [])
            if u.get("camp_id") in world.camps
        ]
        n = len(orders)
        who = "Heuristic planner" if fallback else "Heuristic planner (routine re-plan)" if routine else self.label
        timing = f" in {r.latency_ms / 1000:.1f}s" if r.source == "llm" else ""
        verb = "revised the plan" if revised else "proposed"
        head = f"{who} {verb}" + (f" {n} order{'s' if n != 1 else ''}" if verb == "proposed" else f": {n} orders")
        world.bus.log(
            "coordinator",
            "plan.proposed",
            f"{head}{timing}. {r.plan.get('summary', '')}".strip(),
            f"Trigger: {r.trigger}. Attempts: {r.attempts}.\n" + "\n".join(lines + unserved),
            truck_ids=[o.truck_id for o in orders],
            camp_ids=sorted({o.camp_id for o in orders}),
            llm_call=llm_call,
        )
        if orders:
            soft = r.validation.soft
            world.bus.log(
                "validator",
                "plan.validated",
                f"All hard checks passed for {n} order{'s' if n != 1 else ''}"
                + (f"; {len(soft)} warning{'s' if len(soft) != 1 else ''}." if soft else "."),
                "\n".join(f"Warning: {v.message}" for v in soft)
                or "Capacity, stock, safe routes and truck availability all check out.",
            )


def _statuses(world: WorldState) -> dict[str, CampStatus]:
    from app.agents.inventory import InventoryAgent

    inv = InventoryAgent()
    return {c.id: inv.camp_status(world, c, reachable=not c.cut_off) for c in world.camps.values()}


def build_context(world: WorldState, statuses: dict[str, CampStatus], coord: CoordinatorAgent) -> dict[str, Any]:
    """Compact JSON the LLM sees (docs/03_AGENTS.md §4). Kept well under ~6k tokens."""
    needy = [s for s in statuses.values() if not s.deficit_24h.is_empty() or s.status != "ok"]
    blocked = world.routing_blocked()
    camps = [
        {
            "id": s.camp_id,
            "name": s.name.replace(" Relief Camp", ""),
            "population": s.population,
            "status": "cut_off" if s.cut_off else s.status,
            "days_of_cover": round(s.days_of_cover, 2),
            "water_days": round(s.water_days, 2),
            "deficit_24h": s.deficit_24h.as_dict(),
            "incoming": s.incoming.as_dict(),
            "priority_score": round(s.priority_score, 2),
        }
        for s in sorted(needy, key=lambda s: -s.priority_score)
    ]
    routes = []
    for w in world.warehouses.values():
        for s in needy:
            p = world.graph.safe_path(w.node_id, world.camps[s.camp_id].node_id, blocked)
            routes.append(
                {
                    "from": w.id,
                    "to": s.camp_id,
                    "reachable": p is not None,
                    "eta_min": round(p.minutes) if p else None,
                    "via": p.roads[:4] if p else [],
                }
            )
    hazards = [
        {"id": h.id, "label": h.label, "closed_roads": sorted({world.graph.edges[e].road for e in h.edge_ids})}
        for h in world.hazards.values()
        if h.kind != "rain_advisory"
    ]
    return {
        "sim_time": world.sim_time,
        "hazards": hazards,
        "advisories": [
            {"district": h.district, "rain_24h_mm": h.rain_24h_mm}
            for h in world.hazards.values()
            if h.kind == "rain_advisory"
        ],
        "camps": camps,
        "warehouses": [
            {
                "id": w.id,
                "name": w.name,
                "available": world.available(w).as_dict(),
                "reserve": world.reserve_held(w).as_dict(),
            }
            for w in world.warehouses.values()
        ],
        "idle_trucks": [
            {"id": t.id, "at_warehouse": t.at_warehouse, "capacity_kg": t.capacity_kg}
            for t in world.trucks.values()
            if world.truck_is_free(t.id)
        ],
        "routes": routes,
        "unit_weights_kg": world.unit_weight,
        "rules": {"max_orders": coord.max_orders, "approval_threshold_kg": coord.approval_threshold_kg},
    }
