"""Phase 4: LLM coordinator with retry-on-violations, heuristic fallback, background mode, demo fault. No key needed."""

import json

from app.agents.coordinator import INJECT_LABEL, CoordinatorAgent, build_context
from app.agents.inventory import InventoryAgent
from app.config import Settings
from app.llm.client import LLMError, extract_json, make_llm
from app.sim.comparison import build_comparison
from tests.fake_llm import FakeLLM


def statuses(world):
    return InventoryAgent().run(world)


GOOD = {
    "orders": [
        {
            "warehouse_id": "W5",
            "camp_id": "C5",
            "truck_id": "T6",
            "items": {"food_rations": 1000, "water_l": 5000, "medical_kits": 10},
            "priority": "critical",
            "reason": "Dhemaji has 0.4 days of water for 6,000 people; North Lakhimpur is 1h47m away.",
        }
    ],
    "unserved": [],
    "summary": "Water first to Dhemaji.",
}


def overloaded(_ctx):
    bad = json.loads(json.dumps(GOOD))
    bad["orders"][0]["items"]["water_l"] = 9000  # 9,000 + 600 + 20 kg on an 8 t truck
    return bad


def kinds(world):
    return [e.kind for e in world.bus.entries]


def test_llm_plan_passes_and_is_logged_with_model_and_numbers(world):
    llm = FakeLLM([GOOD])
    coord = CoordinatorAgent(6000, llm=llm)
    r = coord.plan(world, statuses(world), "test")
    assert r.source == "llm" and r.attempts == 1 and r.validation.ok
    msg = next(e for e in world.bus.entries if e.kind == "plan.proposed")
    assert msg.summary.startswith("Coordinator (Claude Haiku 5.5) proposed 1 order")
    assert "0.4 days" in msg.reasoning  # the LLM's reason with numbers is shown


def test_overcapacity_plan_is_rejected_retried_with_violations_then_heuristic(world):
    llm = FakeLLM([overloaded, overloaded, overloaded])
    coord = CoordinatorAgent(6000, llm=llm)
    r = coord.plan(world, statuses(world), "test")
    assert r.source == "heuristic" and r.validation.ok
    assert len(llm.calls) == 3
    assert "violations" in llm.calls[1]["user"] and "overloaded" in llm.calls[1]["user"]["violations"][0]
    assert llm.calls[1]["user"]["previous_plan"]["orders"][0]["items"]["water_l"] == 9000
    assert kinds(world).count("plan.rejected") == 3
    assert "plan.fallback" in kinds(world)


def test_retry_succeeds_on_second_attempt(world):
    llm = FakeLLM([overloaded, GOOD])
    r = CoordinatorAgent(6000, llm=llm).plan(world, statuses(world), "test")
    assert r.source == "llm" and r.attempts == 2
    assert any("revised the plan" in e.summary for e in world.bus.entries)


def test_timeout_falls_back_without_crashing(world):
    llm = FakeLLM([LLMError("timed out after 20s")])
    r = CoordinatorAgent(6000, llm=llm).plan(world, statuses(world), "test")
    assert r.source == "heuristic" and r.validation.ok
    fb = next(e for e in world.bus.entries if e.kind == "plan.fallback")
    assert "timed out" in fb.summary


def test_background_mode_does_not_block_and_completes_on_poll(world):
    llm = FakeLLM([GOOD])
    coord = CoordinatorAgent(6000, llm=llm, background=True)
    assert coord.plan(world, statuses(world), "test") is None and coord.busy
    coord._cycle.future.result(timeout=5)  # wait for the worker thread
    r = coord.poll(world)
    assert r is not None and r.source == "llm" and not coord.busy


def test_context_is_compact(world):
    ctx = build_context(world, statuses(world), CoordinatorAgent(6000))
    assert len(json.dumps(ctx, separators=(",", ":"))) / 4 < 6000  # ~tokens
    assert {"camps", "warehouses", "idle_trucks", "routes", "unit_weights_kg", "rules"} <= set(ctx)


def test_no_key_behaves_exactly_like_mock():
    s = Settings(llm_provider="anthropic", anthropic_api_key="")
    assert s.effective_llm_provider == "mock" and not make_llm(s).available
    a = build_comparison(Settings(llm_provider="mock"))
    b = build_comparison(s, llm=make_llm(s))
    a.run_until(8 * 3600)
    b.run_until(8 * 3600)
    assert a.kpis() == b.kpis()


def test_full_headless_run_with_llm_that_always_times_out_never_crashes():
    llm = FakeLLM([LLMError("timed out")] * 200)
    c = build_comparison(Settings(llm_provider="mock"), llm=llm)
    c.run_until(24 * 3600)
    k = c.kpis()
    assert k["agentic"]["people_hours_without_water"] <= 0.7 * k["baseline"]["people_hours_without_water"]


def test_demo_inject_fault_once_per_run_mock_mode():
    c = build_comparison(Settings(llm_provider="mock", demo_inject_fault=True))
    c.run_until(24 * 3600)
    w = c.agentic.world
    faults = [e for e in w.bus.entries if e.kind == "demo.fault"]
    assert len(faults) == 1 and faults[0].summary.startswith(INJECT_LABEL)
    after = w.bus.entries[w.bus.entries.index(faults[0]) :]
    rejected = next(e for e in after if e.kind == "plan.rejected")
    assert "overloaded" in rejected.summary
    assert any(e.kind == "plan.proposed" and "revised" in e.summary for e in after)


def test_inject_fault_off_by_default():
    c = build_comparison(Settings(llm_provider="mock"))
    c.run_until(12 * 3600)
    assert not [e for e in c.agentic.world.bus.entries if e.kind == "demo.fault"]


def test_extract_json_repair_pass():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Here you go: {"a": [1, 2]} hope that helps') == {"a": [1, 2]}
