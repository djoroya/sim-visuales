// JavaScript (ROS2, paso fijo) frente a la solución precisa de Python (BDF, rtol 1e-8), 10 días.
//   node app/prueba/compara.mjs [paso_s]   (desde agro/invernadero)
import fs from "node:fs";
import { NOMBRES, creaClima, estadoInicial, derivadas } from "../src/modelo/ges.js";
import { pasoROS2 } from "../src/modelo/integrador.js";
const h = +(process.argv[2] || 60);
const clima = creaClima(JSON.parse(fs.readFileSync("app/public/datos/tiempo.json", "utf8")));
const ref = JSON.parse(fs.readFileSync("tmp/ref_py.json", "utf8"));
// 1) derivadas idénticas en los estados de referencia (sin integrador de por medio)
const f = (t, y) => derivadas(t, y, clima);
let y = estadoInicial(clima), t = 0, j = 0; const maxd = new Float64Array(21), sumd = new Float64Array(21);
const t0 = performance.now();
while (j < ref.t.length) {
  if (Math.abs(t - ref.t[j]) < 1e-6) { for (let k = 0; k < 21; k++) { const d = Math.abs(y[k] - ref.y[j][k]); maxd[k] = Math.max(maxd[k], d); sumd[k] += d; } j++; }
  if (j >= ref.t.length) break;
  y = pasoROS2(f, t, y, h); t += h;
}
const ms = performance.now() - t0;
console.log(`10 días con paso ${h} s: ${ms.toFixed(0)} ms (${(ms / 10).toFixed(0)} ms por día simulado)`);
NOMBRES.forEach((nm, k) => console.log(`${nm.padEnd(8)} máx|dif| ${maxd[k].toExponential(2)}  media ${(sumd[k] / ref.t.length).toExponential(2)}`));
