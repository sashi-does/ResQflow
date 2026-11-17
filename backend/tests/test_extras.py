"""Phase 8 extras: weather fallback, sitreps."""

import httpx

from app.config import Settings
from app.services import weather
from app.sim.comparison import build_comparison
from app.sim.scenario import load_scenario


def test_live_weather_falls_back_to_cache_on_network_error(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(weather.httpx, "get", boom)
    rain = weather.rain_24h(load_scenario().raw["district_centroids"], "live")
    assert rain["Dhemaji"] == 92.0


def test_live_weather_parses_batched_response(monkeypatch):
    centroids = {"A": [26.0, 91.0], "B": [27.0, 94.0]}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return [{"hourly": {"precipitation": [1.0] * 48}}, {"hourly": {"precipitation": [4.0] * 48}}]

    monkeypatch.setattr(weather.httpx, "get", lambda *a, **k: Resp())
    assert weather.rain_24h(centroids, "live") == {"A": 24.0, "B": 96.0}


def test_sitrep_every_three_hours_and_kpis_unchanged():
    c = build_comparison(Settings(llm_provider="mock"))
    c.run_until(24 * 3600)
    reps = [e for e in c.agentic.world.bus.entries if e.kind == "sitrep"]
    assert [e.sim_time for e in reps][:3] == ["D1 09:00", "D1 12:00", "D1 15:00"]
    assert "Situation report" in reps[0].summary and "deliveries so far" in reps[0].summary
    later = next(e for e in reps if e.sim_time == "D1 18:00")
    assert "Cut off: Morigaon" in later.summary
