// Pila SOFC dinámica con combustible mixto (igual que python/dinamica.py, traslación de SOFC_meca de AGRO-SOFC).
// Estado: moles de las 7 especies en ánodo y cátodo (14 valores). Caudales en mol/s, presiones en Pa.
import { R, F, entalpia, gibbs } from "./termo.js";
export const ESPECIES = ["H2", "O2", "H2O", "N2", "CO", "CH4", "CO2"];
export const H2 = 0, O2 = 1, H2O = 2, N2 = 3, CO = 4, CH4 = 5, CO2 = 6, ATM = 101325;
const M = [2.016, 31.998, 18.015, 28.014, 28.01, 16.043, 44.009].map((m) => m * 1e-3);

/** Constantes de válvula por especie en mol/(Pa·s) desde K en kmol/(atm·s) (referida al H₂ si «igual»). */
export function kv(pila, K) {
  const ksi = (K * 1e3) / ATM;
  return M.map((m) => (pila.valvula === "raiz_masa" ? ksi / Math.sqrt(m) : ksi / Math.sqrt(M[H2])));
}
export function reparto(qa) {
  const s = qa.reduce((a, b) => a + b, 0), la = qa.map((q) => q / s);
  const a = { H2: la[H2], CO: la[CO], CH4: la[CH4], O2: 0.5 * (la[H2] + la[CO] + 4 * la[CH4]) };
  const b = { H2O: la[H2] + 2 * la[CH4], CO2: la[CO] + la[CH4] };
  return { la, a, b, ne: 2 * (la[H2] + la[CO] + 4 * la[CH4]) };
}
/** mol/s generados (+) o consumidos (−) por toda la pila en ánodo y cátodo. */
export function velocidades(I, qa, N0) {
  const { a, b, ne } = reparto(qa), ra = new Float64Array(7), rc = new Float64Array(7);
  if (ne > 0 && I !== 0) {
    const k = (N0 * I) / (F * ne);
    ra[H2] = -a.H2 * k; ra[CO] = -a.CO * k; ra[CH4] = -a.CH4 * k; ra[H2O] = b.H2O * k; ra[CO2] = b.CO2 * k;
    rc[O2] = -(N0 * I) / (4 * F);
  }
  return [ra, rc];
}
// Termodinámica de la mezcla: depende solo de T y de la composición de entrada; se guarda.
const cache = new Map();
function termoMezcla(T, qa) {
  const clave = T + "|" + qa.join(",");
  let v = cache.get(clave);
  if (!v) {
    const { a, b, ne } = reparto(qa);
    const suma = (f) => a.H2 * f("H2", T) + a.CO * f("CO", T) + a.CH4 * f("CH4", T) + a.O2 * f("O2", T) - b.H2O * f("H2O", T) - b.CO2 * f("CO2", T);
    v = { a, b, ne, E0: suma(gibbs) / (F * ne), ET: suma(entalpia) / (F * ne) };
    if (cache.size > 200) cache.clear();
    cache.set(clave, v);
  }
  return v;
}
/** Nernst de la mezcla por celda: E, E₀ y la tensión termoneutra E_T. */
export function nernst(T, qa, pa, pc) {
  const { a, b, ne, E0, ET } = termoMezcla(T, qa);
  let s = 0;
  for (const [c, p] of [[a.H2, pa[H2]], [a.CO, pa[CO]], [a.CH4, pa[CH4]], [a.O2, pc[O2]], [-b.H2O, pa[H2O]], [-b.CO2, pa[CO2]]])
    if (c !== 0 && p > 0) s += c * Math.log(p / ATM);
  return { E: E0 + ((R * T) / (ne * F)) * s, E0, ET };
}
/** Tensión de la pila y desglose por celda (modo «original» o «calibrado»). */
export function tension(pila, I, qa, pa, pc) {
  const { E, E0, ET } = nernst(pila.T, qa, pa, pc);
  if (pila.modo === "original") {
    const V = pila.N0 * E - pila.r * I;
    return { V, Vcelda: V / pila.N0, E, E0, ET, etaOhm: (pila.r * I) / pila.N0, etaAct: 0, etaConc: 0 };
  }
  const c = pila.celda, T = pila.T, j = I / pila.area;
  const arr = (ref, e, s) => ref * Math.exp((s * e) / R * (1 / T - 1 / 1023.15));
  const etaOhm = j * arr(c.R_ohm * c.area, c.E_ohm, +1);
  const etaAct = ((R * T) / F) * Math.asinh(j / (2 * arr(c.j0, c.E_act, -1)));
  const ptot = pa.reduce((x, y) => x + y, 0);
  const xf = (pa[H2] + pa[CO] + 4 * pa[CH4]) / ptot, xp = (pa[H2O] + pa[CO2]) / ptot, d = j / c.jL;
  const etaConc = xf > d && xp > 0 ? ((R * T) / (2 * F)) * Math.log(((xf / (xf - d)) * (xp + d)) / xp) : Infinity;
  const Vc = E - etaOhm - etaAct - etaConc;
  return { V: pila.N0 * Vc, Vcelda: Vc, E, E0, ET, etaOhm, etaAct, etaConc };
}
/** Presiones parciales (Pa) de ánodo y cátodo a partir del estado. */
export function presiones(pila, y) {
  const RT = R * pila.T;
  return [Array.from(y.subarray(0, 7), (n) => (n * RT) / pila.Va), Array.from(y.subarray(7), (n) => (n * RT) / pila.Vc)];
}
/** Derivadas del estado; entradas: I (A), qa y qc (mol/s por especie). */
export function derivadas(pila, y, I, qa, qc, kva, kvc) {
  const [pa, pc] = presiones(pila, y), [ra, rc] = velocidades(I, qa, pila.N0), d = new Float64Array(14);
  for (let i = 0; i < 7; i++) {
    d[i] = qa[i] - kva[i] * pa[i] + ra[i];
    d[7 + i] = qc[i] - kvc[i] * pc[i] + rc[i];
  }
  return d;
}
/** Estado de régimen sin corriente. */
export function estadoInicial(pila, qa, qc) {
  const RT = R * pila.T, kva = kv(pila, pila.K_an), kvc = kv(pila, pila.K_cat), y = new Float64Array(14);
  for (let i = 0; i < 7; i++) { y[i] = ((qa[i] / kva[i]) * pila.Va) / RT; y[7 + i] = ((qc[i] / kvc[i]) * pila.Vc) / RT; }
  return y;
}
/** Un paso de Runge–Kutta clásico de orden 4 con entradas constantes durante el paso. */
export function pasoRK4(pila, y, h, I, qa, qc) {
  const kva = kv(pila, pila.K_an), kvc = kv(pila, pila.K_cat), f = (z) => derivadas(pila, z, I, qa, qc, kva, kvc);
  const ax = (z, k, s) => { const o = new Float64Array(14); for (let i = 0; i < 14; i++) o[i] = z[i] + s * k[i]; return o; };
  const k1 = f(y), k2 = f(ax(y, k1, h / 2)), k3 = f(ax(y, k2, h / 2)), k4 = f(ax(y, k3, h));
  const o = new Float64Array(14);
  for (let i = 0; i < 14; i++) o[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return o;
}

/** Presiones parciales (Pa) en régimen permanente: p = (entrada + reacción) / K_v, especie a especie. */
export function regimen(pila, I, qa, qc) {
  const kva = kv(pila, pila.K_an), kvc = kv(pila, pila.K_cat), [ra, rc] = velocidades(I, qa, pila.N0);
  const pa = qa.map((q, i) => (q + ra[i]) / kva[i]), pc = qc.map((q, i) => (q + rc[i]) / kvc[i]);
  return pa.some((p) => p < 0) || pc.some((p) => p < 0) ? null : [pa, pc];
}
/** Poder calorífico inferior (J/mol) de los combustibles, a 25 °C. */
export const PCI = { H2: 241.8e3, CO: 283.0e3, CH4: 802.3e3 };
/** Potencia química del combustible que entra (W), con el poder calorífico inferior. */
export const potenciaCombustible = (qa) => qa[H2] * PCI.H2 + qa[CO] * PCI.CO + qa[CH4] * PCI.CH4;
