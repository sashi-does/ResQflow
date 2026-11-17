"""One test per hard rule (docs/03_AGENTS.md §5), plus soft rules and reserve flagging."""

import pytest

from app.agents.inventory import InventoryAgent
from app.agents.validator import validate
from app.models import Hazard


def order(w="W2", c="C2", t="T3", **items):
    return {"warehouse_id": w, "camp_id": c, "truck_id": t, "items": items or {"water_l": 3000}}


def codes(res):
    return {v.code for v in res.hard}


def test_good_plan_passes(world):
    res = validate(world, {"orders": [order(), order("W1", "C1", "T1", water_l=4000, food_rations=1000)]})
    assert res.ok, res.hard
    assert [o.weight_kg for o in res.orders] == [3000, 4600]


@pytest.mark.parametrize(
    "bad,code",
    [
        (order(w="W9"), "UNKNOWN_WAREHOUSE"),
        (order(c="C99"), "UNKNOWN_CAMP"),
        (order(t="T42"), "UNKNOWN_TRUCK"),
    ],
)
def test_rule1_ids_must_exist(world, bad, code):
    assert code in codes(validate(world, {"orders": [bad]}))


def test_rule2_truck_must_be_idle(world):
    world.trucks["T3"].status = "en_route"
    world.trucks["T3"].at_warehouse = None
    assert "TRUCK_NOT_IDLE" in codes(validate(world, {"orders": [order()]}))


def test_rule2_truck_used_once(world):
    res = validate(world, {"orders": [order(), order(c="C6")]})
    assert "TRUCK_REUSED" in codes(res)


def test_rule2_truck_must_reach_warehouse(world):
    # T6 is at North Lakhimpur; cut both of its roads out (NH-15 to Gohpur, the north-bank road) and the ferry
    world.add_hazard(Hazard(id="H1", label="t", kind="edge_closure", edge_ids=["E15", "E16", "E22"]))
    res = validate(world, {"orders": [order(w="W2", c="C2", t="T6")]})
    assert "TRUCK_CANNOT_REACH_WAREHOUSE" in codes(res)


@pytest.mark.parametrize(
    "items,code",
    [
        ({"water_l": -5}, "BAD_ITEMS"),
        ({"water_l": 10.5}, "BAD_ITEMS"),
        ({"water_l": "lots"}, "BAD_ITEMS"),
        ({"water_l": 0, "food_rations": 0, "medical_kits": 0}, "EMPTY_ORDER"),
    ],
)
def test_rule3_items_non_negative_integers(world, items, code):
    o = order()
    o["items"] = items
    assert code in codes(validate(world, {"orders": [o]}))


def test_rule4_capacity(world):
    res = validate(world, {"orders": [order(water_l=8000, food_rations=2000)]})  # 9,200 kg on an 8 t truck
    assert "OVER_CAPACITY" in codes(res)
    assert "1,200 kg" in next(v.message for v in res.hard if v.code == "OVER_CAPACITY")


def test_rule5_warehouse_stock_incl_reserve(world):
    # Nagaon holds 45,000 L; two trucks can't take more than that. Put T4 at Nagaon too.
    world.trucks["T4"].at_warehouse = "W2"
    world.trucks["T4"].node_id = "NGN"
    world.warehouses["W2"].stock.water_l = 9000
    res = validate(world, {"orders": [order(water_l=6000), order(c="C6", t="T4", water_l=6000)]})
    assert "OVER_STOCK" in codes(res)


def test_rule5_reserve_use_is_flagged_not_rejected(world):
    w2 = world.warehouses["W2"]
    w2.stock.water_l = 10000  # reserve is 9,000 L, so only 1,000 L is "available"
    res = validate(world, {"orders": [order(water_l=3000)]})
    assert res.ok
    assert res.orders[0].uses_reserve is True


def test_rule6_route_must_be_reachable(world):
    world.add_hazard(Hazard(id="H1", label="t", kind="flood", edge_ids=["E5", "E6"]))
    assert "UNREACHABLE" in codes(validate(world, {"orders": [order()]}))


def test_rule7_max_orders(world):
    many = [order(t=f"T{i}") for i in range(1, 7)] * 2
    assert "TOO_MANY_ORDERS" in codes(validate(world, {"orders": many}, max_orders=8))


def test_bad_plan_shape(world):
    assert "BAD_PLAN" in codes(validate(world, {"nothing": True}))


def test_soft_long_detour(world):
    # Nagaon -> Bokakhat without NH-715 is ~2x: no warning
    world.add_hazard(Hazard(id="H1", label="t", kind="flood", edge_ids=["E10"]))
    res = validate(world, {"orders": [order(c="C6")]})
    assert res.ok and not any(v.code == "LONG_DETOUR" for v in res.soft)
    # Jorhat -> Bokakhat without NH-715 at Numaligarh goes all the way round: >3x, accepted with a warning
    world.remove_hazard("H1")
    world.add_hazard(Hazard(id="H2", label="t", kind="flood", edge_ids=["E11"]))
    res = validate(world, {"orders": [order(w="W4", c="C6", t="T5")]})
    assert res.ok and any(v.code == "LONG_DETOUR" for v in res.soft)


def test_soft_hoarding_and_critical_unserved(world):
    statuses = InventoryAgent().run(world)
    res = validate(world, {"orders": [order(w="W1", c="C8", t="T1", water_l=8000)]}, statuses=statuses)
    assert res.ok
    soft = {v.code for v in res.soft}
    assert "HOARDING" in soft  # Goalpara already has a day of water
    assert "CRITICAL_UNSERVED" in soft  # Dhemaji/Majuli/Gohpur are critical and reachable
