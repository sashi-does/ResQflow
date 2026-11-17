"""Build data/road_graph.json from scenario_assam.json.

* Default: straight-line geometry (densified to 21 points) with length = haversine x winding factor.
* With ORS_API_KEY set (and --ors): fetch driving-hgv geometry per edge from OpenRouteService and cache it.
  The app never calls ORS at runtime; it only reads the committed road_graph.json.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DATA_DIR  # noqa: E402
from app.geo.util import densify, haversine_km, polyline_length_km  # noqa: E402

ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"


def ors_geometry(key: str, a: dict, b: dict) -> tuple[list[tuple[float, float]], float]:
    import httpx

    r = httpx.post(
        ORS_URL,
        headers={"Authorization": key},
        json={"coordinates": [[a["lon"], a["lat"]], [b["lon"], b["lat"]]]},
        timeout=30,
    )
    r.raise_for_status()
    feat = r.json()["features"][0]
    coords = [(round(lat, 6), round(lon, 6)) for lon, lat in feat["geometry"]["coordinates"]]
    return coords, feat["properties"]["summary"]["distance"] / 1000.0


def build(use_ors: bool) -> dict:
    scenario = json.loads((DATA_DIR / "scenario_assam.json").read_text())
    c = scenario["constants"]
    nodes = {n["id"]: n for n in scenario["nodes"]}
    key = os.environ.get("ORS_API_KEY", "")
    out_edges = []
    for e in scenario["edges"]:
        a, b = nodes[e["a"]], nodes[e["b"]]
        pa, pb = (a["lat"], a["lon"]), (b["lat"], b["lon"])
        source = "straight"
        geometry = densify(pa, pb, 20)
        length = haversine_km(pa, pb) * c["road_winding_factor"]
        if use_ors and key and e["kind"] != "ferry":
            try:
                geometry, length = ors_geometry(key, a, b)
                source = "ors"
                time.sleep(1.6)  # stay well under the free-tier per-minute limit
            except Exception as exc:  # fall back to straight line for this edge
                print(f"ORS failed for {e['id']}: {exc}; using straight line", file=sys.stderr)
        rec = {
            **e,
            "geometry": geometry,
            "length_km": round(length, 2),
            "speed_kmh": c["speed_kmh"].get(e["kind"], 25),
            "geometry_source": source,
        }
        if e["kind"] == "ferry":
            rec["crossing_min"] = c["ferry_crossing_min"]
            rec["speed_kmh"] = round(length / (c["ferry_crossing_min"] / 60.0), 2)
        if source == "straight":
            assert abs(polyline_length_km(geometry) * c["road_winding_factor"] - length) < 0.5
        out_edges.append(rec)
    return {"scenario": scenario["id"], "edges": out_edges}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ors", action="store_true", help="use OpenRouteService geometry (needs ORS_API_KEY)")
    args = ap.parse_args()
    graph = build(args.ors)
    path = DATA_DIR / "road_graph.json"
    path.write_text(json.dumps(graph, indent=1, ensure_ascii=False))
    total = sum(e["length_km"] for e in graph["edges"])
    print(f"Wrote {path.name}: {len(graph['edges'])} edges, {total:.0f} km of road")


if __name__ == "__main__":
    main()
