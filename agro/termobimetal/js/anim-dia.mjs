// Un día de julio para la animación → tmp/anim-dia.json: cada 10 min, ΔT de la hoja sobre su cierre
// (0,2 mm, blanca, plana a 18 °C), el aire de fuera y de dentro (estrategia de hojas) y el sol.
//   node js/anim-dia.mjs [día del año]
import fs from "node:fs";
import { creaClima } from "../../invernadero/app/src/modelo/ges.js";
import { HOJA, temperaturaHoja, aperturaHoja } from "./lamina.js";
const datos = JSON.parse(fs.readFileSync(new URL("../../invernadero/app/public/datos/tiempo-hortimed.json", import.meta.url)));
const clima = creaClima(datos), dia = +(process.argv[2] || 189);
const serie = JSON.parse(fs.readFileSync("tmp/serie.json")).bimetal_fina.serie;   // [t, T_i, T_e, área]
const h = { ...HOJA, s: 0.2e-3 };
const rad = Math.PI / 180, dec = 23.45 * Math.sin(rad * (360 * (284 + dia)) / 365), lat = datos.latitud;
const filas = [];
for (let m = 0; m <= 24 * 60; m += 10) {
  const t = dia * 86400 + m * 60, c = clima(t);
  const s = serie.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a));
  const Th = temperaturaHoja(h, c, s[1]);
  const w = (m / 60 - 12) * 15 * rad;                                         // ángulo horario (hora solar)
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec * rad) + Math.cos(lat * rad) * Math.cos(dec * rad) * Math.cos(w));
  const az = Math.atan2(Math.sin(w), Math.cos(w) * Math.sin(lat * rad) - Math.tan(dec * rad) * Math.cos(lat * rad));
  filas.push({ hora: m / 60, dT: Math.max(0, Th - h.T_c), f: aperturaHoja(h, Th, c[2]), Te: c[0], Ti: s[1], hoja: Th, viento: c[2], sol_el: el / rad, sol_az: az / rad });
}
fs.writeFileSync("tmp/anim-dia.json", JSON.stringify({ dia, T_c: h.T_c, filas }));
for (const f of filas.filter((_, k) => k % 12 === 0)) console.log(`${String(f.hora).padStart(2)} h: fuera ${f.Te.toFixed(1)}, dentro ${f.Ti.toFixed(1)}, hoja ${f.hoja.toFixed(1)} (ΔT ${f.dT.toFixed(1)}), sol ${f.sol_el.toFixed(0)}°`);
