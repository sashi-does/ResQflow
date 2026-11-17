"""Small geodesy helpers: haversine, densify, and a local metric projection (km) for Assam."""

from __future__ import annotations

import math

EARTH_R_KM = 6371.0
LAT0 = 26.4  # projection origin latitude (centre of the scenario)
KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LON = 111.320 * math.cos(math.radians(LAT0))


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(h))


def densify(a: tuple[float, float], b: tuple[float, float], n: int = 20) -> list[tuple[float, float]]:
    """n+1 evenly spaced [lat, lon] points from a to b (straight line)."""
    return [
        (round(a[0] + (b[0] - a[0]) * i / n, 6), round(a[1] + (b[1] - a[1]) * i / n, 6)) for i in range(n + 1)
    ]


def to_xy(lat: float, lon: float) -> tuple[float, float]:
    """[lat, lon] -> local (x_km, y_km)."""
    return (lon * KM_PER_DEG_LON, lat * KM_PER_DEG_LAT)


def to_latlon(x: float, y: float) -> tuple[float, float]:
    return (y / KM_PER_DEG_LAT, x / KM_PER_DEG_LON)


def polyline_length_km(coords: list[tuple[float, float]]) -> float:
    return sum(haversine_km(coords[i], coords[i + 1]) for i in range(len(coords) - 1))
