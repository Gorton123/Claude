"""Shared utilities for QuantumEarth AI backend."""

import numpy as np

# ── Region bounding boxes (lat_min, lat_max, lon_min, lon_max) ───────────────
REGIONS = {
    "africa":   {"lat": (-35.0,  37.0), "lon": (-18.0,  52.0),  "label": "Africa"},
    "europe":   {"lat": ( 35.0,  72.0), "lon": (-12.0,  42.0),  "label": "Europe"},
    "asia":     {"lat": (  5.0,  55.0), "lon": ( 60.0, 145.0),  "label": "Asia"},
    "americas": {"lat": (-55.0,  70.0), "lon": (-170.0, -30.0), "label": "Americas"},
    "global":   {"lat": (-70.0,  80.0), "lon": (-180.0, 180.0), "label": "Global"},
}


def candidate_points(region_key: str, n: int = 12, seed: int = 42) -> list:
    """Generate n candidate lat/lon points within a region using a grid + jitter."""
    rng = np.random.default_rng(seed)
    r = REGIONS[region_key]
    lat_range = r["lat"]
    lon_range = r["lon"]

    side = max(n * 2, 6)
    lats = np.linspace(lat_range[0], lat_range[1], side)
    lons = np.linspace(lon_range[0], lon_range[1], side)
    grid_lats, grid_lons = np.meshgrid(lats, lons)
    all_points = list(zip(grid_lats.flatten(), grid_lons.flatten()))

    chosen_idx = rng.choice(len(all_points), size=min(n, len(all_points)), replace=False)
    points = []
    for idx in chosen_idx:
        lat, lon = all_points[idx]
        lat = float(np.clip(lat + rng.uniform(-1.5, 1.5), lat_range[0], lat_range[1]))
        lon = float(np.clip(lon + rng.uniform(-1.5, 1.5), lon_range[0], lon_range[1]))
        points.append({"lat": round(lat, 3), "lon": round(lon, 3)})
    return points


def normalise(val: float, lo: float, hi: float) -> float:
    """Normalise a value to [0, 1]."""
    if hi == lo:
        return 0.5
    return float(np.clip((val - lo) / (hi - lo), 0.0, 1.0))


def climate_grid(region_key: str, resolution: int = 8, seed: int = 7) -> list:
    """Generate a synthetic climate anomaly grid over a region."""
    rng = np.random.default_rng(seed)
    r = REGIONS[region_key]
    lat_range = r["lat"]
    lon_range = r["lon"]

    lats = np.linspace(lat_range[0], lat_range[1], resolution)
    lons = np.linspace(lon_range[0], lon_range[1], resolution)

    cells = []
    for lat in lats:
        for lon in lons:
            # Synthetic anomaly: sinusoidal base + random perturbation
            base = np.sin(np.radians(lat)) * 2.0 + np.cos(np.radians(lon) * 0.5)
            anomaly = float(base + rng.normal(0, 1.2))
            cells.append({
                "lat": round(float(lat), 3),
                "lon": round(float(lon), 3),
                "anomaly": round(anomaly, 3),
            })
    return cells


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points in kilometres."""
    R = 6371.0
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlam = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlam / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))
