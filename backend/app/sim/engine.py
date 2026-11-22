"""Deterministic simulation step: consumption, truck movement, loading/unloading, deliveries, KPIs.

Policy-agnostic: agents (or the static baseline policy) decide orders and routes between steps.
"""

from __future__ import annotations

import math

from app.geo.graph import Path
from app.geo.util import haversine_km
from app.models import ITEMS, Order, Supplies, Truck
from app.sim.clock import STEP_S
from app.sim.world import WorldState
from app.text import fmt_days, fmt_items

SECONDS_PER_DAY = 86400


# --------------------------------------------------------------------------- public API
def step(world: WorldState, dt: int = STEP_S) -> None:
    """Advance the world by one fixed step of `dt` sim seconds."""
    world.sim_seconds += dt
    _consume(world, dt)
    blocked = world.blocked_edge_ids()
    for t in world.trucks.values():
        _update_truck(world, t, dt, blocked)


def dispatch(world: WorldState, order: Order) -> None:
    """Start executing an approved order: deduct stock, then load (or reposition first)."""
    t = world.trucks[order.truck_id]
    w = world.warehouses[order.warehouse_id]
    w.stock = (w.stock - order.items).clamp0()
    order.status = "dispatched"
    t.order_id = order.id
    if t.node_id == w.node_id:
        _start_loading(world, t)
    else:
        path = world.find_path(t.node_id or "", w.node_id)
        if path is None:
            _hold(world, t, f"no safe road to {w.name} to load")
        else:
            set_path(world, t, path, status="en_route", leg="reposition")
    emit_truck(world, t)


def set_path(world: WorldState, t: Truck, path: Path, *, status: str, leg: str | None) -> None:
    apply_route(world, t, list(path.nodes), list(path.edge_ids), 0.0, False, status=status, leg=leg)


def apply_route(
    world: WorldState,
    t: Truck,
    nodes: list[str],
    edge_ids: list[str],
    progress_km: float,
    may_cross_blocked: bool,
    *,
    status: str,
    leg: str | None,
) -> None:
    """Set a truck's remaining route. `nodes[0]` is the node it is moving away from."""
    t.path_nodes = nodes
    t.path_edge_ids = edge_ids
    t.progress_km = progress_km
    t.may_cross_blocked = may_cross_blocked
    t.node_id = nodes[0] if progress_km == 0 else None
    t.status = status  # type: ignore[assignment]
    t.leg = leg  # type: ignore[assignment]
    t.at_warehouse = None
    t.destination_node = nodes[-1]
    _update_eta(world, t)


def emit_truck(world: WorldState, t: Truck) -> None:
    order = world.orders.get(t.order_id or "")
    world.bus.publish(
        "truck.updated",
        {
            "truck_id": t.id,
            "status": t.status,
            "path_coords": world.truck_path_coords(t),
            "order_id": t.order_id,
            "heading_to": order.camp_id if order and t.leg == "delivery" else t.destination_node,
            "at_warehouse": t.at_warehouse,
            "eta_sim_seconds": t.eta_sim_seconds,
        },
    )


def remaining_minutes(world: WorldState, t: Truck) -> float:
    if not t.path_edge_ids:
        return 0.0
    edges = [world.graph.edges[e] for e in t.path_edge_ids]
    first = edges[0]
    frac_left = max(0.0, 1 - t.progress_km / first.length_km) if first.length_km else 0.0
    return first.minutes * frac_left + sum(e.minutes for e in edges[1:])


def send_to_nearest_warehouse(world: WorldState, t: Truck) -> None:
    """Head for the nearest reachable warehouse (finishing the current road first if mid-edge)."""
    mid_edge = t.node_id is None and len(t.path_nodes) > 1 and bool(t.path_edge_ids)
    node = t.path_nodes[1] if mid_edge else (t.node_id or "")
    here = world.warehouse_at_node(node)
    if here and not mid_edge:
        _become_idle(world, t, here.id)
        return
    best: tuple[float, str, Path] | None = None
    open_ = [w for w in world.warehouses.values() if not w.offline] or list(world.warehouses.values())
    for w in sorted(open_, key=lambda w: w.id):
        p = world.find_path(node, w.node_id)
        if p and (best is None or p.minutes < best[0]):
            best = (p.minutes, w.id, p)
    if best is None:
        if mid_edge:  # finish this road, then hold at the next node
            apply_route(
                world,
                t,
                t.path_nodes[:2],
                t.path_edge_ids[:1],
                t.progress_km,
                t.may_cross_blocked,
                status="en_route",
                leg="hold",
            )
        else:
            _hold(world, t, "no safe road back to any warehouse")
        return
    if mid_edge:
        p = best[2]
        apply_route(
            world,
            t,
            [t.path_nodes[0], *p.nodes],
            [t.path_edge_ids[0], *p.edge_ids],
            t.progress_km,
            t.may_cross_blocked,
            status="returning",
            leg="return",
        )
    else:
        set_path(world, t, best[2], status="returning", leg="return")
    emit_truck(world, t)


