"""Phase 2 placeholder policy: at t=0 send one full truck to each of the 3 neediest camps.

Replaced by the agent orchestrator in Phase 3. Kept for engine tests.
"""

from __future__ import annotations

from app.geo.hazards import hazard_from_preset
from app.models import ITEMS, Order, Supplies
from app.sim import engine
from app.sim.runner import TimelineEvent
from app.sim.world import WorldState


class StubPolicy:
    def __init__(self) -> None:
        self.started = False

    def on_step(self, world: WorldState, events: list[TimelineEvent]) -> None:
        for ev in events:
            apply_hazard_event(world, ev)
        if not self.started:
            self.started = True
            self._dispatch_neediest(world, 3)

    def _dispatch_neediest(self, world: WorldState, n: int) -> None:
        camps = sorted(world.camps.values(), key=lambda c: (world.days_of_cover(c), c.id))[:n]
        idle = [t for t in world.trucks.values() if t.status == "idle"]
        for camp in camps:
            best = None
            for t in idle:
                w = world.warehouses[t.at_warehouse or ""]
                p = world.find_path(w.node_id, camp.node_id)
                if p and (best is None or p.minutes < best[0]):
                    best = (p.minutes, t, w)
            if best is None:
                continue
            _, t, w = best
            idle.remove(t)
            items = _fill(
                world, camp_burn=world.burn_per_day(camp), cap=t.capacity_kg, avail=world.available(w)
            )
            order = Order(
                id=world.new_order_id(),
                warehouse_id=w.id,
                camp_id=camp.id,
                truck_id=t.id,
                items=items,
                weight_kg=world.weight(items),
                reason="Phase 2 stub: neediest camp.",
                created_at_sim=world.sim_seconds,
            )
            world.orders[order.id] = order
            engine.dispatch(world, order)


def _fill(world: WorldState, camp_burn: dict[str, float], cap: float, avail: Supplies) -> Supplies:
    out = dict.fromkeys(ITEMS, 0)
    left = cap
    for item in ("water_l", "food_rations", "medical_kits"):
        want = int(camp_burn[item])
        qty = min(want, avail.get(item), int(left // world.unit_weight[item]))
        out[item] = qty
        left -= qty * world.unit_weight[item]
    return Supplies(**out)


def apply_hazard_event(world: WorldState, ev: TimelineEvent) -> None:
    """Minimal timeline handling (the Monitor agent takes this over in Phase 3)."""
    if ev.action == "hazard_add" and ev.preset_id:
        preset = world.scenario.presets[ev.preset_id]
        world.add_hazard(hazard_from_preset(preset, world.graph, world.new_hazard_id(), world.sim_seconds))
    elif ev.action == "hazard_remove" and ev.preset_id:
        for hid, h in list(world.hazards.items()):
            if h.preset_id == ev.preset_id:
                world.remove_hazard(hid)
