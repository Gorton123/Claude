/* QuantumEarth AI — Quantum algorithms (QAOA + VQC) running in the browser.
 *
 * Depends on: quantum_sim.js (QState class)
 *
 * Three scenarios:
 *   energyOptimizer(region, nSites)  → QAOA facility-location
 *   disasterRouter(region, nSites)   → QAOA max-coverage routing
 *   climateScan(region, resolution)  → VQC anomaly classification
 */

/* ── Seeded pseudo-random number generator (mulberry32) ────────────────────── */
function _rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Region bounding boxes ─────────────────────────────────────────────────── */
const QA_REGIONS = {
  africa:   { lat: [-35,  37], lon: [-18,   52], label: 'Africa'   },
  europe:   { lat: [ 35,  72], lon: [-12,   42], label: 'Europe'   },
  asia:     { lat: [  5,  55], lon: [ 60,  145], label: 'Asia'     },
  americas: { lat: [-55,  70], lon: [-170, -30], label: 'Americas' },
  global:   { lat: [-70,  80], lon: [-180,  180],label: 'Global'   },
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function _candidatePoints(regionKey, n, seed) {
  const rng = _rng(seed);
  const r   = QA_REGIONS[regionKey];
  const [latMin, latMax] = r.lat;
  const [lonMin, lonMax] = r.lon;
  return Array.from({ length: n }, () => ({
    lat: +( latMin + rng() * (latMax - latMin) ).toFixed(3),
    lon: +( lonMin + rng() * (lonMax - lonMin) ).toFixed(3),
  }));
}

function _haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function _clip(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _norm(v, lo, hi) { return hi === lo ? 0.5 : _clip((v - lo) / (hi - lo), 0, 1); }

/* ── QAOA core ─────────────────────────────────────────────────────────────── */
/*
 * Runs p-layer QAOA on `nQubits` qubits with the given cost terms.
 * costTerms: [[i, j, weight], ...]  — pairwise ZZ interactions.
 * Returns an array of per-qubit "selection scores" in [0, 2].
 */
function _runQAOA(nQubits, costTerms, p, steps, seed) {
  const rng = _rng(seed);

  // Initialise parameters randomly
  let gammas = Array.from({ length: p }, () => rng() * Math.PI);
  let betas  = Array.from({ length: p }, () => rng() * Math.PI / 2);

  function evalParams(g, b) {
    const state = new QState(nQubits);
    for (let i = 0; i < nQubits; i++) state.hadamard(i);      // |+⟩^n

    for (let layer = 0; layer < p; layer++) {
      // Cost unitary (phase separation)
      for (const [i, j, w] of costTerms)
        state.izzg(2 * g[layer] * w, i, j);
      // Mixer unitary (X rotations)
      for (let i = 0; i < nQubits; i++)
        state.rx(2 * b[layer], i);
    }

    // Flip sign: expvalZ = +1 → unselected; −1 → selected → score = 1 − expvalZ
    return Array.from({ length: nQubits }, (_, i) => 1.0 - state.expvalZ(i));
  }

  let bestScores = evalParams(gammas, betas);
  let bestTotal  = bestScores.reduce((a, b) => a + b, 0);

  // Parameter-shift-free random-walk optimisation (light, works well for demos)
  for (let step = 0; step < steps; step++) {
    const r2 = _rng(seed + step + 1);
    const ng  = gammas.map(v => v + (r2() - 0.5) * 0.32);
    const nb  = betas.map(v  => v + (r2() - 0.5) * 0.22);
    const s   = evalParams(ng, nb);
    const tot = s.reduce((a, b) => a + b, 0);
    if (tot > bestTotal) { bestTotal = tot; bestScores = s; gammas = ng; betas = nb; }
  }

  return evalParams(gammas, betas);
}

/* ── Scenario 1: Renewable Energy Optimiser (QAOA) ────────────────────────── */
function energyOptimizer(regionKey, nSites = 8) {
  const candidates = _candidatePoints(regionKey, nSites, 11);  // keep n == nSites (≤8 qubits)
  const n          = candidates.length;

  // Distance matrix
  const D = candidates.map((a, i) =>
    candidates.map((b, j) => i === j ? 0 : _haversine(a.lat, a.lon, b.lat, b.lon)));
  const maxD = Math.max(...D.flat()) || 1;

  // Cost terms: high weight for close pairs (penalise clustering)
  const costTerms = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const w = 1.0 - D[i][j] / maxD;
      if (w > 0.05) costTerms.push([i, j, w]);
    }

  const scores = _runQAOA(n, costTerms, 2, 50, 0);

  // Boost lower-latitude sites (more solar irradiance)
  const boosted = scores.map((s, i) =>
    s + Math.max(0, 1 - Math.abs(candidates[i].lat) / 60) * 0.3);

  // Select top k
  const ranked = candidates
    .map((pt, i) => ({ ...pt, score: +boosted[i].toFixed(4), rank: 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, nSites);
  ranked.forEach((r, i) => (r.rank = i + 1));

  const region = QA_REGIONS[regionKey];
  return {
    scenario:    'energy',
    region:      regionKey,
    region_label: region.label,
    algorithm:   'QAOA (p=2, browser)',
    n_candidates: n,
    sites:       ranked,
    description: `QAOA identified ${nSites} optimal sites for renewable energy installations across ${region.label}. Sites maximise geographic spread and solar irradiance potential.`,
  };
}

/* ── Scenario 2: Disaster Relief Router (QAOA) ─────────────────────────────── */
function disasterRouter(regionKey, nSites = 6) {
  const depots = _candidatePoints(regionKey, 4, 99);
  const zones  = _candidatePoints(regionKey, nSites, 77);
  const nd     = depots.length;

  // Coverage score per depot (sigmoid decay with distance)
  const covScores = depots.map(d =>
    zones.reduce((sum, z) => {
      const dist = _haversine(d.lat, d.lon, z.lat, z.lon);
      return sum + 1 / (1 + Math.exp((dist - 1500) / 400));
    }, 0) / zones.length
  );

  // Cost terms: penalise selecting two overlapping depots
  const costTerms = [];
  for (let i = 0; i < nd; i++)
    for (let j = i + 1; j < nd; j++)
      costTerms.push([i, j, Math.min(covScores[i], covScores[j])]);

  const scores = _runQAOA(nd, costTerms, 2, 40, 0)
    .map((s, i) => s + covScores[i] * 0.5);

  const kDepots = Math.min(3, nd);
  const topIdx  = [...scores.keys()].sort((a, b) => scores[b] - scores[a]).slice(0, kDepots);

  const routes = topIdx.map((di, rank) => {
    const depot = depots[di];
    const dists = zones.map(z => _haversine(depot.lat, depot.lon, z.lat, z.lon));
    const ni    = dists.indexOf(Math.min(...dists));
    return {
      depot,
      zone:    zones[ni],
      dist_km: +dists[ni].toFixed(1),
      score:   +scores[di].toFixed(4),
      rank:    rank + 1,
    };
  });

  const region = QA_REGIONS[regionKey];
  return {
    scenario:    'disaster',
    region:      regionKey,
    region_label: region.label,
    algorithm:   'QAOA (p=2, browser)',
    depots,
    zones,
    routes,
    description: `QAOA optimised ${kDepots} active relief depots across ${region.label} to maximise disaster zone coverage with minimum overlap.`,
  };
}

/* ── Scenario 3: Climate Anomaly Scan (VQC) ───────────────────────────────── */
function _climateGrid(regionKey, resolution) {
  const r   = QA_REGIONS[regionKey];
  const rng = _rng(7);
  const [latMin, latMax] = r.lat;
  const [lonMin, lonMax] = r.lon;
  const cells = [];
  for (let i = 0; i < resolution; i++) {
    const lat = latMin + (i / (resolution - 1)) * (latMax - latMin);
    for (let j = 0; j < resolution; j++) {
      const lon     = lonMin + (j / (resolution - 1)) * (lonMax - lonMin);
      const base    = Math.sin(lat * Math.PI / 180) * 2 + Math.cos(lon * Math.PI / 360);
      const anomaly = +( base + (rng() - 0.5) * 2.4 ).toFixed(3);
      cells.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3), anomaly });
    }
  }
  return cells;
}

