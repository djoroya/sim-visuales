// El invernadero de GES con el tiempo de HortiMED (16 feb – 9 ago 2018) y distintas ventanas:
// cerradas, motor (rampa 25–29 °C), abridor de cera y hojas de termobimetal, con o sin cierre por viento.
//   node js/experimento.mjs
import fs from "node:fs";
import { creaClima, estadoInicial, derivadas, AJUSTES } from "../../invernadero/app/src/modelo/ges.js";
import { pasoROS2 } from "../../invernadero/app/src/modelo/integrador.js";
import { HOJA, temperaturaHoja, aperturaHoja } from "./lamina.js";

const datos = JSON.parse(fs.readFileSync(new URL("../../invernadero/app/public/datos/tiempo-hortimed.json", import.meta.url)));
const clima = creaClima(datos), T_K = 273.15;
const t0 = datos.t0 + 86400, tFin = clima.fin - 3600;
export const VIENTO_MAX = 8;          // m/s: por encima, cerrar (supuesto)

/** Simula una estrategia: apertura(t, c, T_i, estado) → 0–1. Devuelve indicadores. */
export function simula(estrategia, { paso = 60, serie = false } = {}) {
  let y = estadoInicial(clima, t0), t = t0;
  const fr0 = y[15], est = {}, ind = { h30: 0, h35: 0, h10: 0, sT: 0, n: 0, Tmax: -Infinity, sAp: 0, cambios: 0, co2dia: 0, nDia: 0 };
  const out = [];
  let apAnt = 0;
  while (t < tFin) {
    const c = clima(t), Ti = y[1] - T_K;
    const ap = Math.max(0, Math.min(1, estrategia(t, c, Ti, est, paso)));
    const A = { ...AJUSTES, latitud: datos.latitud, ventanasModo: "manual", aperturaVentanas: 100 * ap };
    if (c[7] + c[15] > 50) {                                   // de día: CO₂ del aire (ppm)
      const fl = {}; derivadas(t, y, clima, A, fl); ind.co2dia += fl.CO2_ppm; ind.nDia++;
    }
    y = pasoROS2((tt, yy) => derivadas(tt, yy, clima, A), t, y, paso); t += paso;
    const T = y[1] - T_K, hrs = paso / 3600;
    if (T > 30) ind.h30 += hrs; if (T > 35) ind.h35 += hrs; if (T < 10) ind.h10 += hrs;
    ind.sT += T; ind.n++; ind.Tmax = Math.max(ind.Tmax, T); ind.sAp += ap; ind.cambios += Math.abs(ap - apAnt); apAnt = ap;
    if (serie && (t % 600 === 0)) out.push([t, T, c[0], ap]);
  }
  return { ...ind, Tmedia: ind.sT / ind.n, apMedia: ind.sAp / ind.n, co2: ind.co2dia / ind.nDia, fruto: (y[15] - fr0) * 1000, serie: out };
}

// --- estrategias
const rampa = (T, a, b) => Math.max(0, Math.min(1, (T - a) / (b - a)));
export const cerradas = () => 0;
export const motor = (veto, T0 = 25) => (t, c, Ti) => (vetado(c, veto) ? 0 : rampa(Ti, T0, T0 + 4));
/** Cera: el cilindro sigue al aire de dentro con retraso τ y empuja la ventana entre T0 y T0 + 11 K. */
export const cera = (T0, tau = 900) => (t, c, Ti, est, dt) => {
  est.Tw = est.Tw ?? Ti; est.Tw += (Ti - est.Tw) * (1 - Math.exp(-dt / tau));
  return rampa(est.Tw, T0, T0 + 11);
};
/** Hojas de termobimetal; r: área de hojas / área de ventanas del motor. */
export const HR_MAX = 90;             // % de humedad exterior: cota de «llueve» (incluye niebla y rocío)
export const vetado = (c, veto) => (veto && c[2] > VIENTO_MAX) || (veto === "lluvia" && c[3] > HR_MAX);
export const bimetal = (h, { r = 1, veto = false } = {}) => (t, c, Ti) => {
  if (vetado(c, veto)) return 0;
  return r * aperturaHoja(h, temperaturaHoja(h, c, Ti), c[2]);
};

if (process.argv[1].endsWith("experimento.mjs")) {
  const casos = [
    ["cerradas (solo rendijas)", cerradas],
    ["motor 25–29 °C", motor(false)],
    ["motor + cierre por viento", motor(true)],
    ["cera desde 20 °C", cera(20)],
    ["cera desde 24 °C", cera(24)],
  ];
  for (const sombra of [false, true]) for (const alfa of sombra ? [0] : [0.25, 0.9]) for (const T_c of [18, 22, 26]) for (const r of [1, 2])
    casos.push([`bimetal ${sombra ? "sombra" : "sol α=" + alfa} T_c=${T_c} r=${r}`, bimetal({ ...HOJA, sombra, alfa, T_c }, { r })]);
  console.log("estrategia                          T media  T máx  h>30  h>35  h<10  apert. media  fruto g/m²");
  for (const [n, e] of casos) {
    const t1 = performance.now(), r = simula(e);
    console.log(`${n.padEnd(34)} ${r.Tmedia.toFixed(1).padStart(6)} ${r.Tmax.toFixed(1).padStart(6)} ${r.h30.toFixed(0).padStart(5)} ${r.h35.toFixed(0).padStart(5)} ${r.h10.toFixed(0).padStart(5)} ${(100 * r.apMedia).toFixed(1).padStart(10)} % ${r.fruto.toFixed(1).padStart(9)}   (${((performance.now() - t1) / 1000).toFixed(0)} s)`);
  }
}
