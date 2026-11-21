"""Phase 5: REST + WebSocket integration (trigger -> reroute -> approval), via FastAPI TestClient."""

import os

import pytest

os.environ["RESQFLOW_NO_LOOP"] = "1"  # tests drive time explicitly with /api/sim/advance

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.auth import H, ws_url  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.headers.update(H())
        c.post("/api/sim/reset", json={"demo_timeline": False})
        yield c


def drain_until(ws, wanted: str, limit: int = 3000) -> dict:
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["type"] == wanted:
            return msg
    raise AssertionError(f"no {wanted} message")


def test_fresh_page_load_starts_clean(client):
    client.post("/api/hazards/trigger", json={"preset_id": "F1"})
    client.post("/api/sim/advance", json={"minutes": 30})
    with client.websocket_connect(ws_url()) as ws:  # first client, sim paused -> clean slate
        snap = ws.receive_json()["payload"]
    assert snap["hazards"] == [] and snap["log"] == [] and snap["sim"]["sim_time"] == "D1 06:00"
    assert snap["sim"]["running"] is False


def test_camp_status_matches_threshold(client):
    client.post("/api/sim/advance", json={"minutes": 120})
    for c in client.get("/api/state").json()["camps"]:
        d = c["days_of_cover"]
        assert c["status"] == ("critical" if d < 0.5 else "low" if d < 1.0 else "ok")


def test_snapshot_shape(client):
    snap = client.get("/api/state").json()
    assert snap["sim"]["sim_time"] == "D1 06:00" and snap["sim"]["running"] is False
    assert len(snap["trucks"]) == 6 and len(snap["camps"]) == 8 and len(snap["warehouses"]) == 5
    assert {"agentic", "baseline", "delta_pct"} <= set(snap["kpis"])
    camp = snap["camps"][0]
    assert {"stock", "incoming", "days_of_cover", "status", "cut_off", "unserved_reason"} <= set(camp)
    assert {"stock", "available", "reserve"} <= set(snap["warehouses"][0])


def test_ws_snapshot_then_events_and_reroute(client):
    with client.websocket_connect(ws_url()) as ws:
        first = ws.receive_json()
        assert first["type"] == "snapshot"
        # 06:00 plan dispatches T3 Nagaon -> Bokakhat over NH-715; advance to 07:00 (on NH-27, approaching Kaliabor)
        client.post("/api/sim/advance", json={"minutes": 60})
        assert drain_until(ws, "log")["payload"]["summary"]
        r = client.post("/api/hazards/trigger", json={"preset_id": "F1"})
        assert r.status_code == 200 and r.json()["edge_ids"] == ["E10"]
        msg = drain_until(ws, "truck.rerouted")
        p = msg["payload"]
        assert p["truck_id"] == "T3" and p["old_path_coords"] and p["new_path_coords"]
        assert p["new_eta_sim_seconds"] > p["old_eta_sim_seconds"]
    state = client.get("/api/state").json()
    assert "E10" in state["blocked_edge_ids"]
    t3 = next(t for t in state["trucks"] if t["id"] == "T3")
    assert t3["path_coords"]


def test_tick_and_kpis_messages(client):
    with client.websocket_connect(ws_url()) as ws:
        ws.receive_json()
        client.post("/api/sim/advance", json={"minutes": 10})
        tick = drain_until(ws, "tick")["payload"]
        assert tick["sim_time"] == "D1 06:10"
        assert {"id", "lat", "lon", "status"} <= set(tick["trucks"][0])
        assert "warehouses" in tick and "cut_off" in tick["camps"][0]


def test_approve_and_reject_flow(client):
    with client.websocket_connect(ws_url()) as ws:
        ws.receive_json()
        client.post("/api/sim/advance", json={"minutes": 1})
        awaiting = client.get("/api/orders", params={"status": "awaiting_approval"}).json()
        assert len(awaiting) >= 2, "the 06:00 plan has heavy orders for critical camps"
        first, second = awaiting[0], awaiting[1]
        assert first["weight_kg"] > 6000

        r = client.post(f"/api/approvals/{first['id']}", json={"decision": "approve"})
        assert r.status_code == 200 and r.json()["status"] == "dispatched"
        truck_msgs = []
        for _ in range(500):  # truck.updated is published just before order.updated
            msg = ws.receive_json()
            if msg["type"] == "truck.updated":
                truck_msgs.append(msg["payload"])
            p = msg["payload"]
            if msg["type"] == "order.updated" and p["id"] == first["id"] and p["status"] == "dispatched":
                break
        else:
            raise AssertionError("no order.updated for the approved order")
        assert any(t["truck_id"] == first["truck_id"] and t["status"] == "loading" for t in truck_msgs)

        r = client.post(f"/api/approvals/{second['id']}", json={"decision": "reject", "note": "send by boat"})
        assert r.json()["status"] == "rejected"
        assert client.post(f"/api/approvals/{second['id']}", json={"decision": "approve"}).status_code == 409

    log = client.get("/api/log", params={"limit": 50}).json()
    assert any(
        e["agent"] == "human" and "Approved by Ritu Baruah (District Officer, Nagaon)" in e["summary"] and e["actor"]
        for e in log
    )
    assert any(e["agent"] == "human" and "Rejected" in e["summary"] for e in log)


