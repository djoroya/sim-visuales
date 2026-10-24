// Reformador autotérmico de diésel, dinámico: el mismo modelo que python/dinamica.py.
//   estado x = [moles de CHₓ, CH₄, CO, CO₂, H₂, H₂O, O₂, N₂, Ar en el gas;  T del catalizador]
//   dnᵢ/dt = Fᵢ,entra − Kᵥ pᵢ + Σⱼ νᵢⱼ rⱼ ;  C dT/dt = Σ Fₖ (hₖ(T_entra) − hₖ(T)) − Σⱼ rⱼ ΔHⱼ − UA (T − T_amb) + Q
// El gas responde en décimas de segundo y el catalizador en una hora: el sistema es rígido, así que el
// navegador integra con Euler implícito (Newton con jacobiano numérico), estable con pasos de un segundo.
import { R, entalpia, gibbs } from "./termo.js";

export const ESPECIES = ["CHx", "CH4", "CO", "CO2", "H2", "H2O", "O2", "N2", "Ar"];
export const [CHX, CH4, CO, CO2, H2, H2O, O2, N2, AR] = ESPECIES.keys();
const BAR = 1e5, NS = 9;

// Diésel como CHₓ por átomo de C (84,4 % C y 15,6 % H en masa)
export const X_H = (0.156 / 1.008) / (0.844 / 12.011);
export const M_COMB = (12.011 + 1.008 * X_H) * 1e-3;             // kg/mol
export const PCI = 42.8e6 * M_COMB;                                // J/mol
const CP_COMB = 2.3e3 * M_COMB;
const H_F_COMB = -393.522e3 + (X_H / 2) * -241.826e3 + PCI;

export function h(esp, T) {
  if (esp === "CHx") return H_F_COMB + CP_COMB * (T - 298.15);
  if (esp === "N2" || esp === "Ar") return (esp === "N2" ? 29.1 : 20.8) * (T - 298.15);
  if (esp === "H2O" && T < 500) return entalpia("H2O", 500) - 34.0 * (500 - T);
  return entalpia(esp, T);
}

// estequiometría: filas = reacciones, columnas = ESPECIES
export const NU = [
  [-1, 0, 0, 1, 0, X_H / 2, -(1 + X_H / 4), 0, 0],   // R1 oxidación del combustible
  [-1, 0, 1, 0, 1 + X_H / 2, -1, 0, 0, 0],          // R2 reformado del combustible
  [0, -1, 1, 0, 3, -1, 0, 0, 0],                    // R3 reformado del metano (reversible)
  [0, 0, -1, 1, 1, -1, 0, 0, 0],                    // R4 desplazamiento del agua (reversible)
  [0, 0, 0, 0, -1, 1, -0.5, 0, 0],                  // R5 oxidación del H₂
];
const T_REF = 1023.15;

export function keq(T) {
  T = Math.max(T, 500);
  const g = Object.fromEntries(["CH4", "H2O", "CO", "H2", "CO2"].map((e) => [e, gibbs(e, T)]));
  const dg3 = g.CO + 3 * g.H2 - g.CH4 - g.H2O, dg4 = g.CO2 + g.H2 - g.CO - g.H2O;
  return [Math.exp(-dg3 / (R * T)), Math.exp(-dg4 / (R * T))];
}

export const REFORMADOR = {
  V: 0.5e-3, C: 3000, UA: 0.2, T_amb: 298.15, Kv: 0.03,
  k_ref: [500, 20, 2, 20, 500], E: [60e3, 110e3, 240.1e3, 67.1e3, 60e3],
};

/** Caudales de entrada (mol/s) por especie. e = { combustible, vapor, aire (mol/s), T_entra, Q }. */
export function caudales(e) {
  const F = new Array(NS).fill(0);
  F[CHX] = e.combustible; F[H2O] = e.vapor;
  F[O2] = 0.2095 * e.aire; F[N2] = 0.7808 * e.aire; F[AR] = 0.0093 * e.aire;
  return F;
}

export const presiones = (ref, x) => x.slice(0, NS).map((n) => (Math.max(n, 0) * R * x[NS]) / ref.V / BAR);

export function velocidades(ref, x) {
  const T = x[NS], p = presiones(ref, x), [K3, K4] = keq(T);
  const k = ref.k_ref.map((kr, j) => kr * Math.exp((-ref.E[j] / R) * (1 / T - 1 / T_REF)));
  return [
    k[0] * p[CHX] * p[O2],
    k[1] * p[CHX] * p[H2O],
    k[2] * (p[CH4] * p[H2O] - (p[CO] * p[H2] ** 3) / K3),
    k[3] * (p[CO] * p[H2O] - (p[CO2] * p[H2]) / K4),
    k[4] * p[H2] * p[O2],
  ];
}

