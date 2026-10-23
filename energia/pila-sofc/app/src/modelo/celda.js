// Celda en régimen permanente (igual que python/celda.py): Nernst en la interfaz del ánodo menos pérdidas
// óhmica y de activación; el ánodo y el cátodo, bien mezclados. Caudales en ml/min normales.
import { R, F, gibbs } from "./termo.js";
export const ML_MIN_A_MOL_S = 1e-3 / 60 / 22.414, X_O2_AIRE = 0.2095, T_REF = 1023.15;
const arrhenius = (ref, e, T, signo) => ref * Math.exp((signo * e) / R * (1 / T - 1 / T_REF));
export function E0H2(T) { return -(gibbs("H2O", T) - gibbs("H2", T) - 0.5 * gibbs("O2", T)) / (2 * F); }
export function punto(I, T, qAnodo, xH2, qAire, p) {
  const nAn = qAnodo * ML_MIN_A_MOL_S, nAgua = (p.x_agua / (1 - p.x_agua)) * nAn, nTot = nAn + nAgua;
  const nH2 = xH2 * nAn - I / (2 * F), nH2O = nAgua + I / (2 * F);
  const nAire = qAire * ML_MIN_A_MOL_S, nO2 = X_O2_AIRE * nAire - I / (4 * F);
  if (nH2 <= 0 || nO2 <= 0) return null;
  const j = I / p.area, xh2 = nH2 / nTot, xh2o = nH2O / nTot;
  const xh2i = xh2 - j / p.jL, xh2oi = xh2o + j / p.jL, xo2 = nO2 / (nAire - I / (4 * F));
  if (xh2i <= 0) return null;
  const E0 = E0H2(T), k = (R * T) / (2 * F);
  const Esal = E0 + k * Math.log((xh2 * Math.sqrt(xo2)) / xh2o), E = E0 + k * Math.log((xh2i * Math.sqrt(xo2)) / xh2oi);
  const etaOhm = I * arrhenius(p.R_ohm, p.E_ohm, T, +1);
  const etaAct = ((R * T) / F) * Math.asinh(j / (2 * arrhenius(p.j0, p.E_act, T, -1)));
  return { V: E - etaOhm - etaAct, E: Esal, E0, etaConc: Esal - E, etaOhm, etaAct, utilizacion: I / (2 * F) / (xH2 * nAn) };
}
