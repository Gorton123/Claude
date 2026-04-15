/* QuantumEarth AI — Browser-native state-vector quantum simulator
 *
 * Simulates quantum circuits locally in the browser.
 * No backend, no installation, no API keys required.
 *
 * Uses a full state-vector representation:
 *   n qubits → 2^n complex amplitudes stored as two Float64Arrays (re, im).
 * All standard gates are implemented as in-place O(dim) operations.
 */

class QState {
  constructor(nQubits) {
    this.n   = nQubits;
    this.dim = 1 << nQubits;   // 2^n
    this.re  = new Float64Array(this.dim);
    this.im  = new Float64Array(this.dim);
    this.re[0] = 1.0;          // initialise to |00…0⟩
  }

  /* ── Core: apply a 2×2 unitary to one qubit ── */
  _u2(k, a0r,a0i, a1r,a1i, b0r,b0i, b1r,b1i) {
    const stride = 1 << k;
    for (let i = 0; i < this.dim; i++) {
      if (i & stride) continue;          // process (i, i|stride) pairs
      const j  = i | stride;
      const ar = this.re[i], ai = this.im[i];
      const br = this.re[j], bi = this.im[j];
      this.re[i] = a0r*ar - a0i*ai + a1r*br - a1i*bi;
      this.im[i] = a0r*ai + a0i*ar + a1r*bi + a1i*br;
      this.re[j] = b0r*ar - b0i*ai + b1r*br - b1i*bi;
      this.im[j] = b0r*ai + b0i*ar + b1r*bi + b1i*br;
    }
  }

  /* ── Single-qubit gates ── */
  hadamard(k) {
    const s = Math.SQRT1_2;
    this._u2(k,  s,0, s,0,  s,0, -s,0);
  }

  rx(theta, k) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    this._u2(k,  c,0, 0,-s,  0,-s, c,0);
  }

  ry(theta, k) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    this._u2(k,  c,0, -s,0,  s,0, c,0);
  }

  rz(theta, k) {
    const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
    this._u2(k,  c,-s, 0,0,  0,0, c,s);
  }

  /* ── Two-qubit gates ── */
  cnot(ctrl, tgt) {
    const cs = 1 << ctrl, ts = 1 << tgt;
    for (let i = 0; i < this.dim; i++) {
      if (!(i & cs) || (i & ts)) continue;  // ctrl=1, tgt=0 → swap pair
      const j = i | ts;
      let t;
      t = this.re[i]; this.re[i] = this.re[j]; this.re[j] = t;
      t = this.im[i]; this.im[i] = this.im[j]; this.im[j] = t;
    }
  }

  /* IsingZZ(γ): e^{−iγ Z⊗Z} — phase gate used in QAOA cost unitary */
  izzg(gamma, q0, q1) {
    const s0 = 1 << q0, s1 = 1 << q1;
    for (let i = 0; i < this.dim; i++) {
      const z0 = (i & s0) ? 1 : -1;
      const z1 = (i & s1) ? 1 : -1;
      const ph = z0 * z1 * gamma;
      const c  = Math.cos(ph), s = Math.sin(ph);
      const re = this.re[i], im = this.im[i];
      this.re[i] = re * c - im * s;
      this.im[i] = re * s + im * c;
    }
  }

  /* ── Measurement ── */
  /* ⟨Z_k⟩ = Σ_i |amp_i|² · (bit_k(i) == 1 ? −1 : +1) */
  expvalZ(k) {
    const stride = 1 << k;
    let val = 0;
    for (let i = 0; i < this.dim; i++) {
      const p = this.re[i] * this.re[i] + this.im[i] * this.im[i];
      val += p * ((i & stride) ? -1 : 1);
    }
    return val;
  }
}