/** Calor de cada reacción a la temperatura T (W): positivo si calienta. */
export function calores(ref, x) {
  const T = x[NS], r = velocidades(ref, x), hT = ESPECIES.map((s) => h(s, T));
  return r.map((rj, j) => -rj * NU[j].reduce((a, nu, i) => a + nu * hT[i], 0));
}

export function derivadas(ref, x, e) {
  const T = x[NS], F = caudales(e), p = presiones(ref, x), r = velocidades(ref, x);
  const dx = new Array(NS + 1);
  for (let i = 0; i < NS; i++) {
    let s = F[i] - ref.Kv * p[i];
    for (let j = 0; j < 5; j++) s += NU[j][i] * r[j];
    dx[i] = s;
  }
  let q = -ref.UA * (T - ref.T_amb) + (e.Q || 0);
  for (let i = 0; i < NS; i++) q += F[i] * (h(ESPECIES[i], e.T_entra) - h(ESPECIES[i], T));
  for (let j = 0; j < 5; j++) q -= r[j] * NU[j].reduce((a, nu, i) => a + nu * h(ESPECIES[i], T), 0);
  dx[NS] = q / ref.C;
  return dx;
}

/** Caudales de salida (mol/s) y fracciones molares. */
export function salida(ref, x) {
  const F = presiones(ref, x).map((p) => ref.Kv * p), tot = F.reduce((a, b) => a + b, 0);
  return { F, y: F.map((f) => f / tot) };
}

export function estadoInicial(ref, T0 = 673.15) {
  const x = new Array(NS + 1).fill(0);
  x[N2] = (BAR * ref.V) / (R * T0); x[NS] = T0;
  return x;
}

function resuelve(A, b) {   // Gauss con pivoteo parcial; A y b se modifican
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(A[f][c]) > Math.abs(A[p][c])) p = f;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let f = c + 1; f < n; f++) {
      const m = A[f][c] / A[c][c];
      for (let k = c; k < n; k++) A[f][k] -= m * A[c][k];
      b[f] -= m * b[c];
    }
  }
  const x = new Array(n);
  for (let f = n - 1; f >= 0; f--) {
    let s = b[f];
    for (let k = f + 1; k < n; k++) s -= A[f][k] * x[k];
    x[f] = s / A[f][f];
  }
  return x;
}

/** Un paso de Euler implícito: x₁ = x₀ + h f(x₁). Newton con jacobiano por diferencias y búsqueda lineal;
 *  si no converge, parte el paso en dos. */
export function paso(ref, x0, hh, e, profundidad = 0) {
  const n = NS + 1, peso = (x) => x.map((v, i) => 1 / ((i === NS ? 1e-3 : 1e-10) + 1e-6 * Math.abs(v)));
  const G = (x) => { const f = derivadas(ref, x, e); return x.map((v, i) => v - x0[i] - hh * f[i]); };
  const norma = (g, w) => Math.sqrt(g.reduce((a, v, i) => a + (v * w[i]) ** 2, 0) / n);
  let x = x0.slice(), g = G(x);
  for (let it = 0; it < 30; it++) {
    const w = peso(x), ng = norma(g, w);
    if (ng < 1e-3) return x;
    const J = [];
    for (let c = 0; c < n; c++) {
      const d = c === NS ? 1e-4 : 1e-9 + 1e-7 * Math.abs(x[c]), xp = x.slice();
      xp[c] += d;
      const gp = G(xp);
      for (let f = 0; f < n; f++) (J[f] ||= [])[c] = (gp[f] - g[f]) / d;
    }
    const dx = resuelve(J, g.map((v) => -v));
    let a = 1, xn, gn;
    for (let ls = 0; ls < 12; ls++, a /= 2) {
      xn = x.map((v, i) => v + a * dx[i]);
      for (let i = 0; i < NS; i++) if (xn[i] < 0) xn[i] = 0;
      gn = G(xn);
      if (norma(gn, w) < ng) break;
    }
    x = xn; g = gn;
  }
  if (profundidad > 12) throw new Error("el integrador no converge");
  const medio = paso(ref, x0, hh / 2, e, profundidad + 1);
  return paso(ref, medio, hh / 2, e, profundidad + 1);
}

/** Avanza dt segundos con entradas constantes, en pasos de como mucho hmax. */
export function avanza(ref, x, dt, e, hmax = 1) {
  if (!(dt > 0)) return x;
  const pasos = Math.max(1, Math.ceil(dt / hmax));
  for (let k = 0; k < pasos; k++) x = paso(ref, x, dt / pasos, e);
  return x;
}
