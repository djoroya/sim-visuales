// Estado y avance de la pila del visor (sin React). La pila es la de datos/pila-visor.json.
import diseno from "../../datos/pila-visor.json";
import { estadoInicial, pasoRK4, presiones, tension, regimen, potenciaCombustible, reparto, ATM, H2, O2, H2O, N2, CO, CH4, CO2 } from "./modelo/pila.js";
import { R } from "./modelo/termo.js";

export const PILA = {
  N0: diseno.N0, area: diseno.area_cm2, T: diseno.T_K, Va: diseno.Va_m3, Vc: diseno.Vc_m3, valvula: diseno.valvula,
  K_an: diseno.K_an, K_cat: diseno.K_cat, modo: "calibrado", celda: diseno.celda,
};
const ORDEN = ["H2", "O2", "H2O", "N2", "CO", "CH4", "CO2"];
const vector = (o) => ORDEN.map((e) => o[e] || 0);

/** Combustibles, en fracción molar. El caudal nominal es el que da un 70 % de utilización a 40 A. */
export const COMBUSTIBLES = {
  biogas: { nombre: "Biogás reformado", fraccion: vector(diseno.fraccion_combustible),
    nota: "Biogás tras un reformador con vapor: 45 % H₂, 10 % CO, 5 % CH₄, 20 % CO₂, 20 % H₂O." },
  sintesis: { nombre: "Gas de síntesis de biomasa", fraccion: vector({ H2: 0.418, CO: 0.183, CO2: 0.127, H2O: 0.223, CH4: 0.004, N2: 0.045 }),
    nota: "Gasificación de residuos, ya limpio de azufre (Del Zotto et al., 2021): 42 % H₂, 18 % CO, 13 % CO₂, 22 % H₂O; el 4,5 % restante, inerte." },
  h2: { nombre: "Hidrógeno húmedo", fraccion: vector({ H2: 0.97, H2O: 0.03 }),
    nota: "Hidrógeno con un 3 % de vapor, como en los bancos de ensayo." },
};

/** Caudales de entrada (mol/s por especie) para un combustible y unos factores sobre el nominal. */
export function entradas(combustible, factorComb, factorAire) {
  const fr = COMBUSTIBLES[combustible].fraccion, base = reparto(vector(diseno.fraccion_combustible));
  // mismo «combustible equivalente» (electrones disponibles) que el biogás nominal, sea cual sea la mezcla
  const ne = reparto(fr).ne, qComb = (diseno.q_combustible_mol_s * base.ne) / ne * factorComb;
  const qa = fr.map((x) => x * qComb), qAire = diseno.q_aire_mol_s * factorAire;
  const qc = new Array(7).fill(0); qc[O2] = 0.2095 * qAire; qc[N2] = 0.7905 * qAire;
  return { qa, qc };
}

export function crea(combustible = "biogas") {
  const { qa, qc } = entradas(combustible, 1, 1);
  return { t: 0, y: estadoInicial(PILA, qa, qc), historial: [] };
}

/** Avanza `dt` segundos con entradas constantes (pasos de 0,02 s, Runge–Kutta 4). */
export function avanza(sim, dt, I, qa, qc) {
  const h = 0.02, n = Math.max(1, Math.round(dt / h));
  for (let k = 0; k < n; k++) sim.y = pasoRK4(PILA, sim.y, dt / n, I, qa, qc);
  sim.t += dt;
}

/** Magnitudes que enseña el visor, a partir del estado. */
export function lectura(sim, I, qa, qc) {
  const [pa, pc] = presiones(PILA, sim.y);
  const v = tension(PILA, I, qa, pa, pc);
  const { ne } = reparto(qa);
  const fuel = qa[H2] + qa[CO] + 4 * qa[CH4];                     // «H₂ equivalente» que entra (mol/s)
  const utilizacion = fuel > 0 ? (PILA.N0 * I) / (2 * 96485.33212) / fuel : 0;
  const agotada = !Number.isFinite(v.V) || v.Vcelda <= 0;
  const electrica = agotada ? 0 : v.V * I;
  const calor = agotada ? NaN : PILA.N0 * I * (v.ET - v.Vcelda);
  const pt = pa.reduce((a, b) => a + b, 0), RT = R * PILA.T;
  const kvCO2 = (PILA.K_an * 1e3) / ATM / Math.sqrt(2.016e-3);    // válvula «igual»
  return {
    ...v, pa: pa.map((p) => p / ATM), pc: pc.map((p) => p / ATM), fracAnodo: pa.map((p) => p / pt), ne,
    utilizacion, agotada, electrica, calor, rendimiento: electrica / potenciaCombustible(qa),
    co2_g_h: pa[CO2] * kvCO2 * 44.009 * 3600, // CO₂ que sale por el escape del ánodo
    pCombustible: potenciaCombustible(qa), RT,
  };
}

/** Tensión mínima por celda que deja la electrónica: por debajo, el níquel del ánodo se oxida y la celda se daña. */
export const V_MIN_CELDA = 0.6;

/** Corriente máxima sostenible en régimen permanente con estas entradas (la que da V_MIN_CELDA). */
export function corrienteMaxima(qa, qc) {
  const v = (I) => { const r = regimen(PILA, I, qa, qc); if (!r) return -1; const t = tension(PILA, I, qa, r[0], r[1]); return Number.isFinite(t.Vcelda) ? t.Vcelda : -1; };
  let lo = 0, hi = 200;
  if (v(hi) >= V_MIN_CELDA) return hi;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (v(m) >= V_MIN_CELDA) lo = m; else hi = m; }
  return lo;
}

/** Curva de polarización en régimen permanente para las entradas actuales. */
export function polarizacion(qa, qc, Imax = 80, n = 81) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const I = (Imax * k) / (n - 1), r = regimen(PILA, I, qa, qc);
    if (!r) break;
    const v = tension(PILA, I, qa, r[0], r[1]);
    if (!Number.isFinite(v.V) || v.Vcelda <= 0.2) break;
    pts.push({ I, V: v.Vcelda, P: v.V * I });
  }
  return pts;
}
export { H2, O2, H2O, N2, CO, CH4, CO2, ORDEN };
