from app.models import Hazard
from app.sim import engine
from app.sim.clock import STEP_S, SimClock
from app.sim.runner import Simulation, load_timeline
from app.sim.scenario import load_scenario
from app.sim.stub_policy import StubPolicy
from app.sim.world import WorldState


class NullPolicy:
    def on_step(self, world, events):
        pass


def run_stub(seed=42, until=24 * 3600):
    sc = load_scenario()
    world = WorldState(sc, seed=seed)
    Simulation(world, StubPolicy(), load_timeline(sc)).run_until(until)
    return world


def test_same_seed_gives_identical_kpis_and_log():
    a, b = run_stub(), run_stub()
    assert a.kpi.snapshot() == b.kpi.snapshot()
    assert [e.summary for e in a.bus.entries] == [e.summary for e in b.bus.entries]


def test_results_do_not_depend_on_speed_multiplier():
    sc = load_scenario()
    results = []
    for speed in (30, 120, 600):
        world = WorldState(sc)
        sim = Simulation(world, StubPolicy(), load_timeline(sc))
        clock = SimClock(speed=speed, running=True)
        while world.sim_seconds < 12 * 3600:
            for _ in range(clock.steps_for_tick()):
                sim.step()
        sim.run_until(12 * 3600)  # land exactly on the same sim time
        results.append((world.sim_seconds, world.kpi.snapshot(), [t.position for t in world.trucks.values()]))
    assert results[0] == results[1] == results[2]


def test_clock_uses_fixed_steps():
    for speed, real_ticks, expected_steps in ((120, 4, 4), (600, 4, 20), (30, 8, 2)):
        clock = SimClock(speed=speed, running=True)
        assert sum(clock.steps_for_tick() for _ in range(real_ticks)) == expected_steps
    assert SimClock(speed=600, running=False).steps_for_tick() == 0
    assert STEP_S == 30


def test_camp_consumption_matches_hand_calculation():
    sc = load_scenario()
    world = WorldState(sc)
    Simulation(world, NullPolicy()).run_until(2 * 3600)
    c2 = world.camps["C2"]  # Morigaon: 5,200 people
    start = sc.raw["camps"][1]["stock"]
    # 2 h of burn: water 5200*3*2/24 = 1300 L; food 5200*2/24 = 433.3; kits 52*2/24 = 4.33
    assert c2.stock.water_l == start["water_l"] - 1300
    assert c2.stock.food_rations == start["food_rations"] - 433
    assert c2.stock.medical_kits == start["medical_kits"] - 4


def test_people_hours_without_water_accumulate_after_stockout():
    sc = load_scenario()
    world = WorldState(sc)
    world.camps["C2"].stock.water_l = 0
    Simulation(world, NullPolicy()).run_until(3600)
    # only Morigaon is dry during the first hour
    assert abs(world.kpi.people_hours_without_water - 5200 * 1.0) < 1e-6


def test_delivery_moves_stock_from_warehouse_to_camp():
    world = run_stub(until=6 * 3600)
    delivered = [o for o in world.orders.values() if o.status == "delivered"]
    assert delivered, "stub should complete deliveries within 6h"
    for o in delivered:
        w = world.warehouses[o.warehouse_id]
        assert w.stock.water_l < w.initial_stock.water_l
    assert world.kpi.deliveries_total == len(delivered)
    assert world.kpi.supplies_delivered_kg == sum(o.weight_kg for o in delivered)


def test_trucks_wait_at_blocked_edge_and_count_stuck_hours():
    sc = load_scenario()
    world = WorldState(sc)
    world.hazard_aware = False  # like the static baseline: drives into the flood
    world.add_hazard(Hazard(id="H1", label="test", kind="edge_closure", edge_ids=["E8"]))
    t = world.trucks["T3"]  # at Nagaon
    path = world.graph.safe_path("NGN", "BKT")
    engine.set_path(world, t, path, status="en_route", leg="return")
    for _ in range(120):  # 1 hour
        engine.step(world)
    assert t.node_id == "NGN" and t.path_edge_ids[0] == "E8"
    assert abs(world.kpi.truck_hours_stuck - 1.0) < 1e-6
