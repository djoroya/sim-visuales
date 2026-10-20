// Compara la versión JavaScript con la referencia de Python (tmp/referencia.json).
//   node web/prueba/compara.mjs
import fs from "node:fs";
import { problema, resuelve } from "../js/she.js";
const casos = JSON.parse(fs.readFileSync("tmp/referencia.json", "utf8"));
let peor = 0;
for (const c of casos) {
  const P = problema(c.Ea, c.Eb, c.U);
  const t0 = performance.now(); const r = resuelve(P, c.x0); const ms = performance.now() - t0;
  const mismas = r.ts.length === c.ts.length && r.niveles.every((u, i) => Math.abs(u - c.niveles[i]) < 1e-12);
  const dAng = mismas ? Math.max(0, ...r.ts.map((t, i) => Math.abs(t - c.ts[i]))) : Infinity;
  peor = Math.max(peor, dAng);
  console.log(`${c.nombre.padEnd(10)} ${String(c.U.length)} niveles m=${c.x0[0]}: ${r.ts.length} conm. (py ${c.ts.length}), max|Δángulo| ${dAng.toExponential(1)} rad, residuo ${Math.max(...r.residuo.map(Math.abs)).toExponential(1)}, brecha ${r.brecha.toExponential(0)}, ${r.iter} it, ${ms.toFixed(0)} ms`);
}
console.log(`peor diferencia de ángulo: ${peor.toExponential(2)} rad`);
