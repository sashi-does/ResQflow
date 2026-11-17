"""Domain models shared by the simulation, agents and API (see docs/02_ARCHITECTURE.md)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ITEMS: tuple[str, ...] = ("food_rations", "water_l", "medical_kits")

NodeKind = Literal["town", "junction", "ghat"]
EdgeKind = Literal["nh", "sh", "local", "ferry"]
TruckStatus = Literal["idle", "loading", "en_route", "unloading", "returning", "holding"]
OrderStatus = Literal["proposed", "awaiting_approval", "dispatched", "delivered", "rejected", "failed"]
HazardKind = Literal["flood", "edge_closure", "rain_advisory"]
AgentName = Literal["monitor", "inventory", "routing", "coordinator", "validator", "dispatcher", "human", "system"]


class Supplies(BaseModel):
    """Quantities of the three relief items. Units: rations, litres, kits."""

    food_rations: int = 0
    water_l: int = 0
    medical_kits: int = 0

    def get(self, item: str) -> int:
        return int(getattr(self, item))

    def as_dict(self) -> dict[str, int]:
        return {i: self.get(i) for i in ITEMS}

    def __add__(self, other: Supplies) -> Supplies:
        return Supplies(**{i: self.get(i) + other.get(i) for i in ITEMS})

    def __sub__(self, other: Supplies) -> Supplies:
        return Supplies(**{i: self.get(i) - other.get(i) for i in ITEMS})

    def clamp0(self) -> Supplies:
        return Supplies(**{i: max(0, self.get(i)) for i in ITEMS})

    def weight_kg(self, unit_weight: dict[str, float]) -> float:
        return sum(self.get(i) * unit_weight[i] for i in ITEMS)

    def is_empty(self) -> bool:
        return all(self.get(i) == 0 for i in ITEMS)


class Node(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    kind: NodeKind


class Edge(BaseModel):
    id: str
    a: str
    b: str
    road: str
    kind: EdgeKind
    geometry: list[tuple[float, float]]  # [[lat, lon], ...] from a to b
    length_km: float
    speed_kmh: float
    crossing_min: float | None = None
    blocked: bool = False
    blocked_by: list[str] = Field(default_factory=list)

    @property
    def minutes(self) -> float:
        if self.crossing_min is not None:
            return self.crossing_min
        return self.length_km / self.speed_kmh * 60.0


class Warehouse(BaseModel):
    id: str
    node_id: str
    name: str
    stock: Supplies
    initial_stock: Supplies
    safety_ratio: float = 0.2


class Camp(BaseModel):
    id: str
    node_id: str
    name: str
    district: str
    population: int
    stock: Supplies
    priority_boost: int = 0
    cut_off: bool = False
    unserved_reason: str | None = None


class Position(BaseModel):
    lat: float
    lon: float


class Truck(BaseModel):
    """A relief truck. `path_edge_ids`/`path_nodes` describe the remaining route from `path_nodes[0]`."""

    id: str
    home_warehouse: str
    at_warehouse: str | None = None
    capacity_kg: float
    status: TruckStatus = "idle"
    position: Position
    node_id: str | None = None  # node the truck is at (when not mid-edge)
    path_nodes: list[str] = Field(default_factory=list)
    path_edge_ids: list[str] = Field(default_factory=list)
    progress_km: float = 0.0  # distance travelled along path_edge_ids[0]
    cargo: Supplies = Field(default_factory=Supplies)
    order_id: str | None = None
    destination_node: str | None = None
    timer_s: float = 0.0  # remaining loading/unloading time
    eta_sim_seconds: int | None = None
    leg: Literal["reposition", "delivery", "return", "hold"] | None = None
    may_cross_blocked: bool = False  # cleared to drive on its (blocked) current edge: the flooded part is behind it
    stuck: bool = False  # waiting at/on a blocked edge this step


class Hazard(BaseModel):
    id: str
    label: str
    kind: HazardKind
    polygon: dict[str, Any] | None = None  # GeoJSON Polygon/MultiPolygon in lon/lat
    edge_ids: list[str] = Field(default_factory=list)
    severity: str = "high"
    created_at_sim: int = 0
    preset_id: str | None = None
    district: str | None = None
    rain_24h_mm: float | None = None


class Order(BaseModel):
    id: str
    warehouse_id: str
    camp_id: str
    truck_id: str
    items: Supplies
    weight_kg: float
    priority: Literal["critical", "high", "normal"] = "normal"
    reason: str = ""
    uses_reserve: bool = False
    approval_reasons: list[str] = Field(default_factory=list)
    status: OrderStatus = "proposed"
    source: Literal["llm", "heuristic"] = "heuristic"
    created_at_sim: int = 0
    delivered_at_sim: int | None = None
    approval_requested_at_sim: int | None = None
    eta_min: float | None = None


class LogRefs(BaseModel):
    truck_ids: list[str] = Field(default_factory=list)
    camp_ids: list[str] = Field(default_factory=list)
    order_ids: list[str] = Field(default_factory=list)
    hazard_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)


class LogEntry(BaseModel):
    id: int
    sim_time: str
    sim_seconds: int
    real_time: str
    agent: AgentName
    kind: str
    summary: str
    reasoning: str = ""
    refs: LogRefs = Field(default_factory=LogRefs)


class KPIs(BaseModel):
    people_hours_without_water: float = 0.0
    people_hours_without_food: float = 0.0
    deliveries_on_time_pct: float = 0.0
    deliveries_total: int = 0
    truck_hours_stuck: float = 0.0
    avg_delivery_min: float = 0.0
    supplies_delivered_kg: float = 0.0
