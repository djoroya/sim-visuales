// Integrador para sistemas rígidos: Rosenbrock de segundo orden (ROS2, L-estable, γ = 1 + 1/√2;
// Verwer, Spee, Blom y Hundsdorfer, 1999), con jacobiano por diferencias finitas en cada paso.
// Las tasas de crecimiento relativo del cultivo se relajan en ~1 s y el resto del invernadero
// en minutos u horas: un método explícito necesitaría pasos de un segundo; este va a 60 s.

const GAMMA = 1 + 1 / Math.SQRT2;

function resuelve(A, b, n) {                       // Gauss con pivoteo parcial (A se modifica)
  const x = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i * n + c]) > Math.abs(A[p * n + c])) p = i;
    if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = x[c]; x[c] = x[p]; x[p] = t; }
    const d = A[c * n + c];
    for (let i = c + 1; i < n; i++) { const f = A[i * n + c] / d; if (f === 0) continue; for (let k = c; k < n; k++) A[i * n + k] -= f * A[c * n + k]; x[i] -= f * x[c]; }
  }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let k = i + 1; k < n; k++) s -= A[i * n + k] * x[k]; x[i] = s / A[i * n + i]; }
  return x;
}

/** Un paso ROS2 de tamaño h desde (t, y) para y' = f(t, y). */
export function pasoROS2(f, t, y, h) {
  const n = y.length, f0 = f(t, y), Jm = new Float64Array(n * n), yp = Float64Array.from(y);
  for (let j = 0; j < n; j++) {
    const e = 1e-7 * Math.max(Math.abs(y[j]), 1e-6); yp[j] = y[j] + e;
    const fj = f(t, yp); yp[j] = y[j];
    for (let i = 0; i < n; i++) Jm[i * n + j] = (fj[i] - f0[i]) / e;
  }
  // M = I - γ h J (se factoriza dos veces: es pequeña)
  const M = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) M[i] = -GAMMA * h * Jm[i];
  for (let i = 0; i < n; i++) M[i * n + i] += 1;
  const k1 = resuelve(Float64Array.from(M), f0, n);
  const y1 = new Float64Array(n); for (let i = 0; i < n; i++) y1[i] = y[i] + h * k1[i];
  const f1 = f(t + h, y1), r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = f1[i] - 2 * k1[i];
  const k2 = resuelve(M, r, n);
  const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = y[i] + h * (1.5 * k1[i] + 0.5 * k2[i]);
  return out;
}
