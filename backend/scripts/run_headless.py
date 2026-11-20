"""Run the scenario without the UI: agentic agents vs the static baseline, in lockstep.

uv run python scripts/run_headless.py --scenario assam --until 24h
uv run python scripts/run_headless.py --from "D1 08:00" --to "D1 09:00" --reasoning
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402
from app.llm.client import make_llm  # noqa: E402
from app.sim.comparison import build_comparison  # noqa: E402
from app.sim.scenario import load_scenario, parse_sim_time  # noqa: E402

KPI_LABELS = {
    "people_hours_without_water": "People-hours without water",
    "people_hours_without_food": "People-hours without food",
    "deliveries_on_time_pct": "On-time deliveries %",
    "deliveries_total": "Deliveries",
    "truck_hours_stuck": "Truck-hours stuck",
    "avg_delivery_min": "Avg delivery time (min)",
    "supplies_delivered_kg": "Supplies delivered (kg)",
}


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
    ap.add_argument("--case", default="highway", help="highway | northbank | surge (data/cases.json)")
    ap.add_argument("--until", default="24h")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--no-timeline", action="store_true")
    ap.add_argument("--from", dest="t_from", default=None, help='print log from e.g. "D1 08:00"')
    ap.add_argument("--to", dest="t_to", default=None, help='print log up to e.g. "D1 09:00"')
    ap.add_argument("--reasoning", action="store_true", help="also print each entry's reasoning")
    ap.add_argument("--quiet", action="store_true", help="KPIs only")
    ap.add_argument("--llm", action="store_true", help="use the configured LLM (needs ANTHROPIC_API_KEY in .env)")
    args = ap.parse_args()

    base = Settings()
    settings = base if args.llm else Settings(llm_provider="mock")
    if args.seed is not None:
        settings = settings.model_copy(update={"seed": args.seed})
    llm = make_llm(settings) if args.llm else None
    if args.llm and (llm is None or not llm.available):
        print("--llm: no ANTHROPIC_API_KEY found (.env); running in mock mode", file=sys.stderr)
    sc = load_scenario(args.scenario, args.case)
    cmp_ = build_comparison(settings, scenario=sc, timeline=not args.no_timeline, headless=True, llm=llm)
    t0 = time.perf_counter()
    cmp_.run_until(parse_duration(args.until))
    elapsed = time.perf_counter() - t0
    world = cmp_.agentic.world

    lo = parse_sim_time(args.t_from, sc.start_offset_s) if args.t_from else -1
    hi = parse_sim_time(args.t_to, sc.start_offset_s) if args.t_to else 10**9
    mode = f"LLM: {llm.model}" if llm is not None and llm.available else "mock coordinator"
    case = sc.raw["case"]["title"]
    print(f"== {sc.raw['name']} · case: {case} · ran to {world.sim_time} in {elapsed:.2f}s ({mode}) ==")
    if not args.quiet:
        for e in world.bus.entries:
            if lo <= e.sim_seconds <= hi:
                print(f"[{e.sim_time}] {e.agent:<11} {e.summary}")
                if args.reasoning and e.reasoning:
                    for line in e.reasoning.splitlines():
                        print(f"{'':>26}{line}")
    k = cmp_.kpis()
    print("\n== Agentic vs Static ==")
    print(f"  {'KPI':<30}{'Agentic':>12}{'Static':>12}{'Δ':>10}")
    for key, label in KPI_LABELS.items():
        d = k["delta_pct"][key]
        delta = f"{d:+.0f}%" if d is not None else "–"
        print(f"  {label:<30}{k['agentic'][key]:>12,.1f}{k['baseline'][key]:>12,.1f}{delta:>10}")


if __name__ == "__main__":
    main()
