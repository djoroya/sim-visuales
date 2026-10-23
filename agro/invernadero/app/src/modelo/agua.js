// Ampliación didáctica del GES: reservas finitas de agua, sin calibración agronómica.
// Litros ≈ kg de agua; todas las reservas se refieren al invernadero completo.
// Balance inspirado en FAO-56, cap. 8 (no es una implementación de FAO-56):
// https://www.fao.org/4/x0490e/x0490e0e.htm
import { derivadas as ges, estadoInicial as inicialGES, AJUSTES } from './ges.js';

export const AGUA = { area: 250, areaCultivo: 187.5, capacidad: 2000, objetivo: 1400,
  recuperacion: 3600, drenaje: 3600, aguaPorCarbohidrato: 9 };
export const I = { sustrato: 21, plantas: 22, riego: 23, drenaje: 24, transpiracion: 25,
  evaporacion: 26, poda: 27, absorcion: 28 };
const clip = (x) => Math.min(Math.max(x, 0), 1);
// Aproximación explícita: 9 kg de agua por kg de carbohidrato de fruto, hoja y tallo.
// No es una medida del agua de los tejidos ni una conversión calibrada de biomasa fresca.
export const aguaObjetivo = (y) => Math.max(0.1, (y[15] + y[16] + y[17]) * AGUA.areaCultivo * AGUA.aguaPorCarbohidrato);
export function estadoInicial(clima, t = 0) {
  const y = new Float64Array(29); y.set(inicialGES(clima, t));
  y[I.sustrato] = AGUA.objetivo; y[I.plantas] = aguaObjetivo(y);
  return y;
}
export function derivadas(t, y, clima, aj = AJUSTES, flujos = null) {
  const ws = Math.max(y[I.sustrato], 0), wp = Math.max(y[I.plantas], 0), objetivo = aguaObjetivo(y);
  const factorHidrico = clip(wp / (0.8 * objetivo));
  const factorEvaporacion = clip(ws / (AGUA.capacidad * 0.25));
  const f = {}, d = new Float64Array(29);
  d.set(ges(t, y, clima, { ...aj, factorHidrico, factorEvaporacion }, f));
  const absorcion = clip(ws / (AGUA.capacidad * 0.25)) * Math.max(0,
    f.vapor_transpiracion + (objetivo - wp) / AGUA.recuperacion);
  const drenaje = Math.max(ws - AGUA.capacidad, 0) / AGUA.drenaje;
  // Automático: repone al 70 % con caudal limitado. Manual: dosis repartida en 24 h.
  const caudal = Math.max(0, aj.dosisRiego ?? 4) * AGUA.area / 86400;
  const riego = aj.riego === 'apagado' ? 0 : aj.riego === 'manual' ? caudal
    : Math.min(caudal, Math.max(0, f.vapor_evaporacion + absorcion + (AGUA.objetivo - ws) / AGUA.recuperacion));
  // Al podar hojas sale también su parte proporcional de agua; no se recicla.
  const podaCarb = Math.max(y[16] - 5 / 26.6, 0);
  const poda = Math.min(wp / AGUA.recuperacion,
    podaCarb * AGUA.areaCultivo * AGUA.aguaPorCarbohidrato * clip(wp / objetivo));
  d[I.sustrato] = riego - absorcion - f.vapor_evaporacion - drenaje;
  d[I.plantas] = absorcion - f.vapor_transpiracion - poda;
  d[I.riego] = riego; d[I.drenaje] = drenaje; d[I.transpiracion] = f.vapor_transpiracion;
  d[I.evaporacion] = f.vapor_evaporacion; d[I.poda] = poda; d[I.absorcion] = absorcion;
  if (flujos) Object.assign(flujos, f, { agua_riego: riego, agua_absorcion: absorcion, agua_drenaje: drenaje,
    agua_poda: poda, agua_sustrato: ws, agua_plantas: wp, agua_objetivo: objetivo, factor_hidrico: factorHidrico });
  return d;
}
export function balanceAgua(y, inicial) {
  return inicial + y[I.riego] - y[I.drenaje] - y[I.transpiracion] - y[I.evaporacion]
    - y[I.poda] - y[I.sustrato] - y[I.plantas];
}