# --------------------------------------------------------------------------- consumption & KPIs
def _consume(world: WorldState, dt: int) -> None:
    for camp in world.camps.values():
        acc = world._consumption_acc[camp.id]
        stock = camp.stock.as_dict()
        for item in ITEMS:
            acc[item] += camp.population * world.per_capita[item] * dt / SECONDS_PER_DAY
            whole = math.floor(acc[item])
            stock[item] -= min(whole, stock[item])
            acc[item] -= whole
        camp.stock = Supplies(**stock)
        hours = dt / 3600
        if camp.stock.water_l == 0:
            world.kpi.people_hours_without_water += camp.population * hours
            for o in world.orders.values():
                if o.camp_id == camp.id and o.status in ("proposed", "awaiting_approval", "dispatched"):
                    world.kpi.late_order_ids.add(o.id)
        if camp.stock.food_rations == 0:
            world.kpi.people_hours_without_food += camp.population * hours


# --------------------------------------------------------------------------- trucks
def _update_truck(world: WorldState, t: Truck, dt: int, blocked: set[str]) -> None:
    t.stuck = False
    if t.status == "loading":
        w = world.warehouses.get(t.at_warehouse or "")
        if w is not None and w.offline:  # supply disruption: the truck waits at the closed yard
            t.stuck = True
            world.kpi.truck_hours_stuck += dt / 3600
            return
        t.timer_s -= dt
        if t.timer_s <= 0:
            _finish_loading(world, t)
    elif t.status == "unloading":
        t.timer_s -= dt
        if t.timer_s <= 0:
            _finish_unloading(world, t)
    elif t.status == "holding":
        t.stuck = True
        world.kpi.truck_hours_stuck += dt / 3600
    elif t.status in ("en_route", "returning"):
        _move(world, t, dt, blocked)


def _move(world: WorldState, t: Truck, dt: float, blocked: set[str]) -> None:
    remaining = float(dt)
    while remaining > 1e-9 and t.path_edge_ids:
        e = world.graph.edges[t.path_edge_ids[0]]
        if e.id in blocked and not t.may_cross_blocked:
            # The road ahead (or under the truck) is flooded: wait until it reopens.
            t.stuck = True
            world.kpi.truck_hours_stuck += remaining / 3600
            break
        km_left = e.length_km - t.progress_km
        secs_needed = km_left / e.speed_kmh * 3600
        t.node_id = None
        if secs_needed <= remaining:
            remaining -= secs_needed
            t.path_nodes.pop(0)
            t.path_edge_ids.pop(0)
            t.progress_km = 0.0
            t.may_cross_blocked = False
            t.node_id = t.path_nodes[0]
        else:
            t.progress_km += e.speed_kmh * remaining / 3600
            remaining = 0.0
    _update_position(world, t)
    _update_eta(world, t)
    if not t.path_edge_ids:
        _arrive(world, t)


def _update_position(world: WorldState, t: Truck) -> None:
    if not t.path_edge_ids:
        node = world.graph.nodes[t.path_nodes[0] if t.path_nodes else t.node_id or ""]
        t.position.lat, t.position.lon = node.lat, node.lon
        return
    e = world.graph.edges[t.path_edge_ids[0]]
    geom = world.graph.oriented_geometry(e.id, t.path_nodes[0])
    frac = min(1.0, t.progress_km / e.length_km) if e.length_km else 1.0
    seg = [haversine_km(geom[i], geom[i + 1]) for i in range(len(geom) - 1)]
    target = frac * sum(seg)
    for i, s in enumerate(seg):
        if target <= s or i == len(seg) - 1:
            f = 0.0 if s == 0 else min(1.0, target / s)
            a, b = geom[i], geom[i + 1]
            t.position.lat = round(a[0] + (b[0] - a[0]) * f, 6)
            t.position.lon = round(a[1] + (b[1] - a[1]) * f, 6)
            return
        target -= s


