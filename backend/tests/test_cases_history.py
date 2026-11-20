"""Three demo cases, coordination cycles, the AI conversation journal, and run history (no database needed)."""

import os

import pytest

os.environ["RAHATNET_NO_LOOP"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.llm.journal import Journal, LLMCall, current_purpose, purpose  # noqa: E402
from app.main import app  # noqa: E402
from app.persist import Store  # noqa: E402
from app.sim.comparison import build_comparison  # noqa: E402
from app.sim.live import get_live  # noqa: E402
from app.sim.scenario import list_cases, load_scenario  # noqa: E402
from tests.auth import H  # noqa: E402

DAY = 24 * 3600


def test_three_cases_share_the_map_but_not_the_events():
    ids = [c["id"] for c in list_cases()]
    assert ids == ["highway", "northbank", "surge"]
    timelines = {c: load_scenario(case=c).raw["timeline"] for c in ids}
    assert len({str(t) for t in timelines.values()}) == 3
    for c in ids:
        sc = load_scenario(case=c)
        assert len(sc.raw["camps"]) == 8 and sc.raw["timeline"][-1]["action"] == "end"


@pytest.mark.parametrize("case", ["highway", "northbank", "surge"])
def test_each_case_agentic_beats_static_on_water_and_stuck_trucks(case):
    cmp_ = build_comparison(scenario=load_scenario(case=case), headless=True)
    cmp_.run_until(DAY)
    k = cmp_.kpis()
    assert k["agentic"]["people_hours_without_water"] < k["baseline"]["people_hours_without_water"]
    assert k["agentic"]["truck_hours_stuck"] < k["baseline"]["truck_hours_stuck"]


def test_population_and_stock_events_hit_both_runs_equally():
    cmp_ = build_comparison(scenario=load_scenario(case="surge"), headless=True)
    cmp_.run_until(8 * 3600)  # past the 08:00 Barpeta surge and the 10:00 Goalpara surge
    for w in (cmp_.agentic.world, cmp_.baseline.world):
        assert w.camps["C1"].population == 4400 + 2500
        assert w.camps["C8"].population == 3200 + 1500
    log = cmp_.agentic.world.bus.entries
    assert any(e.kind == "camp.population" and "Barpeta" in e.summary for e in log)


def test_planning_cycles_group_trigger_plan_check_and_dispatch():
    cmp_ = build_comparison(scenario=load_scenario(case="highway"), headless=True)
    cmp_.run_until(3 * 3600)  # past the 07:15 Kaziranga flood
    log = cmp_.agentic.world.bus.entries
    starts = [e for e in log if e.kind == "cycle.started"]
    assert starts, "every planning run opens a cycle"
    first = starts[0].cycle
    agents = {e.agent for e in log if e.cycle == first}
    assert {"coordinator", "validator", "dispatcher", "inventory"} <= agents
    flood = next(e for e in log if e.agent == "monitor" and "Kaziranga" in e.summary)
    reroute = [e for e in log if e.agent == "routing" and e.cycle == flood.cycle]
    assert reroute, "the flood and the re-route it caused are in the same cycle"
    assert any(e.kind == "cycle.started" and e.cycle == flood.cycle and "hazard" in e.summary for e in log)


def test_journal_labels_calls_and_keeps_them():
    j = Journal(maxlen=2)
    seen = []
    j.sink = seen.append
    with purpose("coordinator", cycle=4, attempt=2):
        assert current_purpose() == ("coordinator", {"cycle": 4, "attempt": 2})
        call = j.new("m", "openrouter", "sys", "user")
    assert current_purpose()[0] == "other"
    assert call.purpose == "coordinator" and call.meta["cycle"] == 4
    cid = j.add(call)
    assert j.get(cid) is call and seen == [call]
    for _ in range(2):
        j.add(LLMCall(id=f"x{_}", purpose="p", model="m", provider="p", system="", user=""))
    assert j.get(cid) is None  # ring buffer


def test_store_without_url_is_a_no_op():
    s = Store("")
    s.start()
    run = s.new_run(case_id="highway", case_title="Highway flood", mode="live", seed=42, provider="mock", model="h")
    s.log_entry(
        run, {"id": 1, "sim_seconds": 0, "sim_time": "D1 06:00", "agent": "monitor", "kind": "k", "summary": "s"}
    )
    s.flush()
    assert s.enabled is False and s.status == "off"


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.headers.update(H())
        yield c
        c.post("/api/sim/reset", json={"demo_timeline": True, "case": "highway"})


def test_cases_api_and_run_with_a_case(client):
    cases = client.get("/api/cases").json()
    assert [c["id"] for c in cases] == ["highway", "northbank", "surge"] and all(c["title"] for c in cases)
    r = client.post("/api/demo/run", json={"case": "surge"})
    assert r.status_code == 200 and r.json()["sim"]["case_id"] == "surge"
    assert client.get("/api/scenario").json()["case"]["id"] == "surge"
    assert client.post("/api/demo/run", json={"case": "nope"}).status_code == 422
    get_live().clock.running = False


def test_history_reports_disabled_without_a_database(client):
    body = client.get("/api/history/runs").json()
    assert body == {"enabled": False, "status": "off", "runs": []}
    assert client.get("/api/llm-calls/doesnotexist").status_code == 404
    assert client.get("/api/history/runs", headers=H("driver.t3")).status_code == 403
