// Estado y avance del reformador del visor (sin React).
import hollin from "../../datos/hollin.json";
import { CH4, CHX, CO, CO2, H2, H2O, NU, O2, PCI, REFORMADOR, avanza as avanzaModelo, calores, caudales, estadoInicial, salida } from "./modelo/reformador.js";

export const REF = REFORMADOR;
export const T_ENTRA = 673.15;                       // vapor y aire precalentados a 400 °C; el diésel, vaporizado
export const NOMINAL = { potencia: 1.5, sc: 1.6, o2c: 0.6 };
const PCI_H2 = 241.826e3, PCI_CO = 282.98e3, PCI_CH4 = 802.3e3;   // J/mol, a 298 K

/** Entradas del modelo a partir de los mandos: potencia del diésel (kW de PCI), vapor/carbono y O₂/carbono. */
export function entradas({ potencia, sc, o2c }) {
  const combustible = (potencia * 1e3) / PCI;
  return { combustible, vapor: sc * combustible, aire: (o2c * combustible) / 0.2095, T_entra: T_ENTRA, Q: 0 };
}

export const crea = () => ({ t: 0, x: estadoInicial(REF, T_ENTRA), historial: [] });

export function avanza(sim, dt, e) {
  sim.x = avanzaModelo(REF, sim.x, dt, e, 1);
  sim.t += dt;
}

/** La mínima S/C sin hollín en equilibrio, interpolada en el mapa de python/referencia.py. */
export function scMinima(o2c, T_C) {
  const { o2c: X, T_C: Ts, sc_min: M } = hollin;
  const ix = Math.min(X.length - 2, Math.max(0, Math.floor((o2c - X[0]) / (X[1] - X[0]))));
  const it = Math.min(Ts.length - 2, Math.max(0, Math.floor((T_C - Ts[0]) / (Ts[1] - Ts[0]))));
  const u = Math.min(1, Math.max(0, (o2c - X[ix]) / (X[ix + 1] - X[ix]))), v = Math.min(1, Math.max(0, (T_C - Ts[it]) / (Ts[it + 1] - Ts[it])));
  return (1 - v) * ((1 - u) * M[it][ix] + u * M[it][ix + 1]) + v * ((1 - u) * M[it + 1][ix] + u * M[it + 1][ix + 1]);
}
export const MAPA = hollin;

/** Magnitudes que enseña el visor, a partir del estado. */
export function lectura(sim, e, mandos) {
  const x = sim.x, T = x[9], { F, y } = salida(REF, x), Fin = caudales(e);
  const seco = 1 - y[H2O], ys = y.map((v) => v / seco);
  const pciSale = F[H2] * PCI_H2 + F[CO] * PCI_CO + F[CH4] * PCI_CH4, pciEntra = e.combustible * PCI;
  const q = calores(REF, x);                                   // W por reacción (positivo: calienta)
  const T_C = T - 273.15, scMin = scMinima(mandos.o2c, T_C);
  return {
    T, T_C, F, y, ys,
    rendimiento: pciSale / pciEntra,                           // PCI del gas que sale / PCI del diésel
    conversion: 1 - F[CHX] / Math.max(1e-12, Fin[CHX]),
    h2co: ys[H2] + ys[CO],
    oxigenoLibre: y[O2],
    qOxidacion: q[0] + q[4], qReformado: q[1] + q[2], qDesplazamiento: q[3],
    perdidas: REF.UA * (T - REF.T_amb),
    potencia: pciEntra, scMin, hollin: mandos.sc < scMin,
  };
}
export { NU };