def _update_eta(world: WorldState, t: Truck) -> None:
    if t.path_edge_ids:
        t.eta_sim_seconds = int(world.sim_seconds + remaining_minutes(world, t) * 60)
    else:
        t.eta_sim_seconds = None


def _arrive(world: WorldState, t: Truck) -> None:
    node = t.path_nodes[0] if t.path_nodes else t.node_id
    t.node_id = node
    t.path_nodes, t.path_edge_ids, t.progress_km = [], [], 0.0
    t.destination_node = None
    if t.leg == "hold":
        _hold(world, t, "no safe road onward")
        return
    if t.leg == "reposition":
        _start_loading(world, t)
    elif t.leg == "delivery":
        t.status = "unloading"
        t.timer_s = world.c["unload_min"] * 60
    else:
        w = world.warehouse_at_node(node)
        if w:
            _become_idle(world, t, w.id)
        else:
            send_to_nearest_warehouse(world, t)
            return
    emit_truck(world, t)


def _start_loading(world: WorldState, t: Truck) -> None:
    w = world.warehouse_at_node(t.node_id)
    t.status = "loading"
    t.leg = None
    t.at_warehouse = w.id if w else None
    t.timer_s = world.c["load_min"] * 60


def _finish_loading(world: WorldState, t: Truck) -> None:
    order = world.orders[t.order_id or ""]
    t.cargo = order.items
    camp = world.camps[order.camp_id]
    path = world.find_path(t.node_id or "", camp.node_id)
    if path is None:
        _hold(world, t, f"no safe road to {camp.name}")
    else:
        set_path(world, t, path, status="en_route", leg="delivery")
    emit_truck(world, t)


def _finish_unloading(world: WorldState, t: Truck) -> None:
    order = world.orders[t.order_id or ""]
    camp = world.camps[order.camp_id]
    camp.stock = camp.stock + t.cargo
    order.status = "delivered"
    order.delivered_at_sim = world.sim_seconds
    minutes = (world.sim_seconds - order.created_at_sim) / 60
    on_time = world.kpi.record_delivery(order.id, minutes, world.weight(t.cargo))
    world.bus.log(
        "dispatcher",
        "delivery",
        f"Truck {t.id} delivered {fmt_items(t.cargo)} to {camp.name}. "
        f"Water cover is now {fmt_days(world.water_days(camp))}.",
        "Arrived before the camp ran out of water."
        if on_time
        else "Late: the camp ran out of water before this truck arrived.",
        truck_ids=[t.id],
        camp_ids=[camp.id],
        order_ids=[order.id],
    )
    world.bus.publish("order.updated", order.model_dump())
    t.cargo = Supplies()
    t.order_id = None
    send_to_nearest_warehouse(world, t)


def _become_idle(world: WorldState, t: Truck, warehouse_id: str) -> None:
    if not t.cargo.is_empty():  # a recalled load goes back into stock
        w = world.warehouses[warehouse_id]
        w.stock = w.stock + t.cargo
        t.cargo = Supplies()
    t.status = "idle"
    t.leg = None
    t.at_warehouse = warehouse_id
    t.path_nodes, t.path_edge_ids = [], []
    t.eta_sim_seconds = None
    t.destination_node = None


def _hold(world: WorldState, t: Truck, why: str) -> None:
    t.status = "holding"
    t.path_edge_ids = []
    t.path_nodes = [t.node_id] if t.node_id else []
    t.eta_sim_seconds = None
    where = world.node_name(t.node_id) if t.node_id else "its position"
    world.bus.log("routing", "truck.holding", f"Truck {t.id} is holding at {where}: {why}.", truck_ids=[t.id])
    world.bus.publish(
        "truck.holding",
        {"truck_id": t.id, "node_id": t.node_id, "lat": t.position.lat, "lon": t.position.lon, "reason": why},
    )