def test_policy_auto_approves_critical_orders_after_countdown(client):
    assert client.get("/api/policy").json() == {"auto_approve_critical": True, "max_tonnes": 8.0, "delay_min": 20}
    client.post("/api/sim/advance", json={"minutes": 1})
    waiting = client.get("/api/orders", params={"status": "awaiting_approval"}).json()
    assert waiting and all(o["auto_approve_at_sim"] == o["approval_requested_at_sim"] + 1200 for o in waiting)
    client.post("/api/sim/advance", json={"minutes": 25})
    assert client.get("/api/orders", params={"status": "awaiting_approval"}).json() == []
    log = client.get("/api/log", params={"limit": 100}).json()
    assert any("under the Command policy" in e["summary"] for e in log)


def test_policy_off_means_a_human_must_click(client):
    r = client.post("/api/policy", json={"auto_approve_critical": False, "max_tonnes": 8, "delay_min": 20})
    assert r.json()["auto_approve_critical"] is False
    client.post("/api/sim/advance", json={"minutes": 90})
    waiting = client.get("/api/orders", params={"status": "awaiting_approval"}).json()
    assert waiting and all(o["auto_approve_at_sim"] is None for o in waiting)
    client.post("/api/policy", json={"auto_approve_critical": True, "max_tonnes": 8, "delay_min": 20})


def test_reserve_orders_never_auto_approve(world):
    from app.agents.dispatcher import DispatcherAgent
    from app.models import ApprovalPolicy, Order, Supplies

    d = DispatcherAgent(6000, None, ApprovalPolicy())
    o = Order(
        id="O-1",
        warehouse_id="W2",
        camp_id="C2",
        truck_id="T3",
        items=Supplies(water_l=3000),
        weight_kg=3000,
        priority="critical",
        uses_reserve=True,
        status="awaiting_approval",
    )
    assert not d.policy_eligible(o)
    o.uses_reserve = False
    assert d.policy_eligible(o)
    o.weight_kg = 8500
    assert not d.policy_eligible(o)


def test_recede_and_replan_and_custom(client):
    client.post("/api/hazards/trigger", json={"preset_id": "F3"})
    hid = next(h["id"] for h in client.get("/api/state").json()["hazards"] if h["preset_id"] == "F3")
    assert client.delete(f"/api/hazards/{hid}").json() == {"removed": True}
    assert client.delete("/api/hazards/H999").status_code == 404
    assert client.post("/api/replan").json() == {"started": True}
    poly = {
        "type": "Polygon",
        "coordinates": [[[92.30, 26.20], [92.40, 26.20], [92.40, 26.30], [92.30, 26.30], [92.30, 26.20]]],
    }
    h = client.post("/api/hazards/custom", json={"label": "Test", "polygon": poly}).json()
    assert set(h["edge_ids"]) >= {"E5", "E6"}


def test_speed_start_pause_and_demo_run(client):
    assert client.post("/api/sim/speed", json={"multiplier": 600}).json() == {"speed": 600}
    assert client.post("/api/sim/speed", json={"multiplier": 7}).status_code == 422
    assert client.post("/api/sim/start").json() == {"running": True}
    assert client.post("/api/sim/pause").json() == {"running": False}
    r = client.post("/api/demo/run").json()
    assert r["running"] is True and r["sim"]["demo_timeline"] is True
    client.post("/api/sim/pause")
    k = client.get("/api/kpis").json()
    assert set(k) == {"agentic", "baseline", "delta_pct"}


def test_spa_routes_serve_index_html(client, tmp_path, monkeypatch):
    import app.main as main

    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>resqflow</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setattr(main, "STATIC_DIR", tmp_path)
    for path in ("/", "/command", "/camp/C7", "/driver/T3"):
        r = client.get(path)
        assert r.status_code == 200 and "resqflow" in r.text
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/../../etc/passwd").status_code in (200, 404)  # never escapes the static dir
    assert "root:" not in client.get("/../../etc/passwd").text
    assert client.get("/api/nope").status_code == 404
