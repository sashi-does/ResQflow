"""doc 11: login, JWT, role + scope checks (403), role-filtered WebSocket, attributed human actions."""

import os

import pytest

os.environ["RESQFLOW_NO_LOOP"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

from app.auth.users import DEMO_PASSWORD, DEMO_USERS  # noqa: E402
from app.main import app  # noqa: E402
from app.sim.live import get_live  # noqa: E402
from tests.auth import H, as_, ws_url  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.post("/api/sim/reset", json={"demo_timeline": False}, headers=H())
        yield c


def test_login_with_every_demo_account_and_me(client):
    assert len(client.get("/api/auth/demo-users").json()) == 5
    for u in DEMO_USERS:
        r = client.post("/api/auth/login", json={"username": u["username"], "password": DEMO_PASSWORD})
        assert r.status_code == 200, u["username"]
        body = r.json()
        assert body["user"]["role"] == u["role"] and body["user"]["scope_id"] == u["scope_id"]
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}).json()
        assert me["name"] == u["name"]


def test_wrong_password_and_missing_or_bad_token_are_401(client):
    assert client.post("/api/auth/login", json={"username": "officer", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "ghost", "password": DEMO_PASSWORD}).status_code == 401
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.get("/api/health").status_code == 200  # public


@pytest.mark.parametrize("who", ["camp.majuli", "driver.t3", "wh.nagaon"])
def test_officer_only_endpoints_reject_field_roles(client, who):
    for method, path, body in [
        ("post", "/api/sim/start", None),
        ("post", "/api/demo/run", None),
        ("post", "/api/hazards/trigger", {"preset_id": "F1"}),
        ("post", "/api/approvals/O-1", {"decision": "approve"}),
        ("post", "/api/field-reports/R-1/decision", {"decision": "confirm"}),
        ("get", "/api/kpis", None),
        ("get", "/api/log", None),
        ("post", "/api/copilot", {"question": "hi"}),
        ("get", "/api/agents", None),
    ]:
        r = (
            getattr(client, method)(path, json=body, headers=H(who))
            if body
            else getattr(client, method)(path, headers=H(who))
        )
        assert r.status_code == 403, (who, path)


def test_out_of_role_and_out_of_scope_are_403(client):
    # wrong role
    assert client.post("/api/trucks/T3/ack", headers=H("camp.majuli")).status_code == 403
    assert client.post("/api/camps/C7/reports", json={"text": "x"}, headers=H("driver.t3")).status_code == 403
    assert (
        client.post("/api/camps/C7/reports", json={"text": "x"}, headers=H()).status_code == 403
    )  # officer isn't a camp
    adj = {"delta": {"water_l": 1}, "note": ""}
    assert client.post("/api/warehouses/W2/adjust", json=adj, headers=H("camp.majuli")).status_code == 403
    # wrong scope
    assert client.post("/api/camps/C7/reports", json={"text": "x"}, headers=H("camp.morigaon")).status_code == 403
    assert client.post("/api/trucks/T1/ack", headers=H("driver.t3")).status_code == 403
    assert client.post("/api/warehouses/W1/adjust", json=adj, headers=H("wh.nagaon")).status_code == 403
    assert client.get("/api/camps/C7/alerts", headers=H("camp.morigaon")).status_code == 403
    assert client.get("/api/trucks/T1/history", headers=H("driver.t3")).status_code == 403
    # right scope
    assert client.post("/api/trucks/T3/ack", headers=H("driver.t3")).status_code == 200
    assert client.get("/api/camps/C7/alerts", headers=H("camp.majuli")).status_code == 200
    assert client.get("/api/trucks/T3/history", headers=H("driver.t3")).status_code == 200


def test_lists_are_filtered_by_scope(client):
    client.post("/api/sim/advance", json={"minutes": 30}, headers=H())
    all_orders = client.get("/api/orders", headers=H()).json()
    assert all_orders
    for who, key, scope in [
        ("driver.t3", "truck_id", "T3"),
        ("wh.nagaon", "warehouse_id", "W2"),
        ("camp.majuli", "camp_id", "C7"),
    ]:
        mine = client.get("/api/orders", headers=H(who)).json()
        assert all(o[key] == scope for o in mine)
        assert len(mine) == sum(1 for o in all_orders if o[key] == scope)
    state = client.get("/api/state", headers=H("driver.t3")).json()
    assert [t["id"] for t in state["trucks"]] == ["T3"] and "kpis" not in state and "agents" not in state


def test_websocket_needs_a_token_and_is_filtered_by_role(client):
    with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect("/ws?token=bad") as ws:
        ws.receive_json()
    assert exc.value.code == 4401
    with client.websocket_connect(ws_url("driver.t3")) as ws:
        snap = ws.receive_json()["payload"]
        assert [t["id"] for t in snap["trucks"]] == ["T3"] and "kpis" not in snap
        client.post("/api/sim/advance", json={"minutes": 20}, headers=H())  # dispatches happen at 06:00
        client.post("/api/trucks/T3/ack", headers=H("driver.t3"))
        seen = []
        for _ in range(400):
            m = ws.receive_json()
            seen.append(m)
            if m["type"] == "log" and m["payload"]["kind"] == "driver.ack":
                break
        types = {m["type"] for m in seen}
        assert not types & {"kpis", "approval.requested", "plan.started", "plan.completed"}
        for m in seen:
            if m["type"] == "log":
                assert "T3" in m["payload"]["refs"]["truck_ids"]
            if m["type"].startswith("truck."):
                assert m["payload"]["truck_id"] == "T3"
            if m["type"] == "tick":
                assert [t["id"] for t in m["payload"]["trucks"]] == ["T3"]
        assert seen[-1]["payload"]["actor"] == "Bikash Kalita (Truck Driver, T3)"


def test_camp_alerts_and_warehouse_mark_loaded_are_attributed(client):
    client.post("/api/sim/advance", json={"minutes": 30}, headers=H())
    live = get_live()
    dispatched = [o for o in live.world.orders.values() if o.status == "dispatched"]
    assert dispatched
    o = dispatched[0]
    alerts = client.get(f"/api/camps/{o.camp_id}/alerts", headers=as_("camp", o.camp_id)).json()
    a = next(a for a in alerts if a["order_id"] == o.id and a["kind"] == "dispatch")
    assert f"Truck {o.truck_id}" in a["en"] and f"ট্ৰাক {o.truck_id}" in a["as"]
    wh = as_("warehouse", o.warehouse_id, "Pranjal Saikia")
    other = "W1" if o.warehouse_id != "W1" else "W2"
    assert client.post(f"/api/orders/{o.id}/loaded", headers=as_("warehouse", other)).status_code == 403
    assert client.post(f"/api/orders/{o.id}/loaded", headers=wh).json()["loaded_confirmed"] is True
    e = live.world.bus.entries[-1]
    assert e.kind == "order.loaded" and e.actor and e.actor.startswith("Pranjal Saikia")


def test_inject_fault_toggle_is_officer_only(client):
    assert client.post("/api/sim/inject-fault", json={"enabled": True}, headers=H("driver.t3")).status_code == 403
    assert client.post("/api/sim/inject-fault", json={"enabled": True}, headers=H()).json() == {"enabled": True}
    assert client.get("/api/health").json()["demo_inject_fault"] is True
    client.post("/api/sim/inject-fault", json={"enabled": False}, headers=H())
    assert client.get("/api/health").json()["demo_inject_fault"] is False
