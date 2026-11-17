"""KPI accumulation (definitions in docs/02_ARCHITECTURE.md)."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models import KPIs


@dataclass
class KpiAccumulator:
    people_hours_without_water: float = 0.0
    people_hours_without_food: float = 0.0
    truck_hours_stuck: float = 0.0
    supplies_delivered_kg: float = 0.0
    deliveries_total: int = 0
    deliveries_on_time: int = 0
    delivery_minutes: list[float] = field(default_factory=list)
    late_order_ids: set[str] = field(default_factory=set)

    def record_delivery(self, order_id: str, minutes: float, weight_kg: float) -> bool:
        on_time = order_id not in self.late_order_ids
        self.deliveries_total += 1
        self.deliveries_on_time += int(on_time)
        self.delivery_minutes.append(minutes)
        self.supplies_delivered_kg += weight_kg
        return on_time

    def snapshot(self) -> KPIs:
        n = self.deliveries_total
        return KPIs(
            people_hours_without_water=round(self.people_hours_without_water, 1),
            people_hours_without_food=round(self.people_hours_without_food, 1),
            deliveries_on_time_pct=round(100.0 * self.deliveries_on_time / n, 1) if n else 0.0,
            deliveries_total=n,
            truck_hours_stuck=round(self.truck_hours_stuck, 2),
            avg_delivery_min=round(sum(self.delivery_minutes) / n, 1) if n else 0.0,
            supplies_delivered_kg=round(self.supplies_delivered_kg, 1),
        )


def delta_pct(agentic: KPIs, baseline: KPIs) -> dict[str, float | None]:
    """Percent change of agentic vs baseline per KPI (negative = agentic lower)."""
    out: dict[str, float | None] = {}
    a, b = agentic.model_dump(), baseline.model_dump()
    for k, bv in b.items():
        out[k] = None if not bv else round(100.0 * (a[k] - bv) / bv, 1)
    return out
