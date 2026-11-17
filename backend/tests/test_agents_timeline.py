"""Phase 3 acceptance tests on the headless demo timeline (mock coordinator, auto-approve after 20 min)."""

import pytest

from app.agents.dispatcher import DispatcherAgent
from app.agents.routing import RoutingAgent
from app.agents.types import CheckedOrder, PlanResult, ValidationResult
from app.config import Settings
from app.geo.hazards import hazard_from_preset
from app.models import Supplies
from app.sim import engine
from app.sim.comparison import build_comparison
from app.sim.scenario import parse_sim_time


def t(label: str) -> int:
    from app.sim.scenario import load_scenario

    return parse_sim_time(label, load_scenario().start_offset_s)


def f1_time() -> int:
    from app.sim.scenario import load_scenario

    raw = load_scenario().raw
    return next(t(e["at"]) for e in raw["timeline"] if e.get("preset_id") == "F1" and e["action"] == "hazard_add")


@pytest.fixture(scope="module")
def run():
    """Full 24h comparison, run once for this module."""
    cmp_ = build_comparison(Settings(llm_provider="mock"))
    cmp_.run_until(f1_time())  # stop just before the flood is applied
    world = cmp_.agentic.world
    approaching = [tr.id for tr in world.trucks.values() if "E10" in tr.path_edge_ids]
    cmp_.run_until(24 * 3600)
    return cmp_, approaching


def entries(cmp_, kind=None, agent=None):
    return [
        e
        for e in cmp_.agentic.world.bus.entries
        if (kind is None or e.kind == kind) and (agent is None or e.agent == agent)
    ]


def test_a_truck_is_heading_over_e10_when_f1_fires(run):
    _, approaching = run
    assert approaching, "the demo needs at least one truck on its way over NH-715 when F1 fires"


def test_every_truck_heading_over_e10_is_rerouted_at_f1(run):
    cmp_, approaching = run
    at_f1 = [e for e in entries(cmp_) if e.sim_seconds == f1_time() and e.agent == "routing"]
    rerouted = {tid for e in at_f1 for tid in e.refs.truck_ids}
    assert set(approaching) <= rerouted
    msg = next(e.summary for e in at_f1 if e.kind == "truck.rerouted")
    assert "Re-routed Truck" in msg and "Dabaka" in msg and "ETA was" in msg


def test_morigaon_logged_cut_off_at_1530(run):
    cmp_, _ = run
    cut = [e for e in entries(cmp_, "camp.cut_off") if "C2" in e.refs.camp_ids]
    assert cut and cut[0].sim_seconds == t("D1 15:30")
    assert cmp_.agentic.world.camps["C2"].unserved_reason == "Cut off by flooding: request boat/air drop"


def test_recede_at_2000_is_logged_and_switches_back(run):
    cmp_, _ = run
    at = [e for e in entries(cmp_) if e.sim_seconds == t("D1 20:00")]
    assert any(e.kind == "hazard.removed" for e in at)
    switched = [e for e in at if e.kind == "truck.rerouted" and "reopened" in e.summary]
    assert switched, "a truck on the Bokajan detour should switch back to NH-715"


def test_agentic_beats_static_on_water_by_30pct(run):
    cmp_, _ = run
    k = cmp_.kpis()
    a, b = k["agentic"]["people_hours_without_water"], k["baseline"]["people_hours_without_water"]
    assert b > 0
    assert a <= 0.7 * b, (a, b)


def test_static_baseline_gets_stuck_and_agentic_does_not(run):
    cmp_, _ = run
    k = cmp_.kpis()
    assert k["baseline"]["truck_hours_stuck"] > 0
    assert k["agentic"]["truck_hours_stuck"] < k["baseline"]["truck_hours_stuck"]


def test_heavy_orders_wait_for_approval_then_auto_approve_after_20_min(run):
    cmp_, _ = run
    world = cmp_.agentic.world
    gated = [o for o in world.orders.values() if o.approval_requested_at_sim is not None]
    assert gated and all(o.weight_kg > 6000 or o.uses_reserve for o in gated)
    approvals = {e.refs.order_ids[0]: e.sim_seconds for e in entries(cmp_, "order.approved")}
    for o in gated:
        if o.id in approvals:
            assert approvals[o.id] - o.approval_requested_at_sim == 20 * 60


def test_comparison_is_deterministic():
    k1 = _kpis_after(12)
    k2 = _kpis_after(12)
    assert k1 == k2


