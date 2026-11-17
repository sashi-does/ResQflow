from app.sim.scenario import load_scenario


def graph():
    return load_scenario().graph


def test_scenario_has_20_nodes_and_22_edges():
    g = graph()
    assert len(g.nodes) == 20
    assert len(g.edges) == 22


def test_nagaon_to_bokakhat_uses_nh715_when_open():
    p = graph().safe_path("NGN", "BKT")
    assert p is not None
    assert "E10" in p.edge_ids


def test_blocking_e10_detours_via_dabaka_bokajan_numaligarh():
    p = graph().safe_path("NGN", "BKT", blocked={"E10"})
    assert p is not None
    assert p.nodes == ["NGN", "DBK", "BKJ", "NMG", "BKT"]
    assert "E10" not in p.edge_ids


def test_blocking_e5_e6_cuts_off_morigaon():
    g = graph()
    for src in ("GHY", "NGN", "JGR", "TZP"):
        assert g.safe_path(src, "MRG", blocked={"E5", "E6"}) is None


def test_safe_path_never_uses_blocked_edges():
    g = graph()
    blocked = {"E10", "E18", "E7"}
    for a in g.nodes:
        for b in g.nodes:
            p = g.safe_path(a, b, blocked)
            if p is not None:
                assert not blocked & set(p.edge_ids)


def test_majuli_reachable_via_north_bank_when_ferry_suspended():
    p = graph().safe_path("JRH", "MJL", blocked={"E18"})
    assert p is not None
    assert "E22" in p.edge_ids


def test_ferry_has_fixed_crossing_time():
    assert graph().edges["E18"].minutes == 90


def test_route_matrix_marks_unreachable():
    g = graph()
    m = g.route_matrix({"W2": "NGN"}, {"C2": "MRG", "C6": "BKT"}, blocked={"E5", "E6"})
    by_to = {r["to"]: r for r in m}
    assert by_to["C2"]["reachable"] is False
    assert by_to["C6"]["reachable"] is True and by_to["C6"]["eta_min"] > 0


def test_path_coords_are_continuous():
    g = graph()
    p = g.safe_path("GHY", "BKT")
    coords = g.path_coords(p.nodes, p.edge_ids)
    start, end = g.nodes["GHY"], g.nodes["BKT"]
    assert coords[0] == (start.lat, start.lon)
    assert coords[-1] == (end.lat, end.lon)
