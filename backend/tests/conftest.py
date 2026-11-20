import os

os.environ["LLM_PROVIDER"] = "mock"  # tests are deterministic: never call a real LLM even if .env sets one

import pytest  # noqa: E402

from app.sim.scenario import load_scenario  # noqa: E402
from app.sim.world import WorldState  # noqa: E402


@pytest.fixture
def world() -> WorldState:
    return WorldState(load_scenario())
