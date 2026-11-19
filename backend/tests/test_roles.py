"""doc 10 C: Camp Coordinator (Field Intake), Driver, Warehouse, Command confirmations. No API key needed."""

import os

import pytest

os.environ["RAHATNET_NO_LOOP"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.agents.field_intake import FieldIntakeAgent, load_demo_reports  # noqa: E402
from app.main import app  # noqa: E402
from app.models import FieldReport  # noqa: E402
from app.sim.live import get_live  # noqa: E402
from tests.auth import H, as_, ws_url  # noqa: E402
from tests.fake_llm import FakeLLM  # noqa: E402

DEMO = {r["id"]: r for r in load_demo_reports()}


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.headers.update(H())
        c.post("/api/sim/reset", json={"demo_timeline": False})
        yield c


def drain(ws, pred, limit=4000):
    for _ in range(limit):
        m = ws.receive_json()
        if pred(m):
            return m
    raise AssertionError("message not received")


# ------------------------------------------------------------------ C1 Camp Coordinator / Field Intake
def test_english_demo_report_is_parsed_and_applied_offline(client):
    r = client.post("/api/demo/field-report", json={"report_id": "en_morigaon"}).json()
    assert r["status"] == "applied" and r["source"] == "recorded"
    assert r["parsed"]["new_population"] == 6000 and r["changes"] == ["population 5,200 → 6,000"]
    live = get_live()
    assert live.world.camps["C2"].population == 6000 and live.baseline.camps["C2"].population == 6000
    assert "baby food" in live.world.camps["C2"].urgent_needs
    assert live.world.camps["C2"].health_flags == ["2 fever cases"]
    assert any("field report from" in t for t in live.orch.pending)


def test_assamese_report_with_big_change_waits_for_command(client):
    r = client.post("/api/camps/C7/reports", json={"text": DEMO["as_majuli"]["text"]}, headers=H("camp.majuli")).json()
    assert r["status"] == "pending_confirmation"
    assert any("46% change" in x for x in r["reasons"]) and any("drinking water is finished" in x for x in r["reasons"])
    live = get_live()
    assert live.world.camps["C7"].population == 4800  # nothing changed yet
    assert "milk powder for children" in live.world.camps["C7"].urgent_needs  # notes attach immediately
    c = client.post(f"/api/field-reports/{r['id']}/decision", json={"decision": "confirm"}).json()
    assert c["status"] == "confirmed"
    for w in (live.world, live.baseline):
        assert w.camps["C7"].population == 7000 and w.camps["C7"].stock.water_l == 0


def test_unknown_text_in_mock_mode_is_flagged_not_crashed(client):
    r = client.post(
        "/api/camps/C3/reports", json={"text": "bridge near camp cracked, need tarpaulins"}, headers=as_("camp", "C3")
    ).json()
    assert r["status"] == "unparsed" and "mock mode" in r["reasons"][0]
    assert (
        client.post(f"/api/field-reports/{r['id']}/decision", json={"decision": "reject"}).json()["status"]
        == "rejected"
    )


@pytest.mark.parametrize("report_id", ["en_morigaon", "as_majuli"])
def test_llm_parses_both_demo_reports_from_fixtures(report_id, world):
    rep = DEMO[report_id]
    agent = FieldIntakeAgent(FakeLLM([rep["recorded"]]))
    camp = world.camps[rep["camp_id"]]
    out = agent.parse(camp.name, camp.population, world.water_days(camp), rep["text"])
    assert out.source == "llm" and out.parsed is not None and out.parsed.confidence > 0.7
    sent = agent.llm.calls[0]["user"]
    assert sent["report"] == rep["text"] and sent["current_population"] == camp.population


def test_low_confidence_needs_human_and_invalid_output_is_unparsed(world):
    low = dict(DEMO["en_morigaon"]["recorded"], confidence=0.4, new_population=None)
    agent = FieldIntakeAgent(FakeLLM([low, {"new_population": "lots"}]))
    camp = world.camps["C2"]
    out = agent.parse(camp.name, camp.population, 0.5, "something")
    rep = agent.apply(world, FieldReport(id="R-1", camp_id="C2", text="x", sim_time="D1 06:00", sim_seconds=0), out)
    assert rep.status == "pending_confirmation" and any("confidence" in r for r in rep.reasons)
    bad = agent.parse(camp.name, camp.population, 0.5, "something")
    assert bad.parsed is None  # Pydantic rejected the AI output


def test_camp_report_reaches_command_feed_over_ws(client):
    with client.websocket_connect(ws_url()) as ws:
        ws.receive_json()
        client.post("/api/demo/field-report", json={"report_id": "en_morigaon"})
        m = drain(ws, lambda m: m["type"] == "log" and m["payload"]["kind"] == "field_report.applied")
        assert m["payload"]["agent"] == "field_intake" and "Morigaon" in m["payload"]["summary"]


def test_delivery_confirmation_with_shortfall(client):
    client.post("/api/sim/advance", json={"minutes": 240})
    delivered = client.get("/api/orders", params={"status": "delivered"}).json()
    assert delivered
    o = delivered[0]
    before = get_live().world.camps[o["camp_id"]].stock.water_l
    received = dict(o["items"], water_l=max(0, o["items"]["water_l"] - 500))
    r = client.post(
        f"/api/camps/{o['camp_id']}/deliveries/{o['id']}/confirm",
        json={"received": received},
        headers=as_("camp", o["camp_id"]),
    ).json()
    assert r["shortfall"]["water_l"] == min(500, o["items"]["water_l"])
    assert get_live().world.camps[o["camp_id"]].stock.water_l == max(0, before - r["shortfall"]["water_l"])
    pending = client.get("/api/orders", params={"status": "dispatched"}).json()
    if pending:
        p = pending[0]
        assert (
            client.post(
                f"/api/camps/{p['camp_id']}/deliveries/{p['id']}/confirm",
                json={"received": p["items"]},
                headers=as_("camp", p["camp_id"]),
            ).status_code
            == 409
        )


# ------------------------------------------------------------------ C2 Driver
def test_driver_gets_reroute_alert_and_ack_reaches_feed(client):
    with client.websocket_connect(
        ws_url()
    ) as ws:  # connect first: a lone client on a stale paused world gets a clean one
        ws.receive_json()
        client.post("/api/sim/advance", json={"minutes": 60})
        client.post("/api/hazards/trigger", json={"preset_id": "F1"})
        t3 = next(t for t in client.get("/api/state").json()["trucks"] if t["id"] == "T3")
        alert = t3["pending_reroute"]
        assert alert and alert["message"].startswith("Route changed. NH-715 flooded near")
        assert "Dabaka" in alert["message"] and "+" in alert["message"]
        assert any(r["road"].startswith("NH-29") or "NH-129" in r["road"] for r in t3["route_roads"])
        assert t3["job"]["to"] == "Bokakhat Relief Camp"
        client.post("/api/trucks/T3/ack", headers=H("driver.t3"))
        m = drain(ws, lambda m: m["type"] == "log" and m["payload"]["kind"] == "driver.ack")
        assert "acknowledged: Route changed" in m["payload"]["summary"]
    t3 = next(t for t in client.get("/api/state").json()["trucks"] if t["id"] == "T3")
    assert t3["pending_reroute"] is None


def test_driver_road_report_is_unverified_until_confirmed_then_reroutes(client):
    client.post("/api/sim/advance", json={"minutes": 60})
    client.post("/api/hazards/trigger", json={"preset_id": "F1"})  # T3 now on the Dabaka detour (E19, E20...)
    live = get_live()
    t3 = live.world.trucks["T3"]
    edge = next(e for e in t3.path_edge_ids if e == "E20")
    h = client.post(
        "/api/trucks/T1/road-report", json={"edge_id": edge, "kind": "landslide"}, headers=as_("driver", "T1")
    ).json()
    assert h["verified"] is False and edge not in client.get("/api/state").json()["blocked_edge_ids"]
    assert edge in live.world.trucks["T3"].path_edge_ids  # not re-routed on one report
    client.post(f"/api/hazards/{h['id']}/confirm")
    assert edge in client.get("/api/state").json()["blocked_edge_ids"]
    assert (
        edge not in live.world.trucks["T3"].path_edge_ids
        or live.world.trucks["T3"].status == "holding"
        or live.world.trucks["T3"].leg == "hold"
    )
    assert any(e.kind == "hazard.confirmed" for e in live.world.bus.entries)


def test_second_driver_report_verifies(client):
    live = get_live()
    a = client.post(
        "/api/trucks/T1/road-report", json={"edge_id": "E7", "kind": "waterlogged"}, headers=as_("driver", "T1")
    ).json()
    assert a["verified"] is False
    b = client.post(
        "/api/trucks/T2/road-report", json={"edge_id": "E7", "kind": "waterlogged"}, headers=as_("driver", "T2")
    ).json()
    assert b["id"] == a["id"] and b["verified"] is True
    assert "E7" in live.world.blocked_edge_ids() and "E7" in live.baseline.blocked_edge_ids()


# ------------------------------------------------------------------ C3 Warehouse
def test_stock_adjustment_applies_to_both_worlds(client):
    live = get_live()
    before = live.world.warehouses["W2"].stock.water_l
    r = client.post(
        "/api/warehouses/W2/adjust",
        json={"delta": {"water_l": 20000}, "note": "from State Hub"},
        headers=H("wh.nagaon"),
    ).json()
    assert r["stock"]["water_l"] == before + 20000
    assert live.baseline.warehouses["W2"].stock.water_l == live.world.warehouses["W2"].stock.water_l
