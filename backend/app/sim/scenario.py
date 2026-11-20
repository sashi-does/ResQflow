"""Load the scenario JSON, generated road graph, and flood presets."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.config import DATA_DIR
from app.geo.graph import RoadGraph
from app.models import Edge, Node

SECONDS_PER_DAY = 86400


@dataclass(frozen=True)
class ScenarioData:
    raw: dict[str, Any]
    presets: dict[str, dict[str, Any]]
    graph: RoadGraph

    @property
    def constants(self) -> dict[str, Any]:
        return self.raw["constants"]

    @property
    def start_offset_s(self) -> int:
        """Seconds from D1 00:00 to the scenario start clock (06:00 -> 21600)."""
        h, m = self.raw["start_clock"].split(":")
        return int(h) * 3600 + int(m) * 60


def parse_sim_time(label: str, start_offset_s: int) -> int:
    """'D1 08:30' -> sim seconds since scenario start."""
    day, clock = label.split()
    h, m = clock.split(":")
    return (int(day[1:]) - 1) * SECONDS_PER_DAY + int(h) * 3600 + int(m) * 60 - start_offset_s


def format_sim_time(sim_seconds: int, start_offset_s: int) -> str:
    t = int(sim_seconds) + start_offset_s
    day, rem = divmod(t, SECONDS_PER_DAY)
    return f"D{day + 1} {rem // 3600:02d}:{rem % 3600 // 60:02d}"


DEFAULT_CASE = "highway"


@lru_cache
def list_cases() -> tuple[dict[str, Any], ...]:
    """The three demo cases: same map, camps and trucks; different scripted events (data/cases.json)."""
    return tuple(json.loads((DATA_DIR / "cases.json").read_text()))


def get_case(case_id: str) -> dict[str, Any]:
    for c in list_cases():
        if c["id"] == case_id:
            return c
    raise KeyError(case_id)


@lru_cache
def load_scenario(name: str = "assam", case: str = DEFAULT_CASE) -> ScenarioData:
    raw = json.loads((DATA_DIR / f"scenario_{name}.json").read_text())
    c = get_case(case)
    raw["timeline"] = c["timeline"]
    raw["case"] = {k: v for k, v in c.items() if k != "timeline"}
    road = json.loads((DATA_DIR / "road_graph.json").read_text())
    presets = {p["id"]: p for p in json.loads((DATA_DIR / "flood_presets.json").read_text())}
    nodes = {n["id"]: Node(**n) for n in raw["nodes"]}
    edges = {e["id"]: Edge(**{k: v for k, v in e.items() if k in Edge.model_fields}) for e in road["edges"]}
    return ScenarioData(raw=raw, presets=presets, graph=RoadGraph(nodes, edges))
