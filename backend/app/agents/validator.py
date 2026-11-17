"""Validator: deterministic hard/soft checks on a plan. Nothing reaches the world without passing it."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.agents.types import CampStatus, CheckedOrder, ValidationResult, Violation
from app.models import ITEMS, Supplies
from app.sim.world import WorldState
from app.text import fmt_kg

ITEM_UNITS = {"water_l": "L water", "food_rations": "food rations", "medical_kits": "medical kits"}
HOARD_DAYS = 1.5
DETOUR_FACTOR = 3.0


def _parse_items(raw: Any) -> Supplies | None:
    if not isinstance(raw, dict):
        return None
    vals = {}
    for i in ITEMS:
        v = raw.get(i, 0)
        if isinstance(v, bool):
            return None
        if isinstance(v, float) and v.is_integer():
            v = int(v)
        if not isinstance(v, int) or v < 0:
            return None
        vals[i] = v
    return Supplies(**vals)


def validate(
    world: WorldState,
    plan: dict[str, Any],
    *,
    max_orders: int = 8,
    statuses: dict[str, CampStatus] | None = None,
    exclude_order_ids: Iterable[str] = (),
) -> ValidationResult:
    """Check every order against the *current* world. See docs/03_AGENTS.md §5 for the rules."""
    res = ValidationResult()
    exclude = frozenset(exclude_order_ids)
    orders = plan.get("orders") if isinstance(plan, dict) else None
    if not isinstance(orders, list):
        res.hard.append(Violation("BAD_PLAN", "The plan has no 'orders' list."))
        return res
    # rule 7
    if len(orders) > max_orders:
        res.hard.append(Violation("TOO_MANY_ORDERS", f"{len(orders)} orders proposed; the limit is {max_orders}."))

    seen_trucks: dict[str, int] = {}
    totals: dict[str, dict[str, int]] = {}
    last_index: dict[str, int] = {}
    for idx, o in enumerate(orders):
        if not isinstance(o, dict):
            res.hard.append(Violation("BAD_ORDER", f"Order {idx + 1} is not an object.", idx))
            continue
        wid, cid, tid = o.get("warehouse_id"), o.get("camp_id"), o.get("truck_id")
        # rule 1
        bad_id = False
        for kind, val, table in (("WAREHOUSE", wid, world.warehouses), ("CAMP", cid, world.camps)):
            if val not in table:
                res.hard.append(Violation(f"UNKNOWN_{kind}", f"Order {idx + 1}: unknown {kind.lower()} '{val}'.", idx))
                bad_id = True
        if tid not in world.trucks:
            res.hard.append(Violation("UNKNOWN_TRUCK", f"Order {idx + 1}: unknown truck '{tid}'.", idx))
            bad_id = True
        # rule 3
        items = _parse_items(o.get("items"))
        if items is None:
            res.hard.append(Violation("BAD_ITEMS", f"Order {idx + 1}: items must be non-negative whole numbers.", idx))
        elif items.is_empty():
            res.hard.append(Violation("EMPTY_ORDER", f"Order {idx + 1} carries nothing.", idx))
        if bad_id or items is None:
            continue
        w, camp, truck = world.warehouses[wid], world.camps[cid], world.trucks[tid]
        # rule 2
        if tid in seen_trucks:
            res.hard.append(
                Violation(
                    "TRUCK_REUSED",
                    f"Truck {tid} is used in orders {seen_trucks[tid] + 1} and {idx + 1}.",
                    idx,
                )
            )
        seen_trucks.setdefault(tid, idx)
        if not world.truck_is_free(tid, exclude):
            res.hard.append(
                Violation("TRUCK_NOT_IDLE", f"Truck {tid} is not idle at a warehouse ({truck.status}).", idx)
            )
        else:
            truck_node = world.warehouses[truck.at_warehouse or ""].node_id
            if world.find_path(truck_node, w.node_id) is None:
                res.hard.append(
                    Violation(
                        "TRUCK_CANNOT_REACH_WAREHOUSE",
                        f"Truck {tid} at {truck.at_warehouse} has no safe road to {w.name}.",
                        idx,
                    )
                )
        # rule 4
        weight = world.weight(items)
        if weight > truck.capacity_kg + 1e-6:
            res.hard.append(
                Violation(
                    "OVER_CAPACITY",
                    f"Truck {tid} is overloaded by {weight - truck.capacity_kg:,.0f} kg "
                    f"({weight:,.0f} kg on a {truck.capacity_kg:,.0f} kg truck).",
                    idx,
                )
            )
        # rule 6
        route = world.find_path(w.node_id, camp.node_id)
        if route is None:
            res.hard.append(Violation("UNREACHABLE", f"No safe road from {w.name} to {camp.name} right now.", idx))
        # rule 5 (accumulate; checked below)
        avail = world.available(w, exclude)
        tot = totals.setdefault(wid, dict.fromkeys(ITEMS, 0))
        uses_reserve = False
        for i in ITEMS:
            tot[i] += items.get(i)
            if tot[i] > avail.get(i):
                uses_reserve = uses_reserve or items.get(i) > 0
        last_index[wid] = idx
        res.orders.append(
            CheckedOrder(
                index=idx,
                warehouse_id=wid,
                camp_id=cid,
                truck_id=tid,
                items=items,
                weight_kg=weight,
                uses_reserve=uses_reserve,
                eta_min=round(route.minutes, 1) if route else None,
                priority=str(o.get("priority") or "normal"),
                reason=str(o.get("reason") or ""),
            )
        )
        # soft: long detour
        if route is not None:
            base = world.graph.safe_path(w.node_id, camp.node_id)
            if base and route.minutes > DETOUR_FACTOR * base.minutes:
                res.soft.append(
                    Violation(
                        "LONG_DETOUR",
                        f"{w.name} → {camp.name} takes {route.minutes / base.minutes:.1f}× the normal time "
                        "because of flooded roads.",
                        idx,
                    )
                )

    for wid, tot in totals.items():
        w = world.warehouses[wid]
        cap = world.available(w, exclude) + world.reserve_held(w, exclude)
        for i in ITEMS:
            over = tot[i] - cap.get(i)
            if over > 0:
                res.hard.append(
                    Violation(
                        "OVER_STOCK",
                        f"{w.name} {ITEM_UNITS[i].split()[-1]} over-allocated by {over:,} "
                        f"{'L' if i == 'water_l' else ITEM_UNITS[i]} (has {cap.get(i):,} incl. reserve).",
                        last_index[wid],
                    )
                )

    _soft_checks(world, res, statuses)
    return res


def _soft_checks(world: WorldState, res: ValidationResult, statuses: dict[str, CampStatus] | None) -> None:
    by_camp: dict[str, Supplies] = {}
    for co in res.orders:
        by_camp[co.camp_id] = by_camp.get(co.camp_id, Supplies()) + co.items
    for cid, sent in by_camp.items():
        camp = world.camps[cid]
        burn = world.burn_per_day(camp)
        total = camp.stock + world.incoming(cid) + sent
        over = [i for i in ITEMS if burn[i] > 0 and total.get(i) > HOARD_DAYS * burn[i] and sent.get(i) > 0]
        if over:
            res.soft.append(
                Violation(
                    "HOARDING",
                    f"{camp.name} would hold more than {HOARD_DAYS} days of "
                    + ", ".join(ITEM_UNITS[i].split()[-1] if i == "water_l" else ITEM_UNITS[i] for i in over)
                    + ".",
                )
            )
    if statuses:
        served = set(by_camp)
        for st in statuses.values():
            if st.status != "critical" or st.cut_off or st.camp_id in served:
                continue
            if st.deficit_24h.is_empty():
                continue
            camp = world.camps[st.camp_id]
            has_stock = any(
                world.available(w).water_l > 0 and world.find_path(w.node_id, camp.node_id)
                for w in world.warehouses.values()
            )
            if has_stock:
                res.soft.append(
                    Violation(
                        "CRITICAL_UNSERVED",
                        f"{camp.name} is critical and reachable, but no order serves it.",
                    )
                )


def describe(res: ValidationResult, limit: int = 3) -> str:
    """'T2 overloaded by 1,240 kg; W1 water over-allocated by 3,000 L.'"""
    msgs = [v.message.rstrip(".") for v in res.hard[:limit]]
    more = len(res.hard) - limit
    return "; ".join(msgs) + (f"; and {more} more" if more > 0 else "") + "."


def weight_note(weight_kg: float) -> str:
    return fmt_kg(weight_kg)
