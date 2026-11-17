"""Heuristic planner: greedy, deterministic fallback that always produces a valid plan."""

from __future__ import annotations

import math
from typing import Any

from app.agents.types import CampStatus
from app.models import ITEMS, Supplies
from app.sim.world import WorldState
from app.text import fmt_days, fmt_items

LOAD_ORDER = ("water_l", "food_rations", "medical_kits")
TARGET_DAYS = 1.3  # top a camp up to 1.3 days of cover (the hoarding limit is 1.5)
MIN_LOAD_KG = 1500  # don't send a truck for less than this...
MIN_LOAD_CRITICAL_KG = 400  # ...unless the camp is critical
MIN_KG_PER_TRUCK_HOUR = 500  # don't tie a truck up for many hours carrying little (wait for a closer one)


def top_up_want(world: WorldState, st: CampStatus) -> dict[str, int]:
    """Quantities that bring a camp to TARGET_DAYS of cover, counting stock already on the way."""
    return {
        i: max(0, math.ceil(TARGET_DAYS * st.burn_per_day[i] - st.stock.get(i) - st.incoming.get(i))) for i in ITEMS
    }


def heuristic_plan(
    world: WorldState,
    statuses: dict[str, CampStatus],
    *,
    max_orders: int = 8,
    approval_threshold_kg: float = 6000,
) -> dict[str, Any]:
    """Serve camps by priority: nearest stocked warehouse, nearest idle truck, water → food → medical.

    Non-critical camps get loads capped at the approval threshold, so routine top-ups don't wait for a
    human. Critical camps may get full truckloads (and, if needed, safety-reserve stock); those go to
    the approval gate.
    """
    avail = {w.id: world.available(w) for w in world.warehouses.values()}
    reserve = {w.id: world.reserve_held(w) for w in world.warehouses.values()}
    trucks = sorted((t for t in world.trucks.values() if world.truck_is_free(t.id)), key=lambda t: t.id)
    camps = sorted(
        (s for s in statuses.values() if not s.cut_off),
        key=lambda s: (-s.priority_score, s.camp_id),
    )
    # only camps projected to run short within 24h are served; they are topped up to TARGET_DAYS
    remaining = {
        s.camp_id: Supplies() if s.deficit_24h.is_empty() else Supplies(**top_up_want(world, s))
        for s in statuses.values()
    }
    orders: list[dict[str, Any]] = []

    progress = True
    while progress and trucks and len(orders) < max_orders:
        progress = False
        for st in camps:
            if not trucks or len(orders) >= max_orders:
                break
            deficit = remaining[st.camp_id]
            if deficit.is_empty():
                continue
            want = deficit.as_dict()
            critical = st.status == "critical"
            choice = _pick_source(world, st, trucks, want, avail, reserve if critical else None)
            if choice is None:
                continue
            w_id, truck_id, eta = choice
            truck = world.trucks[truck_id]
            cap = truck.capacity_kg if critical else min(truck.capacity_kg, approval_threshold_kg)
            items, used_reserve = _load(world, want, avail[w_id], reserve[w_id] if critical else None, cap)
            weight = world.weight(items)
            if weight < (MIN_LOAD_CRITICAL_KG if critical else MIN_LOAD_KG):
                continue
            if weight / max(eta / 60, 0.25) < MIN_KG_PER_TRUCK_HOUR:
                continue
            avail[w_id] = (avail[w_id] - items).clamp0()
            if used_reserve:
                reserve[w_id] = (reserve[w_id] - used_reserve).clamp0()
            remaining[st.camp_id] = (deficit - items).clamp0()
            trucks = [t for t in trucks if t.id != truck_id]
            orders.append(
                {
                    "warehouse_id": w_id,
                    "camp_id": st.camp_id,
                    "truck_id": truck_id,
                    "items": items.as_dict(),
                    "priority": "critical" if critical else "high" if st.status == "low" else "normal",
                    "reason": _reason(world, st, w_id, items, eta),
                }
            )
            progress = True

    unserved = []
    for st in sorted(statuses.values(), key=lambda s: (-s.priority_score, s.camp_id)):
        if remaining[st.camp_id].is_empty() or st.status == "ok":
            continue
        if any(o["camp_id"] == st.camp_id for o in orders):
            continue
        why = (
            "Cut off by flooding: request boat/air drop"
            if st.cut_off
            else "No idle truck could reach it this cycle"
            if not trucks
            else "No reachable warehouse has stock to spare"
        )
        unserved.append({"camp_id": st.camp_id, "why": why})

    return {"orders": orders, "unserved": unserved, "summary": _summary(world, orders, unserved)}


def _pick_source(
    world: WorldState,
    st: CampStatus,
    trucks: list,
    want: dict[str, int],
    avail: dict[str, Supplies],
    reserve: dict[str, Supplies] | None,
) -> tuple[str, str, float] | None:
    camp = world.camps[st.camp_id]
    best: tuple[float, str, str] | None = None
    load_min = world.c["load_min"]
    for w in sorted(world.warehouses.values(), key=lambda w: w.id):
        usable = avail[w.id] + (reserve[w.id] if reserve else Supplies())
        if not any(want[i] and usable.get(i) for i in ITEMS):
            continue
        route = world.find_path(w.node_id, camp.node_id)
        if route is None:
            continue
        for t in trucks:
            t_node = world.warehouses[t.at_warehouse].node_id
            leg = world.find_path(t_node, w.node_id)
            if leg is None:
                continue
            eta = leg.minutes + load_min + route.minutes
            key = (eta, w.id, t.id)
            if best is None or key < best:
                best = key
    return None if best is None else (best[1], best[2], best[0])


def _load(
    world: WorldState,
    want: dict[str, int],
    avail: Supplies,
    reserve: Supplies | None,
    cap_kg: float,
) -> tuple[Supplies, Supplies | None]:
    out = dict.fromkeys(ITEMS, 0)
    from_reserve = dict.fromkeys(ITEMS, 0)
    left = cap_kg
    for i in LOAD_ORDER:
        uw = world.unit_weight[i]
        fit = int(left // uw)
        qty = min(want[i], avail.get(i), fit)
        if reserve is not None and i == "water_l" and qty < min(want[i], fit):
            extra = min(min(want[i], fit) - qty, reserve.get(i))
            from_reserve[i] = extra
            qty += extra
        out[i] = qty
        left -= qty * uw
    used = Supplies(**from_reserve)
    return Supplies(**out), (None if used.is_empty() else used)


def _reason(world: WorldState, st: CampStatus, w_id: str, items: Supplies, eta: float) -> str:
    w = world.warehouses[w_id]
    hours = eta / 60
    return (
        f"{st.name} has {fmt_days(st.water_days)} of water for {st.population:,} people; "
        f"{w.name} is the fastest stocked source ({hours:.1f}h incl. loading); {fmt_items(items)} "
        f"tops it up towards {TARGET_DAYS:g} days."
    )


def _summary(world: WorldState, orders: list[dict], unserved: list[dict]) -> str:
    if not orders and not unserved:
        return "All camps are covered for the next 24 hours. No new orders."
    camps = [world.camps[o["camp_id"]].name.replace(" Relief Camp", "") for o in orders]
    n = len(orders)
    s = f"{n} order{'s' if n != 1 else ''}: " + ", ".join(camps) + "." if orders else "No trucks free this cycle."
    cut = [world.camps[u["camp_id"]].name.replace(" Relief Camp", "") for u in unserved if "Cut off" in u["why"]]
    if cut:
        s += " Cut off, needs boat/air drop: " + ", ".join(cut) + "."
    return s
