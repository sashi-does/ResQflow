"""Monitor agent: maintains the active hazard set (flood presets, closures, rain advisories)."""

from __future__ import annotations

from app.geo.hazards import hazard_from_preset
from app.models import Hazard
from app.services.weather import HEAVY_RAIN_MM_24H, rain_24h
from app.sim.world import WorldState


class MonitorAgent:
    """Turns reports (presets, timeline events, weather) into hazards and blocked roads."""

    def __init__(self, weather_mode: str = "cache") -> None:
        self.weather_mode = weather_mode

    def add_preset(self, world: WorldState, preset_id: str, source: str = "scripted demo timeline") -> Hazard | None:
        preset = world.scenario.presets[preset_id]
        for h in world.hazards.values():
            if h.preset_id == preset_id:
                return None  # already active
        hazard = hazard_from_preset(preset, world.graph, world.new_hazard_id(), world.sim_seconds)
        world.add_hazard(hazard)
        roads = [self._edge_label(world, e) for e in hazard.edge_ids]
        n = len(hazard.edge_ids)
        what = "Flood reported" if hazard.kind == "flood" else "Closure reported"
        world.bus.log(
            "monitor",
            "hazard.added",
            f"{what}: {hazard.label}. {n} road segment{'s' if n != 1 else ''} closed: {'; '.join(roads)}.",
            f"Severity {hazard.severity}. Source: {source}. Every road whose geometry crosses the affected area is "
            "now treated as impassable.",
            hazard_ids=[hazard.id],
            edge_ids=list(hazard.edge_ids),
        )
        world.bus.publish(
            "hazard.added", {"hazard": hazard.model_dump(), "blocked_edge_ids": sorted(world.blocked_edge_ids())}
        )
        return hazard

    def remove_hazard(self, world: WorldState, hazard_id: str) -> Hazard | None:
        hazard = world.remove_hazard(hazard_id)
        if hazard is None:
            return None
        still = world.blocked_edge_ids()
        reopened = [self._edge_label(world, e) for e in hazard.edge_ids if e not in still]
        world.bus.log(
            "monitor",
            "hazard.removed",
            f"Water receding: {hazard.label} has cleared." + (f" Reopened: {'; '.join(reopened)}." if reopened else ""),
            "The road is passable again, so routes and the allocation plan are being re-checked.",
            hazard_ids=[hazard.id],
            edge_ids=list(hazard.edge_ids),
        )
        world.bus.publish("hazard.removed", {"hazard": hazard.model_dump(), "blocked_edge_ids": sorted(still)})
        return hazard

    def remove_preset(self, world: WorldState, preset_id: str) -> Hazard | None:
        for hid, h in list(world.hazards.items()):
            if h.preset_id == preset_id:
                return self.remove_hazard(world, hid)
        return None

    def weather_check(self, world: WorldState) -> list[Hazard]:
        """Heavy-rain advisories (≥ 64.5 mm/24h) from the forecast at the current sim hour: raised when a district
        crosses the line, lifted when its outlook falls back under it. Advisories raise camp priority; they never
        block roads. Returns the advisories added or removed (a re-plan is worth it either way)."""
        offset_h = (world.scenario.start_offset_s + world.sim_seconds) / 3600
        rain = rain_24h(world.scenario.raw["district_centroids"], self.weather_mode, offset_h=offset_h)
        changed: list[Hazard] = []
        for district, mm in sorted(rain.items()):
            active = next(
                (h for h in world.hazards.values() if h.kind == "rain_advisory" and h.district == district), None
            )
            camps = [c for c in world.camps.values() if c.district == district]
            if mm < HEAVY_RAIN_MM_24H:
                if active is not None:  # the rain is easing: lift the advisory
                    world.remove_hazard(active.id)
                    for c in camps:
                        c.priority_boost = 0
                    world.bus.log(
                        "monitor",
                        "weather.eased",
                        f"Rain easing in {district}: {mm:.0f} mm forecast for the next 24h, under the heavy-rain line. "
                        "Advisory lifted.",
                        f"Checked every hour against the latest forecast. "
                        f"{', '.join(c.name for c in camps) or 'Camps there'} back to normal priority.",
                        hazard_ids=[active.id],
                        camp_ids=[c.id for c in camps],
                    )
                    world.bus.publish(
                        "hazard.removed",
                        {"hazard": active.model_dump(), "blocked_edge_ids": sorted(world.blocked_edge_ids())},
                    )
                    changed.append(active)
                continue
            if active is not None:
                active.rain_24h_mm = mm
                continue
            hazard = Hazard(
                id=world.new_hazard_id(),
                label=f"Heavy-rain advisory: {district}",
                kind="rain_advisory",
                severity="medium",
                created_at_sim=world.sim_seconds,
                district=district,
                rain_24h_mm=mm,
            )
            world.add_hazard(hazard)
            for c in camps:
                c.priority_boost = 1
            world.bus.log(
                "monitor",
                "weather.advisory",
                f"Heavy-rain advisory for {district}: {mm:.0f} mm expected in the next 24h. "
                f"Camps there raised to high priority.",
                f"IMD classes ≥ {HEAVY_RAIN_MM_24H} mm/24h as heavy rain. The Monitor checks the forecast every hour. "
                f"Advisories don't close roads, but they raise the priority of "
                f"{', '.join(c.name for c in camps) or 'camps in the district'}.",
                hazard_ids=[hazard.id],
                camp_ids=[c.id for c in camps],
            )
            world.bus.publish(
                "hazard.added", {"hazard": hazard.model_dump(), "blocked_edge_ids": sorted(world.blocked_edge_ids())}
            )
            changed.append(hazard)
        return changed

    @staticmethod
    def _edge_label(world: WorldState, edge_id: str) -> str:
        e = world.graph.edges[edge_id]
        return f"{e.road} between {world.node_name(e.a)} and {world.node_name(e.b)}"
