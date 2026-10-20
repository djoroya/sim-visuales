// Dos semanas desde el 15 de enero: el invernadero original, con calefacción a 16 °C, y con
// calefacción e inyección de CO₂ (5 kg/h de 6 a 20 h).   node app/prueba/experimento.mjs
import fs from "node:fs";
import { creaClima, estadoInicial, derivadas, AJUSTES } from "../src/modelo/ges.js";
import { pasoROS2 } from "../src/modelo/integrador.js";
const clima = creaClima(JSON.parse(fs.readFileSync("app/public/datos/tiempo.json", "utf8")));
const T_K = 273.15, t0 = 15 * 86400, dias = 14;
for (const [nombre, aj] of [["original (sin calefacción)", {}], ["calefacción a 16 °C", { calefaccion: true }], ["calefacción + CO₂ 5 kg/h", { calefaccion: true, added_CO2: 5 }]]) {
  const A = { ...AJUSTES, ...aj }, f = (t, y) => derivadas(t, y, clima, A);
  let y = estadoInicial(clima, t0), t = t0, energia = 0, sT = 0, n = 0, Tmin = Infinity, co2dia = 0, nd = 0, horasFrio = 0;
  const fr0 = y[15];
  while (t < t0 + dias * 86400) {
    const fl = {}; derivadas(t, y, clima, A, fl);
    energia += fl.calefaccion * 60; const Ti = y[1] - T_K; sT += Ti; n++; Tmin = Math.min(Tmin, Ti); if (Ti < 10) horasFrio += 1 / 60;
    if (fl.sol_exterior > 0) { co2dia += fl.CO2_ppm; nd++; }
    y = pasoROS2(f, t, y, 60); t += 60;
  }
  console.log(`${nombre.padEnd(28)} aire medio ${(sT / n).toFixed(1)} °C, mínimo ${Tmin.toFixed(1)} °C, ${horasFrio.toFixed(0)} h bajo 10 °C | CO₂ de día ${(co2dia / nd).toFixed(0)} ppm | fruto +${((y[15] - fr0) * 1000).toFixed(1)} g/m² de carbohidrato | calefacción ${(energia / 3.6e6).toFixed(0)} kWh`);
}
