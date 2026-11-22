"""Continuous weather monitoring, supply disruptions (warehouse offline) and supplier restocking."""

from app.agents.validator import validate
from app.sim.comparison import build_comparison
from app.sim.scenario import load_scenario


def _run(case: str, hours: float):
    cmp_ = build_comparison(scenario=load_scenario(case=case), headless=True)
    cmp_.run_until(int(hours * 3600))
    return cmp_


def test_weather_is_checked_every_hour_raising_and_lifting_advisories_in_every_case():
    for case in ("highway", "northbank", "surge"):
        w = _run(case, 8).agentic.world  # 06:00 → 14:00
        log = w.bus.entries
        raised = [e for e in log if e.kind == "weather.advisory" and "Heavy-rain advisory for Dhemaji" in e.summary]
        lifted = [e for e in log if e.kind == "weather.eased" and "Rain easing in Dhemaji" in e.summary]
        assert raised and raised[0].sim_time == "D1 06:00", case
        assert lifted and lifted[0].sim_seconds > raised[0].sim_seconds, case
        assert not any(h.kind == "rain_advisory" and h.district == "Dhemaji" for h in w.hazards.values())
        assert all(c.priority_boost == 0 for c in w.camps.values() if c.district == "Dhemaji")


def test_offline_warehouse_recalls_its_order_and_the_plan_moves_to_another_warehouse():
    cmp_ = _run("northbank", 6.5)  # 06:00 → 12:30; Nagaon goes offline at 12:10
    w = cmp_.agentic.world
    log = w.bus.entries
    off = next(e for e in log if e.kind == "warehouse.offline")
    assert off.sim_time == "D1 12:10" and "Nagaon" in off.summary
    recalled = [e for e in log if e.kind == "order.recalled" and "warehouse is offline" in e.summary]
    assert recalled and recalled[0].sim_time == "D1 12:10"
    nagaon = w.warehouses["W2"]
    assert nagaon.offline and w.available(nagaon).is_empty()
    assert cmp_.baseline.world.warehouses["W2"].offline  # ground truth: the same in both runs
    # nothing can be planned from it while it is down
    t = w.trucks["T1"]  # any truck: the offline check stands on its own
    res = validate(
        w, {"orders": [{"warehouse_id": "W2", "camp_id": "C2", "truck_id": t.id, "items": {"water_l": 100}}]}
    )
    assert any(v.code == "WAREHOUSE_OFFLINE" for v in res.hard)
    later = [
        e for e in log if e.kind == "order.dispatched" and "Morigaon" in e.summary and e.sim_seconds > off.sim_seconds
    ]
    assert later and "Nagaon" not in later[0].summary.split(" to ")[0]


def test_trucks_wait_at_a_closed_warehouse_and_that_counts_as_stuck():
    cmp_ = _run("highway", 0.1)
    w = cmp_.agentic.world
    t = next(t for t in w.trucks.values() if t.status == "loading")
    w.warehouses[t.at_warehouse].offline = True
    before, timer = w.kpi.truck_hours_stuck, t.timer_s
    cmp_.agentic.step()
    assert t.status == "loading" and t.timer_s == timer and w.kpi.truck_hours_stuck > before


def test_supply_agent_reorders_from_the_regional_supplier_and_the_stock_arrives():
    w = _run("northbank", 15).agentic.world  # 06:00 → 21:00
    log = w.bus.entries
    ordered = next(e for e in log if e.kind == "supply.ordered")
    arrived = next(e for e in log if e.kind == "supply.arrived")
    assert ordered.agent == arrived.agent == "supply"
    assert "North Lakhimpur" in ordered.summary and "regional supplier" in ordered.summary
    assert arrived.sim_seconds - ordered.sim_seconds == 6 * 3600  # the supplier's lead time
    assert any(e.kind == "cycle.started" and "restock arrived" in e.summary for e in log)
