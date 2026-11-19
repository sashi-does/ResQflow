"""Routing agent: safe paths, the warehouse→camp route matrix, and in-flight re-routing.

Fully deterministic. Runs immediately on every hazard change (before any planning).
"""

from __future__ import annotations

from dataclasses import dataclass

from shapely.geometry import LineString, shape
from shapely.ops import substring

from app.models import Hazard, Truck
from app.sim import engine
from app.sim.world import WorldState
from app.text import describe_route, fmt_duration

RECEDE_GAIN = 0.15  # switch back only if at least 15% faster
CANCEL_REPOSITION_FACTOR = 2.0  # an empty truck whose detour is >2x (+1h) gives up the order


@dataclass
class RouteOption:
    minutes: float
    nodes: list[str]
    edge_ids: list[str]
    progress_km: float
    may_cross_blocked: bool
    roads: list[str]
    via_turnback: bool


class RoutingAgent:
    """Keeps every moving truck on roads that are safe right now."""

    # ------------------------------------------------------------ matrix
    def matrix(self, world: WorldState) -> list[dict]:
        return world.graph.route_matrix(
            {w.id: w.node_id for w in world.warehouses.values()},
            {c.id: c.node_id for c in world.camps.values()},
            world.routing_blocked(),
        )

    # ------------------------------------------------------------ hazard added
    def on_hazard_added(self, world: WorldState, hazard: Hazard) -> list[str]:
        """Re-route every truck whose remaining path crosses a newly flooded road. Returns affected truck ids."""
        blocked = world.blocked_edge_ids()
        changed = []
        for t in sorted(world.trucks.values(), key=lambda t: t.id):
            if t.status not in ("en_route", "returning") or not t.path_edge_ids:
                continue
            hit = self._flooded_ahead(world, t, blocked)
            if not hit:
                if t.path_edge_ids[0] in blocked:
                    t.may_cross_blocked = True  # the flood is behind it on this road: carry on
                continue
            self._reroute(world, t, blocked, hazard, hit)
            changed.append(t.id)
        return changed

    def _flooded_ahead(self, world: WorldState, t: Truck, blocked: set[str]) -> list[str]:
        hit = []
        for i, eid in enumerate(t.path_edge_ids):
            if eid not in blocked:
                continue
            if i == 0 and t.progress_km > 0:
                e = world.graph.edges[eid]
                if self.segment_clear(world, eid, t.progress_km / e.length_km, 1.0, t.path_nodes[0]):
                    continue
            hit.append(eid)
        return hit

    def _reroute(self, world: WorldState, t: Truck, blocked: set[str], hazard: Hazard, hit: list[str]) -> None:
        old_coords = world.truck_path_coords(t)
        old_min = engine.remaining_minutes(world, t)
        dest = self._destination(world, t)
        opt = self._best_option(world, t, dest, blocked)
        road = world.graph.edges[hit[0]].road
        where = self._trip(world, t)
        order = world.orders.get(t.order_id or "")
        if (
            t.leg == "reposition"
            and order is not None
            and (opt is None or opt.minutes > CANCEL_REPOSITION_FACTOR * old_min + 60)
        ):
            self._cancel_reposition(world, t, road, hazard, opt.minutes if opt else None)
            self._publish(
                world,
                t,
                old_coords,
                old_min,
                f"{road} flooded",
                f"Job cancelled. {road.split(' (')[0]} is flooded. Return to the nearest warehouse for a new job.",
            )
            return
        if opt is None:
            self._hold_safely(world, t, blocked)
            world.bus.log(
                "routing",
                "truck.holding",
                f"Truck {t.id} {where} is holding: {road} is closed ({hazard.label}) and there is no other safe road.",
                "It waits at the nearest safe point and moves as soon as a road reopens.",
                truck_ids=[t.id],
                hazard_ids=[hazard.id],
                edge_ids=hit,
            )
            self._publish(
                world,
                t,
                old_coords,
                old_min,
                f"{road} flooded",
                f"Stop at the next safe point. {road.split(' (')[0]} is flooded and there is no other safe road.",
            )
            return
        same_route = opt.edge_ids == t.path_edge_ids and not opt.via_turnback
        engine.apply_route(
            world, t, opt.nodes, opt.edge_ids, opt.progress_km, opt.may_cross_blocked, status=t.status, leg=t.leg
        )
        if same_route:
            e0 = world.graph.edges[opt.edge_ids[0]]
            world.bus.log(
                "routing",
                "truck.in_flood",
                f"Truck {t.id} {where} was already inside the flooded {road.split(' (')[0]} stretch when it was "
                f"reported. The nearest way out is ahead ({e0.length_km - opt.progress_km:.0f} km to "
                f"{world.node_name(opt.nodes[1]).split(' (')[0]}), so it carries on carefully.",
                "Turning back would mean driving further through the water.",
                truck_ids=[t.id],
                hazard_ids=[hazard.id],
                edge_ids=hit,
            )
            return
        towns = [world.node_name(n) for n in opt.nodes[1:-1]]
        turn = (
            f" It was approaching the flooded stretch, so it turned back to {world.node_name(opt.nodes[1])} first."
            if opt.via_turnback
            else ""
        )
        world.bus.log(
            "routing",
            "truck.rerouted",
            f"Re-routed Truck {t.id} {where} via {describe_route(towns, opt.roads)}. "
            f"{road.split(' (')[0]} near {self._near(world, hit[0])} is flooded. "
            f"ETA was {fmt_duration(old_min)}, now {fmt_duration(opt.minutes)}"
            + (", slower but the route is safe." if opt.minutes > old_min else "."),
            f'The planned route crossed {", ".join(hit)}, closed by "{hazard.label}".{turn} '
            "The new route is the fastest one that avoids every closed road.",
            truck_ids=[t.id],
            hazard_ids=[hazard.id],
            edge_ids=hit,
            order_ids=[t.order_id] if t.order_id else [],
            camp_ids=[world.orders[t.order_id].camp_id] if t.order_id in world.orders else [],
        )
        delta = opt.minutes - old_min
        self._publish(
            world,
            t,
            old_coords,
            old_min,
            f"{road} flooded",
            f"Route changed. {road.split(' (')[0]} flooded near {self._near(world, hit[0])}. "
            f"New route via {describe_route(towns, opt.roads)}. "
            + (f"+{fmt_duration(delta)}." if delta > 1 else "Same arrival time."),
        )

    def _cancel_reposition(self, world: WorldState, t: Truck, road: str, hazard: Hazard, new_min: float | None) -> None:
        order = world.orders[t.order_id or ""]
        w = world.warehouses[order.warehouse_id]
        w.stock = w.stock + order.items  # stock was set aside at dispatch; give it back
        order.status = "failed"
        t.order_id = None
        detour = f"the detour would take {fmt_duration(new_min)}" if new_min else "there is no safe road"
        world.bus.log(
            "routing",
            "order.cancelled",
            f"Cancelled order {order.id}: Truck {t.id} was driving empty to {w.name}, but {road.split(' (')[0]} "
            f"is flooded and {detour}. The truck returns to the nearest warehouse for a new assignment.",
            "Sending an empty truck on a very long detour wastes capacity. The coordinator will re-plan with "
            "trucks that are closer.",
            truck_ids=[t.id],
            order_ids=[order.id],
            hazard_ids=[hazard.id],
        )
        world.bus.publish("order.updated", order.model_dump())
        node = self._nearest_warehouse_node(world, t)
        opt = self._best_option(world, t, node, world.blocked_edge_ids()) if node else None
        if opt is None:
            self._hold_safely(world, t, world.blocked_edge_ids())
        else:
            engine.apply_route(
                world,
                t,
                opt.nodes,
                opt.edge_ids,
                opt.progress_km,
                opt.may_cross_blocked,
                status="returning",
                leg="return",
            )

    # ------------------------------------------------------------ hazard removed
    def on_hazard_removed(self, world: WorldState, hazard: Hazard) -> list[str]:
        """Switch trucks back to reopened roads if that's ≥15% faster; resume holding trucks."""
        blocked = world.blocked_edge_ids()
        changed = []
        reopened = ", ".join(sorted({world.graph.edges[e].road.split(" (")[0] for e in hazard.edge_ids}))
        for t in sorted(world.trucks.values(), key=lambda t: t.id):
            if t.status == "holding" or (t.leg == "hold" and t.status in ("en_route", "returning")):
                if self._resume(world, t, reopened):
                    changed.append(t.id)
                continue
            if t.status not in ("en_route", "returning") or not t.path_edge_ids:
                continue
            current = engine.remaining_minutes(world, t)
            opt = self._best_option(world, t, self._destination(world, t), blocked)
            if opt is None or opt.minutes > (1 - RECEDE_GAIN) * current:
                continue
            old_coords = world.truck_path_coords(t)
            engine.apply_route(
                world, t, opt.nodes, opt.edge_ids, opt.progress_km, opt.may_cross_blocked, status=t.status, leg=t.leg
            )
            towns = [world.node_name(n) for n in opt.nodes[1:-1]]
            world.bus.log(
                "routing",
                "truck.rerouted",
                f"{reopened} has reopened. Truck {t.id} {self._trip(world, t)} switched back to the faster road "
                f"via {describe_route(towns, opt.roads)}: ETA {fmt_duration(current)} → {fmt_duration(opt.minutes)}.",
                f"The reopened road is {100 * (1 - opt.minutes / current):.0f}% faster than its current route "
                f"(the threshold for switching is {RECEDE_GAIN:.0%}).",
                truck_ids=[t.id],
                hazard_ids=[hazard.id],
                edge_ids=list(hazard.edge_ids),
            )
            self._publish(
                world,
                t,
                old_coords,
                current,
                f"{reopened} reopened",
                f"Road reopened: {reopened}. Switch back to the faster route, "
                f"{fmt_duration(current - opt.minutes)} quicker.",
            )
            changed.append(t.id)
        return changed

    def _resume(self, world: WorldState, t: Truck, reopened: str) -> bool:
        dest = self._intended_destination(world, t)
        if dest is None:
            return False
        opt = self._best_option(world, t, dest, world.blocked_edge_ids())
        if opt is None:
            return False
        order = world.orders.get(t.order_id or "")
        if order is None or order.status != "dispatched":
            leg = "return"
        else:
            leg = "delivery" if not t.cargo.is_empty() else "reposition"
        status = "returning" if leg == "return" else "en_route"
        engine.apply_route(
            world, t, opt.nodes, opt.edge_ids, opt.progress_km, opt.may_cross_blocked, status=status, leg=leg
        )
        world.bus.log(
            "routing",
            "truck.resumed",
            f"Truck {t.id} is moving again: {reopened} is open. ETA {fmt_duration(opt.minutes)}.",
            truck_ids=[t.id],
        )
        engine.emit_truck(world, t)
        return True

    def resume_holding(self, world: WorldState) -> None:
        """Any holding truck that now has a safe road moves on (called each cycle)."""
        for t in sorted(world.trucks.values(), key=lambda t: t.id):
            if t.status == "holding":
                self._resume(world, t, "a safe road")

    # ------------------------------------------------------------ geometry
    @staticmethod
    def segment_clear(world: WorldState, edge_id: str, f0: float, f1: float, from_node: str) -> bool:
        """True if the part of `edge_id` between fractions f0..f1 (measured from `from_node`) is outside all floods."""
        geom = world.graph.oriented_geometry(edge_id, from_node)
        line = LineString([(lon, lat) for lat, lon in geom])
        part = substring(line, max(0.0, f0), min(1.0, f1), normalized=True)
        for h in world.hazards.values():
            if edge_id not in h.edge_ids:
                continue
            if h.polygon is None or part.intersects(shape(h.polygon)):
                return False
        return True

    # ------------------------------------------------------------ helpers
    def _intended_destination(self, world: WorldState, t: Truck) -> str | None:
        order = world.orders.get(t.order_id or "")
        if order and order.status == "dispatched":
            if not t.cargo.is_empty():
                return world.camps[order.camp_id].node_id
            return world.warehouses[order.warehouse_id].node_id
        return self._nearest_warehouse_node(world, t)

    def _nearest_warehouse_node(self, world: WorldState, t: Truck) -> str | None:
        starts = [t.node_id] if t.node_id else list(dict.fromkeys(t.path_nodes[:2]))
        best = None
        for start in starts:
            for w in sorted(world.warehouses.values(), key=lambda w: w.id):
                p = world.find_path(start, w.node_id) if start else None
                if p and (best is None or p.minutes < best[0]):
                    best = (p.minutes, w.node_id)
        return best[1] if best else None

    def _destination(self, world: WorldState, t: Truck) -> str:
        if t.leg in ("return", "hold"):
            return self._intended_destination(world, t) or (t.destination_node or "")
        return t.destination_node or (t.path_nodes[-1] if t.path_nodes else "")

    def _best_option(self, world: WorldState, t: Truck, dest: str, blocked: set[str]) -> RouteOption | None:
        g = world.graph
        options: list[RouteOption] = []
        if t.path_edge_ids and t.progress_km > 0:
            e0 = g.edges[t.path_edge_ids[0]]
            behind, ahead = t.path_nodes[0], t.path_nodes[1]
            frac = t.progress_km / e0.length_km if e0.length_km else 1.0
            e0_blocked = e0.id in blocked
            fwd_ok = not e0_blocked or self.segment_clear(world, e0.id, frac, 1.0, behind)
            back_ok = not e0_blocked or self.segment_clear(world, e0.id, 0.0, frac, behind)
            if not fwd_ok and not back_ok:  # caught inside the water: take the shorter way out
                fwd_ok = back_ok = True
            if fwd_ok:
                p = world.find_path(ahead, dest)
                if p:
                    options.append(
                        RouteOption(
                            e0.minutes * (1 - frac) + p.minutes,
                            [behind, *p.nodes],
                            [e0.id, *p.edge_ids],
                            t.progress_km,
                            e0_blocked,
                            _roads(e0.road, p.roads),
                            False,
                        )
                    )
            if back_ok:
                p = world.find_path(behind, dest)
                if p:
                    options.append(
                        RouteOption(
                            e0.minutes * frac + p.minutes,
                            [ahead, *p.nodes],
                            [e0.id, *p.edge_ids],
                            e0.length_km - t.progress_km,
                            e0_blocked,
                            _roads(e0.road, p.roads),
                            True,
                        )
                    )
        else:
            start = t.path_nodes[0] if t.path_nodes else (t.node_id or "")
            p = world.find_path(start, dest)
            if p:
                options.append(RouteOption(p.minutes, p.nodes, p.edge_ids, 0.0, False, p.roads, False))
        if not options:
            return None
        return min(options, key=lambda o: (round(o.minutes, 3), o.via_turnback))

    def _hold_safely(self, world: WorldState, t: Truck, blocked: set[str]) -> None:
        """No safe route: stop at the nearest safe node (retreat if the road ahead is flooded)."""
        if t.path_edge_ids and t.progress_km > 0:
            e0 = world.graph.edges[t.path_edge_ids[0]]
            behind, ahead = t.path_nodes[0], t.path_nodes[1]
            frac = t.progress_km / e0.length_km if e0.length_km else 1.0
            fwd_ok = e0.id not in blocked or self.segment_clear(world, e0.id, frac, 1.0, behind)
            if fwd_ok:
                nodes, prog = [behind, ahead], t.progress_km
            else:
                nodes, prog = [ahead, behind], e0.length_km - t.progress_km
            engine.apply_route(world, t, nodes, [e0.id], prog, e0.id in blocked, status="en_route", leg="hold")
        else:
            engine._hold(world, t, "no safe road onward")

    @staticmethod
    def _near(world: WorldState, edge_id: str) -> str:
        e = world.graph.edges[edge_id]
        towns = [n for n in (e.a, e.b) if world.graph.nodes[n].kind == "town"] or [e.b]
        return world.node_name(towns[-1]).split(" (")[0]

    def _trip(self, world: WorldState, t: Truck) -> str:
        order = world.orders.get(t.order_id or "")
        if order and t.leg in ("delivery", "reposition", "hold"):
            w = world.warehouses[order.warehouse_id].name
            c = world.camps[order.camp_id].name.replace(" Relief Camp", " camp")
            return f"({w} → {c})"
        return "(returning to base)"

    def _publish(
        self, world: WorldState, t: Truck, old_coords: list, old_min: float, reason: str, message: str = ""
    ) -> None:
        world.bus.publish(
            "truck.rerouted",
            {
                "truck_id": t.id,
                "message": message or f"Route changed: {reason}.",
                "old_path_coords": old_coords,
                "new_path_coords": world.truck_path_coords(t),
                "reason": reason,
                "old_eta_sim_seconds": int(world.sim_seconds + old_min * 60),
                "new_eta_sim_seconds": t.eta_sim_seconds,
            },
        )


def _roads(first: str, rest: list[str]) -> list[str]:
    """Road names in travel order, without consecutive duplicates."""
    out = [first]
    for r in rest:
        if r != out[-1]:
            out.append(r)
    return out
