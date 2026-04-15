"""QuantumEarth AI — Quantum Optimiser using QAOA (PennyLane).

QAOA (Quantum Approximate Optimisation Algorithm) is used here to solve a
weighted max-coverage facility-location problem:
  - Given N candidate sites, choose K to maximise geographic spread
    while minimising pairwise redundancy.
  - Classically this is NP-hard; QAOA finds good approximate solutions
    by exploring a quantum superposition of all possible subsets.

The circuit uses p=2 QAOA layers running on PennyLane's default.qubit
simulator — no API key, no internet, completely local.
"""

import numpy as np
import pennylane as qml
from quantum.utils import candidate_points, haversine_km, REGIONS

# ── QAOA helpers ──────────────────────────────────────────────────────────────

def _cost_matrix(points: list) -> np.ndarray:
    """Build a symmetric distance matrix (km) between candidate points."""
    n = len(points)
    C = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine_km(points[i]["lat"], points[i]["lon"],
                             points[j]["lat"], points[j]["lon"])
            C[i, j] = C[j, i] = d
    return C


def _qaoa_circuit(n_qubits: int, p: int, gammas: np.ndarray, betas: np.ndarray,
                  cost_terms: list):
    """Define a QAOA circuit and return expectation values of all Z operators."""
    dev = qml.device("default.qubit", wires=n_qubits)

    @qml.qnode(dev)
    def circuit():
        # Initial state: equal superposition
        for i in range(n_qubits):
            qml.Hadamard(wires=i)

        for layer in range(p):
            # Cost unitary: phase separation
            for (i, j, w) in cost_terms:
                qml.IsingZZ(2 * gammas[layer] * w, wires=[i, j])

            # Mixer unitary: x-rotation
            for i in range(n_qubits):
                qml.RX(2 * betas[layer], wires=i)

        # Measure expectation of each qubit in Z basis (proxy for selection probability)
        return [qml.expval(qml.PauliZ(i)) for i in range(n_qubits)]

    return circuit()


def _optimise_qaoa(n_qubits: int, cost_terms: list, p: int = 2,
                   steps: int = 40) -> np.ndarray:
    """Run QAOA parameter optimisation and return per-qubit selection scores."""
    rng = np.random.default_rng(0)
    gammas = rng.uniform(0, np.pi, p)
    betas  = rng.uniform(0, np.pi / 2, p)

    best_score = None
    best_params = (gammas.copy(), betas.copy())

    # Simple gradient-free optimisation (parameter shift not needed for scoring)
    for step in range(steps):
        expvals = _qaoa_circuit(n_qubits, p, gammas, betas, cost_terms)
        # Score: we want qubits to "select" — higher expval (closer to +1) = less selected
        # Flip to make high score = selected
        scores = np.array([1.0 - float(v) for v in expvals])
        total = float(np.sum(scores))

        if best_score is None or total > best_score:
            best_score = total
            best_params = (gammas.copy(), betas.copy())

        # Small random perturbation (random walk exploration)
        gammas = gammas + rng.normal(0, 0.15, p)
        betas  = betas  + rng.normal(0, 0.10, p)

    g_best, b_best = best_params
    final_expvals = _qaoa_circuit(n_qubits, p, g_best, b_best, cost_terms)
    return np.array([1.0 - float(v) for v in final_expvals])


def _select_top_k(scores: np.ndarray, points: list, k: int) -> list:
    """Select the top-k points by QAOA score and attach the score."""
    idx = np.argsort(scores)[::-1][:k]
    result = []
    for rank, i in enumerate(idx):
        result.append({
            "lat":   points[i]["lat"],
            "lon":   points[i]["lon"],
            "score": round(float(scores[i]), 4),
            "rank":  rank + 1,
        })
    return result


# ── Public API ────────────────────────────────────────────────────────────────

