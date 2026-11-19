"""doc 10 E: after-action report. Numbers come only from KPIs/log; the LLM may only write prose with placeholders."""

import os
import time

os.environ["RAHATNET_NO_LOOP"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.agents.report import build_facts, make_report  # noqa: E402
from app.config import Settings  # noqa: E402
from app.llm.client import MockClient  # noqa: E402
from app.main import app  # noqa: E402
from app.sim.comparison import build_comparison  # noqa: E402
from tests.fake_llm import FakeLLM  # noqa: E402


@pytest.fixture(scope="module")
def full_day():
    c = build_comparison(Settings(llm_provider="mock"))
    c.run_until(24 * 3600)
    return c


def test_report_numbers_are_exactly_the_kpis(full_day):
    k = full_day.kpis()
    r = make_report(full_day.agentic.world, k, [], MockClient())
    assert r["kpis"] == k
    for row in r["kpi_rows"]:
        assert row["agentic"] == k["agentic"][row["key"]] and row["static"] == k["baseline"][row["key"]]
    water = next(x for x in r["kpi_rows"] if x["key"] == "people_hours_without_water")
    assert water["better"] is True
    assert r["narrative_source"] == "template"
    s = r["narrative"]["summary"]
    assert f"{round(k['agentic']['people_hours_without_water']):,}" in s  # same rounding as the KPI table
    assert "Morigaon" in s  # cut off, escalated
    kinds = {e["kind"] for e in r["timeline"]}
    assert {"hazard.added", "truck.rerouted", "camp.cut_off", "hazard.removed"} <= kinds
    assert any("Morigaon" in rec for rec in r["narrative"]["recommendations"])


def test_llm_prose_gets_numbers_filled_by_code(full_day):
    k = full_day.kpis()
    llm = FakeLLM(
        [
            {
                "summary": "Water outages were {{water_agentic}} people-hours vs {{water_static}} "
                "({{water_delta_pct}}).",
                "recommendations": ["Detour planning for NH-715 before the monsoon."],
            }
        ]
    )
    r = make_report(full_day.agentic.world, k, [], llm)
    f = build_facts(full_day.agentic.world, k, [])
    assert r["narrative_source"] == "llm" and r["narrative_model"] == "Claude Haiku 5.5"
    assert r["narrative"]["summary"] == (
        f"Water outages were {f['placeholders']['water_agentic']} people-hours vs {f['placeholders']['water_static']} "
        f"({f['placeholders']['water_delta_pct']})."
    )


def test_llm_prose_with_invented_numbers_is_rejected(full_day):
    llm = FakeLLM([{"summary": "About 12,345 people went without water.", "recommendations": ["Stock 9,999 L more."]}])
    r = make_report(full_day.agentic.world, full_day.kpis(), [], llm)
    assert r["narrative_source"] == "template" and "figures not in the data" in r["narrative_note"]
    assert "12,345" not in r["narrative"]["summary"]


def test_report_endpoint_matches_kpi_strip_and_auto_report_at_end():
    with TestClient(app) as c:
        c.post("/api/sim/reset", json={"demo_timeline": True})
        c.post("/api/sim/advance", json={"minutes": 300})
        r = c.post("/api/report").json()
        assert r["kpis"] == c.get("/api/kpis").json()  # End & report: identical to what the KPI strip shows
        c.post("/api/sim/reset", json={"demo_timeline": True})
        assert c.get("/api/report").status_code == 404
        c.post("/api/sim/advance", json={"minutes": 24 * 60 + 5})  # runs to D2 06:00 and ends
        for _ in range(50):
            got = c.get("/api/report")
            if got.status_code == 200:
                break
            time.sleep(0.05)
        assert got.status_code == 200 and got.json()["kpis"] == c.get("/api/kpis").json()
