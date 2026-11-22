"""Headless/real-time driver: applies the scripted timeline, lets a policy act, then steps the engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.models import Supplies
from app.sim import engine
from app.sim.clock import STEP_S
from app.sim.scenario import ScenarioData, parse_sim_time
from app.sim.world import WorldState


@dataclass(frozen=True)
class TimelineEvent:
    at_s: int
    action: str  # hazard_add/remove | weather_check | population_change | stock_arrival | warehouse_down/up | end
    preset_id: str | None = None
    params: dict[str, Any] = field(default_factory=dict, hash=False, compare=False)


GROUND_TRUTH = ("population_change", "stock_arrival", "warehouse_down", "warehouse_up")


def apply_ground_truth(world: WorldState, ev: TimelineEvent) -> None:
    """Things that happen in the world whatever the plan is (people arrive, stock arrives): same in both runs."""
    p = ev.params
    if ev.action == "population_change":
        camp = world.camps[p["camp_id"]]
        camp.population = max(0, camp.population + int(p["delta"]))
    elif ev.action == "stock_arrival":
        wh = world.warehouses[p["warehouse_id"]]
        wh.stock = wh.stock + Supplies(**p["items"])
    elif ev.action == "warehouse_down":
        wh = world.warehouses[p["warehouse_id"]]
        wh.offline, wh.offline_reason = True, p.get("note", "loading stopped")
    elif ev.action == "warehouse_up":
        wh = world.warehouses[p["warehouse_id"]]
        wh.offline, wh.offline_reason = False, None


def load_timeline(sc: ScenarioData) -> list[TimelineEvent]:
    events = [
        TimelineEvent(
            parse_sim_time(e["at"], sc.start_offset_s),
            e["action"],
            e.get("preset_id"),
            {k: v for k, v in e.items() if k not in ("at", "action", "preset_id")},
        )
        for e in sc.raw["timeline"]
    ]
    return sorted(events, key=lambda e: e.at_s)


class Policy(Protocol):
    def on_step(self, world: WorldState, events: list[TimelineEvent]) -> None: ...


class Simulation:
    """One world + one policy + (optionally) the scripted timeline."""

    def __init__(self, world: WorldState, policy: Policy, timeline: list[TimelineEvent] | None = None):
        self.world = world
        self.policy = policy
        self.timeline = list(timeline or [])
        self._next_event = 0
        self.ended = False

    def due_events(self) -> list[TimelineEvent]:
        due = []
        while self._next_event < len(self.timeline) and self.timeline[self._next_event].at_s <= self.world.sim_seconds:
            due.append(self.timeline[self._next_event])
            self._next_event += 1
        return due

    def step(self) -> None:
        events = self.due_events()
        if any(e.action == "end" for e in events):
            self.ended = True
        for ev in events:
            if ev.action in GROUND_TRUTH:
                apply_ground_truth(self.world, ev)
        self.policy.on_step(self.world, events)
        if self.ended:  # the scenario stops exactly at its end time: no step after the end-of-scenario summary
            return
        engine.step(self.world, STEP_S)

    def run_until(self, sim_seconds: int) -> None:
        while self.world.sim_seconds < sim_seconds and not self.ended:
            self.step()
