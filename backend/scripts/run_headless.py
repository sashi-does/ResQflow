"""Run the scenario without the UI and print the decision log and KPIs.

uv run python scripts/run_headless.py --scenario assam --until 24h
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.sim.runner import Simulation, load_timeline  # noqa: E402
from app.sim.scenario import load_scenario  # noqa: E402
from app.sim.stub_policy import StubPolicy  # noqa: E402
from app.sim.world import WorldState  # noqa: E402


def parse_duration(s: str) -> int:
    s = s.strip().lower()
    if s.endswith("h"):
        return int(float(s[:-1]) * 3600)
    if s.endswith("m"):
        return int(float(s[:-1]) * 60)
    return int(s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="assam")
    ap.add_argument("--until", default="24h")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-timeline", action="store_true")
    args = ap.parse_args()

    sc = load_scenario(args.scenario)
    world = WorldState(sc, seed=args.seed)
    sim = Simulation(world, StubPolicy(), [] if args.no_timeline else load_timeline(sc))
    t0 = time.perf_counter()
    sim.run_until(parse_duration(args.until))
    elapsed = time.perf_counter() - t0

    print(f"== {sc.raw['name']} · ran to {world.sim_time} in {elapsed:.2f}s ==")
    for e in world.bus.entries:
        print(f"[{e.sim_time}] {e.agent:<11} {e.summary}")
    print("\n== KPIs ==")
    for k, v in world.kpi.snapshot().model_dump().items():
        print(f"  {k:<28} {v}")


if __name__ == "__main__":
    main()
