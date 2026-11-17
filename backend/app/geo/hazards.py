"""Flood presets -> polygons -> blocked edges (shapely, in a local km projection)."""

from __future__ import annotations

from typing import Any

import numpy as np
import shapely
from shapely.geometry import LineString, Point, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import substring, unary_union

from app.geo.graph import RoadGraph
from app.geo.util import KM_PER_DEG_LAT, KM_PER_DEG_LON, to_xy
from app.models import Hazard

MID_START, MID_END = 0.2, 0.8  # only buffer the middle of a target edge


def edge_line_xy(graph: RoadGraph, edge_id: str) -> LineString:
    return LineString([to_xy(lat, lon) for lat, lon in graph.edges[edge_id].geometry])


def preset_polygon_xy(preset: dict[str, Any], graph: RoadGraph) -> BaseGeometry | None:
    """Polygon (km coordinates) for a flood preset; None for edge closures."""
    if preset.get("center_node"):
        n = graph.nodes[preset["center_node"]]
        return Point(to_xy(n.lat, n.lon)).buffer(preset["radius_km"], quad_segs=24)
    if preset.get("target_edges"):
        parts = [
            substring(edge_line_xy(graph, eid), MID_START, MID_END, normalized=True).buffer(
                preset["buffer_km"], quad_segs=16
            )
            for eid in preset["target_edges"]
        ]
        return unary_union(parts)
    return None


def blocked_edges_xy(poly: BaseGeometry, graph: RoadGraph) -> list[str]:
    return sorted((eid for eid in graph.edges if edge_line_xy(graph, eid).intersects(poly)), key=_edge_key)


def _edge_key(eid: str) -> tuple[int, str]:
    digits = "".join(ch for ch in eid if ch.isdigit())
    return (int(digits) if digits else 0, eid)


def to_geojson(poly_xy: BaseGeometry) -> dict[str, Any]:
    """km-projected geometry -> GeoJSON in [lon, lat]."""
    scale = np.array([1.0 / KM_PER_DEG_LON, 1.0 / KM_PER_DEG_LAT])
    ll = shapely.transform(poly_xy, lambda pts: np.round(pts * scale, 5))
    return mapping(ll)


def hazard_from_preset(preset: dict[str, Any], graph: RoadGraph, hazard_id: str, sim_seconds: int) -> Hazard:
    poly = preset_polygon_xy(preset, graph)
    if poly is not None:
        edge_ids = blocked_edges_xy(poly, graph)
        polygon = to_geojson(poly)
    else:
        edge_ids = sorted(preset.get("edge_ids", []), key=_edge_key)
        polygon = None
    return Hazard(
        id=hazard_id,
        label=preset["label"],
        kind=preset["kind"],
        polygon=polygon,
        edge_ids=edge_ids,
        severity=preset.get("severity", "high"),
        created_at_sim=sim_seconds,
        preset_id=preset["id"],
    )
