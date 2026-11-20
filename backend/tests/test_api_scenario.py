from fastapi.testclient import TestClient

from app.main import app
from tests.auth import H


def test_scenario_endpoint_shape():
    body = TestClient(app).get("/api/scenario", headers=H()).json()
    assert len(body["nodes"]) == 20
    assert len(body["edges"]) == 22
    assert all(len(e["geometry"]) >= 2 for e in body["edges"])
    assert len(body["warehouses"]) == 5 and len(body["camps"]) == 8 and len(body["trucks"]) == 6
    assert {p["id"] for p in body["presets"]} == {"F1", "F2", "F3", "F4", "F5", "F6"}
