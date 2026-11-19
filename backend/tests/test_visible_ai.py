"""doc 10 D: Agents view stats and the read-only "Ask RahatNet" copilot (FakeLLM, no key)."""

import hashlib
import json
import os

os.environ["RAHATNET_NO_LOOP"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agents.copilot import CopilotTools, ask, freeze  # noqa: E402
from app.config import Settings  # noqa: E402
from app.llm.client import MockClient  # noqa: E402
from app.main import app  # noqa: E402
from app.sim.comparison import build_comparison  # noqa: E402
from tests.fake_llm import FakeLLM  # noqa: E402


def world_hash(w) -> str:
    state = {
        "camps": {c.id: (c.population, c.stock.as_dict(), c.cut_off) for c in w.camps.values()},
        "wh": {x.id: x.stock.as_dict() for x in w.warehouses.values()},
        "trucks": {t.id: (t.status, t.path_edge_ids, round(t.progress_km, 6)) for t in w.trucks.values()},
        "hazards": sorted(w.hazards),
        "orders": {o.id: o.status for o in w.orders.values()},
        "log": len(w.bus.entries),
        "t": w.sim_seconds,
    }
    return hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()


@pytest.fixture(scope="module")
def evening():
    """D1 17:00 on the demo timeline: NH-715 flooded, Majuli ferry suspended, Morigaon cut off."""
    c = build_comparison(Settings(llm_provider="mock"))
    c.run_until(11 * 3600)
    return c


def test_every_core_agent_has_activity_and_latency(evening):
    stats = evening.agentic.world.bus.agent_stats()
    for a in ("monitor", "inventory", "routing", "coordinator", "validator", "dispatcher"):
        assert stats[a]["count"] > 0, a
        assert stats[a]["last_summary"]
    for a in ("routing", "inventory", "validator", "dispatcher", "coordinator"):
        assert stats[a]["avg_latency_ms"] is not None, a


def test_copilot_without_key_says_so(evening):
    out = ask(MockClient(), freeze(evening.agentic.world, evening.kpis()), "Which camp is at most risk tonight?")
    assert out["needs_key"] is True and "API key" in out["answer"]


def test_q1_why_isnt_morigaon_getting_supplies(evening):
    w = evening.agentic.world
    before = world_hash(w)
    llm = FakeLLM(
        [
            {
                "tool_calls": [("get_camp", {"camp_id": "Morigaon"})],
                "answer": lambda calls: (
                    f"Morigaon is cut off: reachable from {len(calls[0]['output']['reachable_from'])} warehouses."
                ),
            }
        ]
    )
    out = ask(llm, freeze(w, evening.kpis()), "Why isn't Morigaon getting supplies?")
    camp = llm.calls[0]["tool_calls"][0]["output"]
    assert camp["cut_off"] is True and camp["reachable_from"] == []
    assert camp["population"] == w.camps["C2"].population
    assert camp["days_of_cover"] == round(w.days_of_cover(w.camps["C2"]), 2)
    assert out["answer"] == "Morigaon is cut off: reachable from 0 warehouses."
    assert out["tools_used"] == [{"name": "get_camp", "input": {"camp_id": "Morigaon"}}]
    assert world_hash(w) == before  # read-only


def test_q2_what_if_nh27_also_floods_is_a_dry_run(evening):
    w = evening.agentic.world
    before = world_hash(w)
    tools = CopilotTools(freeze(w, evening.kpis()))
    r = tools.simulate_closure({"roads": ["NH-27"]})
    # direct check with the graph: which camps lose every path when every NH-27 segment is closed too
    nh27 = {e.id for e in w.graph.edges.values() if "NH-27" in e.road}
    blocked = w.blocked_edge_ids() | nh27
    expected = sorted(
        c.name
        for c in w.camps.values()
        if any(w.graph.safe_path(x.node_id, c.node_id, w.blocked_edge_ids()) for x in w.warehouses.values())
        and not any(w.graph.safe_path(x.node_id, c.node_id, blocked) for x in w.warehouses.values())
    )
    assert sorted(r["camps_newly_cut_off"]) == expected
    assert "nothing was changed" in r["note"]
    assert world_hash(w) == before and not (nh27 & w.blocked_edge_ids())


def test_q3_most_at_risk_and_routes(evening):
    w = evening.agentic.world
    tools = CopilotTools(freeze(w, evening.kpis()))
    lowest = min((c for c in w.camps.values() if not c.cut_off), key=lambda c: w.days_of_cover(c))
    got = tools.get_camp({"camp_id": lowest.id})
    assert got["days_of_cover"] == round(w.days_of_cover(lowest), 2) and got["reachable_from"]
    route = tools.get_route({"from_id": "W2", "to_id": "C6"})  # Nagaon -> Bokakhat while NH-715 is flooded
    assert route["reachable"] and "Dabaka" in " ".join(route["towns"])
    assert tools.get_route({"from_id": "W1", "to_id": "C2"})["reachable"] is False


def test_copilot_endpoint_mock_and_agents_endpoint():
    with TestClient(app) as c:
        c.post("/api/sim/reset", json={"demo_timeline": True})
        c.post("/api/sim/advance", json={"minutes": 90})
        r = c.post("/api/copilot", json={"question": "Why is Morigaon cut off?"}).json()
        assert r["needs_key"] is True
        stats = c.get("/api/agents").json()
        assert stats["routing"]["count"] >= 1 and stats["coordinator"]["model"] == "offline (heuristic)"
        assert "agents" in c.get("/api/state").json()
