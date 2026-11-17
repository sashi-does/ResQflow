"""Agentic vs Static, stepped in lockstep on identical copies of the scenario."""

from __future__ import annotations

from dataclasses import dataclass

from app.agents.orchestrator import Orchestrator
from app.config import Settings
from app.models import KPIs
from app.sim.baseline import StaticPolicy
from app.sim.kpis import delta_pct
from app.sim.runner import Simulation, load_timeline
from app.sim.scenario import ScenarioData, load_scenario
from app.sim.world import WorldState


@dataclass
class Comparison:
    agentic: Simulation
    baseline: Simulation

    def step(self) -> None:
        self.agentic.step()
        self.baseline.step()

    def run_until(self, sim_seconds: int) -> None:
        while self.agentic.world.sim_seconds < sim_seconds and not self.agentic.ended:
            self.step()

    def kpis(self) -> dict:
        a: KPIs = self.agentic.world.kpi.snapshot()
        b: KPIs = self.baseline.world.kpi.snapshot()
        return {"agentic": a.model_dump(), "baseline": b.model_dump(), "delta_pct": delta_pct(a, b)}


def build_comparison(
    settings: Settings | None = None,
    *,
    scenario: ScenarioData | None = None,
    timeline: bool = True,
    headless: bool = True,
) -> Comparison:
    s = settings or Settings()
    sc = scenario or load_scenario()
    c = sc.constants
    auto = c["auto_approve_after_min"] * 60
    tl = load_timeline(sc) if timeline else []

    world = WorldState(sc, seed=s.seed, name="agentic")
    orch = Orchestrator(
        approval_threshold_kg=s.approval_threshold_kg,
        auto_approve_after_s=auto if headless else None,
        weather_mode=s.weather_mode,
        replan_every_min=c["replan_every_min"],
        debounce_min=c["debounce_min"],
    )
    base_world = WorldState(sc, seed=s.seed, name="baseline", log=False)
    base_world.hazard_aware = False
    static = StaticPolicy(
        approval_threshold_kg=s.approval_threshold_kg,
        auto_approve_after_s=auto,
        replan_every_min=c["replan_every_min"],
    )
    return Comparison(Simulation(world, orch, tl), Simulation(base_world, static, tl))
