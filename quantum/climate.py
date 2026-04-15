"""QuantumEarth AI — Variational Quantum Classifier (VQC) for climate anomalies.

A Variational Quantum Circuit encodes climate anomaly data as rotation angles
on qubits and learns to classify each grid cell as:
  - "normal"   : within expected temperature range
  - "warning"  : elevated anomaly (1–2 sigma)
  - "critical" : extreme anomaly (>2 sigma)

The VQC runs entirely on PennyLane's default.qubit local simulator.
No internet, no API key, no cost.
"""

import numpy as np
import pennylane as qml
from quantum.utils import climate_grid, normalise, REGIONS

# ── VQC architecture ──────────────────────────────────────────────────────────

N_QUBITS  = 4    # 4-qubit circuit — efficient on CPU simulator
N_LAYERS  = 3    # variational depth


def _build_device():
    return qml.device("default.qubit", wires=N_QUBITS)


def _encode_features(anomaly: float, lat: float, lon: float):
    """Angle-encode three features onto the first three qubits."""
    # Normalise anomaly to [0, π]
    enc_anomaly = normalise(anomaly, -5.0, 5.0) * np.pi
    enc_lat     = normalise(lat,    -90.0, 90.0) * np.pi
    enc_lon     = normalise(lon,   -180.0, 180.0) * np.pi

    qml.RY(enc_anomaly, wires=0)
    qml.RY(enc_lat,     wires=1)
    qml.RY(enc_lon,     wires=2)
    qml.Hadamard(wires=3)


def _variational_layer(weights: np.ndarray, layer: int):
    """One variational layer: entangling CNOT ring + parameterised rotations."""
    # Entanglement ring
    for i in range(N_QUBITS):
        qml.CNOT(wires=[i, (i + 1) % N_QUBITS])

    # Parameterised rotations
    for i in range(N_QUBITS):
        qml.RX(weights[layer, i, 0], wires=i)
        qml.RZ(weights[layer, i, 1], wires=i)


def _vqc_score(anomaly: float, lat: float, lon: float,
               weights: np.ndarray, dev) -> float:
    """Run the VQC and return the Z-expectation of qubit 0 as a classification score."""

    @qml.qnode(dev)
    def circuit():
        _encode_features(anomaly, lat, lon)
        for layer in range(N_LAYERS):
            _variational_layer(weights, layer)
        return qml.expval(qml.PauliZ(0))

    return float(circuit())


def _train_weights(cells: list, seed: int = 42) -> np.ndarray:
    """Quick variational parameter initialisation tuned to the cell distribution."""
    rng = np.random.default_rng(seed)
    # Initialise near-zero with small noise (breaks symmetry)
    weights = rng.uniform(-0.3, 0.3, (N_LAYERS, N_QUBITS, 2))

    # We don't do full gradient descent (would be slow on CPU for demo purposes).
    # Instead, we do a lightweight random search to tune the sign of anomaly detection.
    # Real deployment would use qml.GradientDescentOptimizer here.
    dev = _build_device()
    best_score = -np.inf
    best_w = weights.copy()

    for _ in range(20):
        # Score = ability to separate high-anomaly from low-anomaly cells
        high = [c for c in cells if abs(c["anomaly"]) > 1.5]
        low  = [c for c in cells if abs(c["anomaly"]) <= 1.5]
        if not high or not low:
            break

        s_high = np.mean([_vqc_score(c["anomaly"], c["lat"], c["lon"], weights, dev)
                          for c in high[:4]])
        s_low  = np.mean([_vqc_score(c["anomaly"], c["lat"], c["lon"], weights, dev)
                          for c in low[:4]])

        # We want high anomaly → negative Z (qubit activated)
        separation = s_low - s_high
        if separation > best_score:
            best_score = separation
            best_w = weights.copy()

        weights = best_w + rng.normal(0, 0.12, weights.shape)

    return best_w


def _classify(vqc_score: float, anomaly: float) -> str:
    """Map VQC output + raw anomaly into human-readable class."""
    abs_a = abs(anomaly)
    # VQC score < -0.2 signals quantum circuit detected anomaly pattern
    if vqc_score < -0.2 or abs_a > 2.5:
        return "critical"
    if vqc_score < 0.1 or abs_a > 1.2:
        return "warning"
    return "normal"


# ── Public API ────────────────────────────────────────────────────────────────

def climate_anomaly_scan(region: str, resolution: int = 8) -> dict:
    """Scan a region for climate anomalies using a Variational Quantum Classifier.

    Returns a grid of cells each labelled normal / warning / critical,
    plus a summary count and the quantum circuit's overall confidence.
    """
    cells = climate_grid(region, resolution=resolution)

    # Train VQC weights on this region's data distribution
    weights = _train_weights(cells)
    dev = _build_device()

    classified = []
    anomaly_vals = [c["anomaly"] for c in cells]
    for cell in cells:
        score = _vqc_score(cell["anomaly"], cell["lat"], cell["lon"], weights, dev)
        label = _classify(score, cell["anomaly"])
        # Severity in [0, 1] for frontend colour mapping
        severity = float(np.clip(abs(cell["anomaly"]) / 4.0, 0.0, 1.0))
        classified.append({
            "lat":      cell["lat"],
            "lon":      cell["lon"],
            "anomaly":  cell["anomaly"],
            "label":    label,
            "severity": round(severity, 3),
            "vqc_score": round(score, 4),
        })

    counts = {
        "normal":   sum(1 for c in classified if c["label"] == "normal"),
        "warning":  sum(1 for c in classified if c["label"] == "warning"),
        "critical": sum(1 for c in classified if c["label"] == "critical"),
    }
    total = len(classified)
    pct_anomalous = round((counts["warning"] + counts["critical"]) / total * 100, 1)

    return {
        "scenario":        "climate",
        "region":          region,
        "region_label":    REGIONS[region]["label"],
        "algorithm":       f"VQC ({N_QUBITS} qubits, {N_LAYERS} layers)",
        "total_cells":     total,
        "counts":          counts,
        "pct_anomalous":   pct_anomalous,
        "cells":           classified,
        "description": (
            f"Variational Quantum Classifier scanned {total} grid cells across "
            f"{REGIONS[region]['label']}. {pct_anomalous}% of cells show anomalous "
            "temperature patterns. Critical zones require immediate attention."
        ),
    }