/* Pre-trained VQC weights (deterministic; tuned to separate high/low anomaly) */
const VQC_WEIGHTS = [
  [[-0.42, 0.31], [ 0.23,-0.51], [-0.34, 0.14], [ 0.41,-0.22]],
  [[ 0.29,-0.18], [-0.43, 0.35], [ 0.12,-0.44], [ 0.25, 0.33]],
  [[-0.21, 0.38], [ 0.32,-0.09], [-0.19, 0.28], [ 0.13,-0.31]],
];

function _vqcClassify(anomaly, lat, lon) {
  const state = new QState(4);

  // Angle encoding: map features to rotation angles
  state.ry(_norm(anomaly, -5, 5) * Math.PI, 0);
  state.ry(_norm(lat,    -90, 90) * Math.PI, 1);
  state.ry(_norm(lon,  -180, 180) * Math.PI, 2);
  state.hadamard(3);

  // Variational layers: entangle → rotate
  for (let l = 0; l < VQC_WEIGHTS.length; l++) {
    for (let i = 0; i < 4; i++) state.cnot(i, (i + 1) % 4);
    for (let i = 0; i < 4; i++) {
      state.rx(VQC_WEIGHTS[l][i][0], i);
      state.rz(VQC_WEIGHTS[l][i][1], i);
    }
  }

  return state.expvalZ(0);  // classifier output
}

function climateScan(regionKey, resolution = 8) {
  const cells      = _climateGrid(regionKey, resolution);
  const classified = cells.map(cell => {
    const score = _vqcClassify(cell.anomaly, cell.lat, cell.lon);
    const absA  = Math.abs(cell.anomaly);
    let label;
    if      (score < -0.2 || absA > 2.5) label = 'critical';
    else if (score <  0.1 || absA > 1.2) label = 'warning';
    else                                  label = 'normal';
    return {
      ...cell,
      label,
      severity:  +_clip(absA / 4, 0, 1).toFixed(3),
      vqc_score: +score.toFixed(4),
    };
  });

  const counts = { normal: 0, warning: 0, critical: 0 };
  classified.forEach(c => counts[c.label]++);
  const pct = +( (counts.warning + counts.critical) / classified.length * 100 ).toFixed(1);

  const region = QA_REGIONS[regionKey];
  return {
    scenario:      'climate',
    region:        regionKey,
    region_label:  region.label,
    algorithm:     'VQC (4 qubits, 3 layers, browser)',
    total_cells:   classified.length,
    counts,
    pct_anomalous: pct,
    cells:         classified,
    description:   `Variational Quantum Classifier scanned ${classified.length} grid cells across ${region.label}. ${pct}% of cells show anomalous temperature patterns.`,
  };
}
