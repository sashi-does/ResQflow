"""Road graph: Dijkstra over travel minutes, skipping blocked edges. Fully deterministic."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

import networkx as nx

from app.models import Edge, Node


@dataclass
class Path:
    nodes: list[str]
    edge_ids: list[str]
    minutes: float
    km: float
    roads: list[str] = field(default_factory=list)


class RoadGraph:
    """Undirected road network built from scenario nodes and `road_graph.json` edges."""

    def __init__(self, nodes: dict[str, Node], edges: dict[str, Edge]) -> None:
        self.nodes = nodes
        self.edges = edges
        self.g = nx.Graph()
        for n in nodes.values():
            self.g.add_node(n.id)
        for e in edges.values():
            self.g.add_edge(e.a, e.b, id=e.id, minutes=e.minutes)

    def edge_between(self, u: str, v: str) -> Edge:
        return self.edges[self.g[u][v]["id"]]

    def safe_path(self, src: str, dst: str, blocked: Iterable[str] = ()) -> Path | None:
        """Fastest path from src to dst that avoids every blocked edge, or None."""
        if src == dst:
            return Path([src], [], 0.0, 0.0)
        blocked_set = set(blocked)
        view = nx.subgraph_view(self.g, filter_edge=lambda u, v: self.g[u][v]["id"] not in blocked_set)
        try:
            _, nodes = nx.single_source_dijkstra(view, src, dst, weight="minutes")
        except nx.NetworkXNoPath:
            return None
        return self.path_from_nodes(nodes)

    def path_from_nodes(self, nodes: list[str]) -> Path:
        edge_ids = [self.g[nodes[i]][nodes[i + 1]]["id"] for i in range(len(nodes) - 1)]
        es = [self.edges[i] for i in edge_ids]
        roads: list[str] = []
        for e in es:
            if not roads or roads[-1] != e.road:
                roads.append(e.road)
        return Path(nodes, edge_ids, sum(e.minutes for e in es), sum(e.length_km for e in es), roads)

    def oriented_geometry(self, edge_id: str, from_node: str) -> list[tuple[float, float]]:
        """Edge geometry as [lat, lon] points, starting at `from_node`."""
        e = self.edges[edge_id]
        return list(e.geometry) if e.a == from_node else list(reversed(e.geometry))

    def path_coords(self, nodes: list[str], edge_ids: list[str]) -> list[tuple[float, float]]:
        coords: list[tuple[float, float]] = []
        for i, eid in enumerate(edge_ids):
            seg = self.oriented_geometry(eid, nodes[i])
            coords.extend(seg if not coords else seg[1:])
        if not coords and nodes:
            n = self.nodes[nodes[0]]
            coords = [(n.lat, n.lon)]
        return coords

    def route_matrix(
        self,
        sources: dict[str, str],
        targets: dict[str, str],
        blocked: Iterable[str] = (),
    ) -> list[dict]:
        """Safe ETA/distance for every (source id -> node) x (target id -> node) pair."""
        blocked_set = set(blocked)
        out = []
        for sid, snode in sources.items():
            for tid, tnode in targets.items():
                p = self.safe_path(snode, tnode, blocked_set)
                out.append(
                    {
                        "from": sid,
                        "to": tid,
                        "reachable": p is not None,
                        "eta_min": round(p.minutes, 1) if p else None,
                        "distance_km": round(p.km, 1) if p else None,
                        "via": p.roads if p else [],
                    }
                )
        return out
