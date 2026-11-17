from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_mock_without_keys(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = TestClient(app).get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["llm_provider"] == "mock"