def _kpis_after(hours):
    c = build_comparison(Settings(llm_provider="mock"))
    c.run_until(hours * 3600)
    return c.kpis(), [e.summary for e in c.agentic.world.bus.entries]


# ---------------------------------------------------------------- focused unit tests


def test_order_over_threshold_awaits_approval(world):
    d = DispatcherAgent(6000, auto_approve_after_s=None)
    _dispatch_one(world, d, Supplies(water_l=7000))
    o = next(iter(world.orders.values()))
    assert o.status == "awaiting_approval" and "above the 6.0 t limit" in o.approval_reasons[0]
    assert world.trucks["T3"].order_id == o.id  # truck reserved
    d.auto_approve(world)
    assert o.status == "awaiting_approval"  # live UI: never auto-approved
    d.approve(world, o.id)
    assert o.status == "dispatched" and world.trucks["T3"].status == "loading"


def test_small_order_dispatches_immediately(world):
    d = DispatcherAgent(6000)
    _dispatch_one(world, d, Supplies(water_l=3000))
    assert next(iter(world.orders.values())).status == "dispatched"


def test_reserve_use_needs_approval(world):
    world.warehouses["W2"].stock.water_l = 10000  # only 1,000 L above the 9,000 L reserve
    d = DispatcherAgent(6000)
    _dispatch_one(world, d, Supplies(water_l=3000))
    o = next(iter(world.orders.values()))
    assert o.status == "awaiting_approval" and o.uses_reserve
    assert "safety reserve" in o.approval_reasons[-1]


def test_revalidation_drops_order_whose_truck_is_no_longer_idle(world):
    d = DispatcherAgent(6000)
    plan = _plan(world, Supplies(water_l=3000))
    world.trucks["T3"].status = "en_route"  # the world moved on while the plan was being made
    world.trucks["T3"].at_warehouse = None
    d.execute(world, plan)
    o = next(iter(world.orders.values()))
    assert o.status == "failed"
    assert any(e.kind == "order.dropped" for e in world.bus.entries)


def test_approval_revalidates_against_current_world(world):
    d = DispatcherAgent(6000)
    _dispatch_one(world, d, Supplies(water_l=7000))
    o = next(iter(world.orders.values()))
    world.add_hazard(hazard_from_preset(world.scenario.presets["F2"], world.graph, "H1", 0))  # Morigaon cut off
    d.approve(world, o.id)
    assert o.status == "failed" and world.trucks["T3"].order_id is None


def test_recede_switch_back_rule_requires_15pct_gain(world):
    routing = RoutingAgent()
    h = world.scenario.presets["F1"]
    hazard = hazard_from_preset(h, world.graph, "H1", 0)
    world.add_hazard(hazard)
    truck = world.trucks["T3"]
    engine.set_path(world, truck, world.find_path("NGN", "BKT"), status="en_route", leg="delivery")
    assert "E10" not in truck.path_edge_ids  # on the Dabaka-Bokajan detour
    for _ in range(40):  # 20 min down the detour towards Dabaka
        engine.step(world)
    detour_left = engine.remaining_minutes(world, truck)
    world.remove_hazard("H1")
    changed = routing.on_hazard_removed(world, hazard)
    assert changed == ["T3"]
    assert "E10" in truck.path_edge_ids
    assert engine.remaining_minutes(world, truck) <= 0.85 * detour_left


def test_recede_does_not_switch_for_small_gain(world):
    routing = RoutingAgent()
    hazard = hazard_from_preset(world.scenario.presets["F1"], world.graph, "H1", 0)
    world.add_hazard(hazard)
    truck = world.trucks["T3"]
    engine.set_path(world, truck, world.find_path("NGN", "BKT"), status="en_route", leg="delivery")
    while "E21" not in truck.path_edge_ids[:1]:  # almost at Numaligarh: the detour is now the fast way
        engine.step(world)
    world.remove_hazard("H1")
    assert routing.on_hazard_removed(world, hazard) == []


def _plan(world, items: Supplies) -> PlanResult:
    co = CheckedOrder(0, "W2", "C2", "T3", items, world.weight(items), False, 70.0, "critical", "test")
    return PlanResult({"orders": []}, ValidationResult(orders=[co]), "heuristic", 1, 0, "test")


def _dispatch_one(world, d, items):
    d.execute(world, _plan(world, items))
