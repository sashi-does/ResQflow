"""Supply agent: watches each warehouse's free stock and re-orders from its regional supplier before it runs dry.

A restock is an agent decision (the static plan never re-orders). It arrives after the supplier's lead time; a
warehouse that is offline when it arrives takes it when it reopens. Every order and arrival is logged, and an
arrival triggers a re-plan so the new stock is used at once.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import ITEMS, Supplies
from app.sim.world import WorldState
from app.text import fmt_duration, fmt_items

LOW_RATIO = 0.35  # re-order when free stock of any item falls below 35% of the warehouse's opening stock
TARGET_RATIO = 0.8  # …and top it back up towards 80%
CHECK_EVERY_S = 30 * 60


@dataclass
class Restock:
    id: str
    warehouse_id: str
    supplier: str
    items: Supplies
    ordered_at: int
    arrives_at: int
    delivered: bool = False


class SupplyAgent:
    """Re-orders stock from regional suppliers (scenario `suppliers`) and receives it when it arrives."""

    def __init__(self) -> None:
        self.restocks: list[Restock] = []
        self._last_check: int | None = None

    def pending(self, warehouse_id: str | None = None) -> list[Restock]:
        return [
            r for r in self.restocks if not r.delivered and (warehouse_id is None or r.warehouse_id == warehouse_id)
        ]

    def on_step(self, world: WorldState) -> list[str]:
        """Deliver what has arrived; every 30 sim-min, re-order where stock is low. Returns re-plan triggers."""
        triggers = self._deliver(world)
        if self._last_check is None or world.sim_seconds - self._last_check >= CHECK_EVERY_S:
            self._last_check = world.sim_seconds
            self._order(world)
        return triggers

    def _order(self, world: WorldState) -> None:
        for sup in world.scenario.raw.get("suppliers", []):
            w = world.warehouses.get(sup["warehouse_id"])
            if w is None or self.pending(w.id):
                continue
            free = (w.stock - world.committed(w)).clamp0()
            ratios = {i: free.get(i) / max(1, w.initial_stock.get(i)) for i in ITEMS}
            low = [i for i in ITEMS if ratios[i] < LOW_RATIO]
            if not low:
                continue
            want = Supplies(**{i: max(0, round(TARGET_RATIO * w.initial_stock.get(i) - free.get(i))) for i in ITEMS})
            kg = world.weight(want)
            if kg > sup["max_kg"]:  # scale down to what the supplier can send in one consignment
                f = sup["max_kg"] / kg
                want = Supplies(**{i: int(want.get(i) * f) for i in ITEMS})
            if want.is_empty():
                continue
            r = Restock(
                id=f"RS-{len(self.restocks) + 1}",
                warehouse_id=w.id,
                supplier=sup["name"],
                items=want,
                ordered_at=world.sim_seconds,
                arrives_at=world.sim_seconds + int(sup["lead_h"] * 3600),
            )
            self.restocks.append(r)
            words = {"water_l": "water", "food_rations": "food", "medical_kits": "medical kits"}
            world.bus.log(
                "supply",
                "supply.ordered",
                f"Re-ordered for {w.name} warehouse from the {sup['name']}: {fmt_items(want)}. "
                f"Arrives in about {fmt_duration(sup['lead_h'] * 60)} ({world.fmt(r.arrives_at)}).",
                f"Free {', '.join(words[i] for i in low)} at {w.name} fell below {LOW_RATIO:.0%} of opening stock "
                f"({', '.join(f'{words[i]} {ratios[i]:.0%}' for i in ITEMS)}). The order tops it back up towards "
                f"{TARGET_RATIO:.0%}, up to {sup['max_kg'] / 1000:g} t per consignment.",
            )
            world.bus.publish("supply.ordered", {"warehouse_id": w.id, "restock_id": r.id})

    def _deliver(self, world: WorldState) -> list[str]:
        triggers = []
        for r in self.pending():
            if world.sim_seconds < r.arrives_at:
                continue
            w = world.warehouses[r.warehouse_id]
            if w.offline:  # the yard is closed: the consignment waits outside until it reopens
                continue
            w.stock = w.stock + r.items
            r.delivered = True
            world.bus.log(
                "supply",
                "supply.arrived",
                f"Restock arrived at {w.name} warehouse from the {r.supplier}: {fmt_items(r.items)}.",
                "The Coordinator re-plans with the new stock.",
            )
            world.bus.publish("supply.arrived", {"warehouse_id": w.id, "restock_id": r.id})
            triggers.append(f"restock arrived at {w.name}")
        return triggers
