// Núcleo JavaScript frente a Python (python/referencia.py): trayectoria con escalones de diésel, vapor y aire.
//   node prueba/compara.mjs [paso_s]          (desde energia/reformador/app)
import fs from "node:fs";
import { REFORMADOR, avanza, salida } from "../src/modelo/reformador.js";
const hmax = +(process.argv[2] || 1);
const ref = JSON.parse(fs.readFileSync(new URL("../../datos/referencia-js.json", import.meta.url), "utf8"));
const entradas = (t) => {
  const [, comb, sc, o2c] = ref.escalones.filter((e) => t >= e[0]).at(-1);
  return { combustible: comb, vapor: sc * comb, aire: o2c * comb / 0.2095, T_entra: 673.15, Q: 0 };
};
let x = ref.x0.slice(), maxT = 0, maxY = 0, peorY = null;
const t0 = performance.now();
for (let k = 1; k < ref.serie.length; k++) {
  const a = ref.serie[k - 1].t, b = ref.serie[k].t;
  x = avanza(REFORMADOR, x, b - a, entradas((a + b) / 2), hmax);
  const s = ref.serie[k], { y } = salida(REFORMADOR, x);
  maxT = Math.max(maxT, Math.abs(x[9] - s.T));
  const dy = Math.max(...y.map((v, i) => Math.abs(v - s.y[i])));
  if (dy > maxY) { maxY = dy; peorY = s.t; }
}
const ms = performance.now() - t0;
const tFin = ref.serie.at(-1).t;
console.log(`  ${tFin} s simulados con pasos de hasta ${hmax} s: ${ms.toFixed(0)} ms`);
let fallos = 0;
const informa = (nombre, v, lim, u) => { const ok = v <= lim; if (!ok) fallos++; console.log(`${ok ? "✔" : "✘"} ${nombre}: ${v.toExponential(2)} ${u} (límite ${lim} ${u})`); };
informa("Temperatura frente a Python (máx)", maxT, 0.5, "K");
informa("Fracciones molares frente a Python (máx)", maxY * 100, 0.1, "puntos %");
console.log(`  la mayor diferencia de composición, en t = ${peorY} s`);
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo correcto.");
process.exit(fallos ? 1 : 0);
