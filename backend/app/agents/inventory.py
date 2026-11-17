"""Inventory agent: turns raw stock into needs (days of cover, 24h deficits, priority)."""

from __future__ import annotations

import math

from app.agents.types import CampLevel, CampStatus
from app.models import ITEMS, Camp, Supplies
from app.sim.world import WorldState
from app.text import fmt_days

CRITICAL_DAYS = 0.5
LOW_DAYS = 1.0
HYSTERESIS = 0.1  # leave a level only after recovering this far past its threshold (stops flapping)


class InventoryAgent:
    """Computes `CampStatus` per camp and logs only status *changes*, so the log stays readable."""

    def __init__(self) -> None:
        self._last_level: dict[str, CampLevel] = {}
        self._last_cut_off: dict[str, bool] = {}

    def camp_status(self, world: WorldState, camp: Camp, reachable: bool | None = None) -> CampStatus:
        burn = world.burn_per_day(camp)
        incoming = world.incoming(camp.id)
        doc = world.days_of_cover(camp)
        deficit = Supplies(**{i: max(0, math.ceil(burn[i] * 1.0 - camp.stock.get(i) - incoming.get(i))) for i in ITEMS})
        level: CampLevel = "critical" if doc < CRITICAL_DAYS else "low" if doc < LOW_DAYS else "ok"
        score = (1 / max(doc, 0.05)) * (1 + camp.priority_boost) * math.log10(max(camp.population, 10))
        if reachable is None:
            reachable = self.reachable(world, camp)
        return CampStatus(
            camp_id=camp.id,
            name=camp.name,
            district=camp.district,
            population=camp.population,
            stock=camp.stock,
            incoming=incoming,
            burn_per_day=burn,
            days_of_cover=round(doc, 3),
            water_days=round(world.water_days(camp), 3),
            deficit_24h=deficit,
            status=level,
            priority_score=round(score, 3),
            cut_off=not reachable,
        )

    @staticmethod
    def reachable(world: WorldState, camp: Camp) -> bool:
        return any(world.find_path(w.node_id, camp.node_id) for w in world.warehouses.values())

    def run(self, world: WorldState) -> dict[str, CampStatus]:
        """Full assessment for an agent cycle. Updates camp.cut_off/unserved_reason and logs changes."""
        statuses = {c.id: self.camp_status(world, c) for c in world.camps.values()}
        for st in statuses.values():
            camp = world.camps[st.camp_id]
            was_cut = self._last_cut_off.get(camp.id, False)
            camp.cut_off = st.cut_off
            if st.cut_off and not was_cut:
                camp.unserved_reason = "Cut off by flooding: request boat/air drop"
                world.bus.log(
                    "inventory",
                    "camp.cut_off",
                    f"{camp.name} is cut off: no safe road from any warehouse. "
                    f"{camp.population:,} people have {fmt_days(st.water_days)} of water left.",
                    "Every road into the camp is flooded. Trucks cannot reach it, so it is flagged for a boat or "
                    "air-drop request to the district control room.",
                    camp_ids=[camp.id],
                )
            elif was_cut and not st.cut_off:
                camp.unserved_reason = None
                world.bus.log(
                    "inventory",
                    "camp.reconnected",
                    f"{camp.name} is reachable by road again.",
                    camp_ids=[camp.id],
                )
            self._last_cut_off[camp.id] = st.cut_off
        self.track(world, statuses)
        return statuses

    def level(self, camp_id: str) -> CampLevel | None:
        return self._last_level.get(camp_id)

    @staticmethod
    def _sticky(prev: CampLevel | None, doc: float, raw: CampLevel) -> CampLevel:
        if prev == "critical" and doc < CRITICAL_DAYS + HYSTERESIS:
            return "critical"
        if prev == "low" and raw == "ok" and doc < LOW_DAYS + HYSTERESIS:
            return "low"
        return raw

    def track(self, world: WorldState, statuses: dict[str, CampStatus] | None = None) -> list[str]:
        """Cheap per-step check. Logs level changes and returns camps that just became critical."""
        newly_critical = []
        for camp in world.camps.values():
            st = statuses[camp.id] if statuses else self.camp_status(world, camp, reachable=not camp.cut_off)
            prev = self._last_level.get(camp.id)
            level = self._sticky(prev, st.days_of_cover, st.status)
            if prev == level:
                continue
            self._last_level[camp.id] = level
            if level == "critical":
                newly_critical.append(camp.id)
                world.bus.log(
                    "inventory",
                    "camp.critical",
                    f"{camp.name} is critical: {fmt_days(st.days_of_cover)} of supplies left "
                    f"for {camp.population:,} people.",
                    f"Water {camp.stock.water_l:,} L ({fmt_days(st.water_days)}), food {camp.stock.food_rations:,} "
                    f"rations, medical kits {camp.stock.medical_kits}. Incoming: {st.incoming.water_l:,} L water.",
                    camp_ids=[camp.id],
                )
            elif level == "low" and prev is not None:
                world.bus.log(
                    "inventory",
                    "camp.low",
                    f"{camp.name} is running low: {fmt_days(st.days_of_cover)} of supplies left.",
                    camp_ids=[camp.id],
                )
            elif level == "ok" and prev in ("low", "critical"):
                world.bus.log(
                    "inventory",
                    "camp.ok",
                    f"{camp.name} is stable again: {fmt_days(st.days_of_cover)} of cover.",
                    camp_ids=[camp.id],
                )
        return newly_critical