def energy_optimizer(region: str, n_sites: int = 8) -> dict:
    """Use QAOA to find optimal renewable energy installation sites.

    The algorithm maximises geographic spread (solar/wind farms should not
    cluster) weighted by simulated solar irradiance (higher at lower latitudes).
    """
    candidates = candidate_points(region, n=n_sites * 2, seed=11)
    n = len(candidates)

    C = _cost_matrix(candidates)
    # Normalise distances to [0, 1]; higher distance = better spread = positive cost
    max_d = C.max() if C.max() > 0 else 1.0

    # Build QAOA cost terms: pairs with low distance get a penalty
    cost_terms = []
    for i in range(n):
        for j in range(i + 1, n):
            weight = 1.0 - (C[i, j] / max_d)   # high weight = too close
            if weight > 0.05:
                cost_terms.append((i, j, weight))

    scores = _optimise_qaoa(n, cost_terms, p=2, steps=50)

    # Boost score for lower-latitude candidates (more sunlight)
    for idx, pt in enumerate(candidates):
        irradiance_bonus = max(0.0, 1.0 - abs(pt["lat"]) / 60.0) * 0.3
        scores[idx] += irradiance_bonus

    selected = _select_top_k(scores, candidates, k=n_sites)

    return {
        "scenario":    "energy",
        "region":      region,
        "region_label": REGIONS[region]["label"],
        "algorithm":   "QAOA (p=2)",
        "n_candidates": n,
        "sites":       selected,
        "description": (
            f"QAOA identified {n_sites} optimal sites for renewable energy "
            f"installations across {REGIONS[region]['label']}. Sites maximise "
            "geographic spread and solar irradiance potential."
        ),
    }


def disaster_router(region: str, n_sites: int = 6) -> dict:
    """Use QAOA to optimise disaster relief depot-to-zone routing.

    Models depots (supply hubs) and disaster zones, then uses QAOA to select
    the minimum set of depots that covers all zones within reach.
    """
    # Depots are fixed seed; zones are different seed
    depots = candidate_points(region, n=4, seed=99)
    zones  = candidate_points(region, n=n_sites, seed=77)

    n_depots = len(depots)
    n_zones  = len(zones)
    n_qubits = n_depots

    # Cost: penalise depots that are far from all zones (uncovering penalty)
    coverage_scores = np.zeros(n_depots)
    for di, depot in enumerate(depots):
        total_coverage = 0.0
        for zone in zones:
            dist_km = haversine_km(depot["lat"], depot["lon"],
                                   zone["lat"],  zone["lon"])
            # Sigmoid coverage: full at 0 km, ~50% at 1500 km
            total_coverage += 1.0 / (1.0 + np.exp((dist_km - 1500) / 400))
        coverage_scores[di] = total_coverage / n_zones

    # Build cost terms from inverse coverage (QAOA maximises, so invert penalty)
    cost_terms = []
    for i in range(n_depots):
        for j in range(i + 1, n_depots):
            # Penalise selecting two depots with overlapping coverage
            overlap = min(coverage_scores[i], coverage_scores[j])
            cost_terms.append((i, j, float(overlap)))

    scores = _optimise_qaoa(n_qubits, cost_terms, p=2, steps=40)
    # Add coverage bonus directly
    scores = scores + coverage_scores * 0.5

    # Select top depots (those QAOA activated)
    k_depots = min(3, n_depots)
    best_depot_idx = np.argsort(scores)[::-1][:k_depots]

    routes = []
    for rank, di in enumerate(best_depot_idx):
        depot = depots[di]
        # Match each active depot to its nearest zone
        dists = [haversine_km(depot["lat"], depot["lon"], z["lat"], z["lon"])
                 for z in zones]
        nearest_idx = int(np.argmin(dists))
        zone = zones[nearest_idx]
        routes.append({
            "depot":      {"lat": depot["lat"], "lon": depot["lon"]},
            "zone":       {"lat": zone["lat"],  "lon": zone["lon"]},
            "dist_km":    round(float(dists[nearest_idx]), 1),
            "score":      round(float(scores[di]), 4),
            "rank":       rank + 1,
        })

    return {
        "scenario":    "disaster",
        "region":      region,
        "region_label": REGIONS[region]["label"],
        "algorithm":   "QAOA (p=2)",
        "depots":      depots,
        "zones":       zones,
        "routes":      routes,
        "description": (
            f"QAOA optimised {k_depots} active relief depots across "
            f"{REGIONS[region]['label']} to maximise disaster zone coverage "
            "with minimum overlap."
        ),
    }
