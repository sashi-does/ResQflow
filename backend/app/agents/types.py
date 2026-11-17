"""Data passed between agents during one cycle."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.models import Supplies

CampLevel = Literal["critical", "low", "ok"]


@dataclass
class CampStatus:
    camp_id: str
    name: str
    district: str
    population: int
    stock: Supplies
    incoming: Supplies
    burn_per_day: dict[str, float]
    days_of_cover: float
    water_days: float
    deficit_24h: Supplies
    status: CampLevel
    priority_score: float
    cut_off: bool


@dataclass
class Violation:
    code: str
    message: str
    order_index: int | None = None


@dataclass
class CheckedOrder:
    index: int
    warehouse_id: str
    camp_id: str
    truck_id: str
    items: Supplies
    weight_kg: float
    uses_reserve: bool
    eta_min: float | None
    priority: str
    reason: str


@dataclass
class ValidationResult:
    hard: list[Violation] = field(default_factory=list)
    soft: list[Violation] = field(default_factory=list)
    orders: list[CheckedOrder] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.hard


@dataclass
class PlanResult:
    plan: dict[str, Any]
    validation: ValidationResult
    source: Literal["llm", "heuristic"]
    attempts: int
    latency_ms: int
    trigger: str = ""
