"""WorldState: the single in-memory model of nodes, roads, warehouses, camps, trucks, hazards and orders."""

from __future__ import annotations

import math
import random
from typing import Any

from app.bus import EventBus
from app.geo.graph import Path
from app.models import ITEMS, Camp, Hazard, Order, Position, Supplies, Truck, Warehouse
from app.sim.kpis import KpiAccumulator
from app.sim.scenario import ScenarioData, format_sim_time


class WorldState:
    """Mutable simulation state. One instance for the agentic run, one for the static baseline.

    `hazard_aware=False` (baseline) makes path-finding ignore blocked roads: the static plan doesn't know
    about floods, so its trucks drive into them and wait.
    """

    def __init__(self, scenario: ScenarioData, *, seed: int = 42, name: str = "agentic", log: bool = True):
        self.scenario = scenario
        self.graph = scenario.graph
        self.name = name
        self.hazard_aware = True
        self.rng = random.Random(seed)
        self.sim_seconds = 0
        self.bus = EventBus(lambda: (self.sim_seconds, self.sim_time), enabled=log)
        c = scenario.constants
        self.c = c
        self.unit_weight: dict[str, float] = c["unit_weight_kg"]
        self.per_capita: dict[str, float] = c["per_capita_daily"]

        raw = scenario.raw
        self.warehouses: dict[str, Warehouse] = {
            w["id"]: Warehouse(
                **w | {"stock": Supplies(**w["stock"]), "initial_stock": Supplies(**w["stock"])},
                safety_ratio=c["safety_ratio"],
            )
            for w in raw["warehouses"]
        }
        self.camps: dict[str, Camp] = {c_["id"]: Camp(**c_) for c_ in raw["camps"]}
        self.trucks: dict[str, Truck] = {}
        for t in raw["trucks"]:
            node = self.graph.nodes[self.warehouses[t["home_warehouse"]].node_id]
            self.trucks[t["id"]] = Truck(
                id=t["id"],
                home_warehouse=t["home_warehouse"],
                at_warehouse=t["home_warehouse"],
                capacity_kg=c["truck_capacity_kg"],
                position=Position(lat=node.lat, lon=node.lon),
                node_id=node.id,
            )
        self.hazards: dict[str, Hazard] = {}
        self.orders: dict[str, Order] = {}
        self._consumption_acc: dict[str, dict[str, float]] = {
            cid: dict.fromkeys(ITEMS, 0.0) for cid in self.camps
        }
        self.kpi = KpiAccumulator()
        self._next_order = 1
        self._next_hazard = 1

    # ---------------------------------------------------------------- time
    @property
    def sim_time(self) -> str:
        return format_sim_time(self.sim_seconds, self.scenario.start_offset_s)

    def fmt(self, sim_seconds: int) -> str:
        return format_sim_time(sim_seconds, self.scenario.start_offset_s)

    # ---------------------------------------------------------------- ids
    def new_order_id(self) -> str:
        oid = f"O-{self._next_order}"
        self._next_order += 1
        return oid

    def new_hazard_id(self) -> str:
        hid = f"H{self._next_hazard}"
        self._next_hazard += 1
        return hid

    # ---------------------------------------------------------------- hazards / roads
    def blocked_edge_ids(self) -> set[str]:
        out: set[str] = set()
        for h in self.hazards.values():
            out.update(h.edge_ids)
        return out

    def routing_blocked(self) -> set[str]:
        """Edges path-finding must avoid (none for the hazard-unaware baseline)."""
        return self.blocked_edge_ids() if self.hazard_aware else set()

    def add_hazard(self, hazard: Hazard) -> None:
        self.hazards[hazard.id] = hazard

    def remove_hazard(self, hazard_id: str) -> Hazard | None:
        return self.hazards.pop(hazard_id, None)

    def find_path(self, src: str, dst: str) -> Path | None:
        return self.graph.safe_path(src, dst, self.routing_blocked())

    # ---------------------------------------------------------------- stock maths
    def reserve_level(self, w: Warehouse) -> Supplies:
        return Supplies(**{i: math.ceil(w.safety_ratio * w.initial_stock.get(i)) for i in ITEMS})

    def available(self, w: Warehouse) -> Supplies:
        """Stock above the safety reserve. Stock is deducted at dispatch, so nothing else is committed."""
        return (w.stock - self.reserve_level(w)).clamp0()

    def reserve_held(self, w: Warehouse) -> Supplies:
        return Supplies(**{i: min(w.stock.get(i), self.reserve_level(w).get(i)) for i in ITEMS})

    def burn_per_day(self, camp: Camp) -> dict[str, float]:
        return {i: camp.population * self.per_capita[i] for i in ITEMS}

    def incoming(self, camp_id: str) -> Supplies:
        total = Supplies()
        for o in self.orders.values():
            if o.camp_id == camp_id and o.status in ("dispatched", "awaiting_approval"):
                total = total + o.items
        return total

    def days_of_cover(self, camp: Camp, include_incoming: bool = False) -> float:
        burn = self.burn_per_day(camp)
        stock = camp.stock + self.incoming(camp.id) if include_incoming else camp.stock
        return min(stock.get(i) / burn[i] for i in ITEMS if burn[i] > 0)

    def water_days(self, camp: Camp) -> float:
        return camp.stock.water_l / self.burn_per_day(camp)["water_l"]

    def weight(self, items: Supplies) -> float:
        return items.weight_kg(self.unit_weight)

    def warehouse_at_node(self, node_id: str | None) -> Warehouse | None:
        for w in self.warehouses.values():
            if w.node_id == node_id:
                return w
        return None

    def camp_at_node(self, node_id: str | None) -> Camp | None:
        for c in self.camps.values():
            if c.node_id == node_id:
                return c
        return None

    def node_name(self, node_id: str) -> str:
        return self.graph.nodes[node_id].name

    # ---------------------------------------------------------------- serialisation helpers
    def truck_path_coords(self, t: Truck) -> list[tuple[float, float]]:
        if not t.path_edge_ids:
            return []
        coords = self.graph.path_coords(t.path_nodes, t.path_edge_ids)
        first = self.graph.oriented_geometry(t.path_edge_ids[0], t.path_nodes[0])
        e0 = self.graph.edges[t.path_edge_ids[0]]
        frac = min(1.0, t.progress_km / e0.length_km) if e0.length_km else 1.0
        # drop the part of the first edge already travelled
        skip = int(frac * (len(first) - 1))
        return [(t.position.lat, t.position.lon), *coords[skip + 1 :]]

    def summary(self) -> dict[str, Any]:
        return {"sim_time": self.sim_time, "kpis": self.kpi.snapshot().model_dump()}
