"""The heuristic planner must always produce a plan the validator accepts."""

import random

import pytest

from app.agents.heuristic_planner import heuristic_plan
from app.agents.inventory import InventoryAgent
from app.agents.validator import validate
from app.geo.hazards import hazard_from_preset
from app.models import Supplies
from app.sim.scenario import load_scenario
from app.sim.world import WorldState


def randomized_world(seed: int) -> WorldState:
    rng = random.Random(seed)
    sc = load_scenario()
    w = WorldState(sc, seed=seed)
    for camp in w.camps.values():
        burn = w.burn_per_day(camp)
        camp.stock = Supplies(**{i: int(burn[i] * rng.uniform(0, 1.6)) for i in burn})
    for wh in w.warehouses.values():
        wh.stock = Supplies(**{i: int(wh.initial_stock.get(i) * rng.uniform(0.05, 1.0)) for i in burn})
    for pid in rng.sample(sorted(sc.presets), rng.randint(0, 4)):
        w.add_hazard(hazard_from_preset(sc.presets[pid], w.graph, w.new_hazard_id(), 0))
    for t in w.trucks.values():  # scatter idle trucks over warehouses, some busy
        wh = rng.choice(sorted(w.warehouses))
        t.at_warehouse, t.node_id = wh, w.warehouses[wh].node_id
        if rng.random() < 0.25:
            t.status, t.at_warehouse = "en_route", None
    return w


@pytest.mark.parametrize("seed", range(20))
def test_heuristic_plan_always_passes_validator(seed):
    w = randomized_world(seed)
    statuses = InventoryAgent().run(w)
    plan = heuristic_plan(w, statuses)
    res = validate(w, plan, statuses=statuses)
    assert res.ok, [v.message for v in res.hard]
    for o in res.orders:
        assert o.weight_kg <= w.trucks[o.truck_id].capacity_kg


def test_heuristic_never_serves_cut_off_camps(world):
    sc = world.scenario
    world.add_hazard(hazard_from_preset(sc.presets["F2"], world.graph, "H1", 0))
    statuses = InventoryAgent().run(world)
    plan = heuristic_plan(world, statuses)
    assert all(o["camp_id"] != "C2" for o in plan["orders"])
    assert any(u["camp_id"] == "C2" and "Cut off" in u["why"] for u in plan["unserved"])


def test_heuristic_serves_most_critical_first(world):
    statuses = InventoryAgent().run(world)
    plan = heuristic_plan(world, statuses)
    top = max(statuses.values(), key=lambda s: s.priority_score)
    assert plan["orders"][0]["camp_id"] == top.camp_id
