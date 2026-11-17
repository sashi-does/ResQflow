import pytest

from app.geo.hazards import hazard_from_preset
from app.sim.scenario import load_scenario

EXPECTED = {"F1": ["E10"], "F2": ["E5", "E6"], "F3": ["E18"], "F4": ["E15"]}


@pytest.mark.parametrize("preset_id,expected", EXPECTED.items())
def test_each_preset_blocks_only_its_intended_edges(preset_id, expected):
    sc = load_scenario()
    h = hazard_from_preset(sc.presets[preset_id], sc.graph, "H1", 0)
    assert h.edge_ids == expected


def test_f2_does_not_block_nh27():
    sc = load_scenario()
    h = hazard_from_preset(sc.presets["F2"], sc.graph, "H1", 0)
    assert "E7" not in h.edge_ids
    assert "E4" not in h.edge_ids


def test_flood_presets_have_geojson_polygons():
    sc = load_scenario()
    for pid in ("F1", "F2", "F4"):
        h = hazard_from_preset(sc.presets[pid], sc.graph, "H", 0)
        assert h.polygon is not None
        assert h.polygon["type"] in ("Polygon", "MultiPolygon")
        lon, lat = (
            h.polygon["coordinates"][0][0]
            if h.polygon["type"] == "Polygon"
            else h.polygon["coordinates"][0][0][0]
        )
        assert 89 < lon < 96 and 25 < lat < 28


def test_edge_closure_has_no_polygon():
    sc = load_scenario()
    h = hazard_from_preset(sc.presets["F3"], sc.graph, "H", 0)
    assert h.polygon is None and h.edge_ids == ["E18"]


def test_detour_survives_all_floods_at_once():
    sc = load_scenario()
    blocked = set()
    for pid in EXPECTED:
        blocked |= set(hazard_from_preset(sc.presets[pid], sc.graph, "H", 0).edge_ids)
    p = sc.graph.safe_path("NGN", "BKT", blocked)
    assert p is not None and p.nodes == ["NGN", "DBK", "BKJ", "NMG", "BKT"]
