import pytest

from app.sim.scenario import load_scenario
from app.sim.world import WorldState


@pytest.fixture
def world() -> WorldState:
    return WorldState(load_scenario())
