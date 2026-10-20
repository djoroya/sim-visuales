// Uso: node web/prueba/dos_niveles.mjs  (escribe tmp/dos_niveles.json, que usa python/figuras_post.py)
// Dos niveles (±1) con penalización lineal ±u: el principio del máximo da bang-bang. Barrido
// de la fundamental b1 en [-1, 1] para los conjuntos de las diapositivas (solo senos).
import fs from "node:fs";
import { problema, resuelve } from "../js/she.js";
const out = {};
for (const H of [[1, 3, 5, 7, 9], [1, 3, 9, 13, 17], [1, 5, 7, 9, 11], [1, 7, 9, 11, 13]]) {
  for (const [nombre, s] of [["minus", -1], ["plus", 1]]) {
    const P = problema([], H, [-1, 1], { pendientes: [s] });
    let q = null, fallos = 0, filas = [];
    for (let i = 0; i <= 200; i++) {
      const m = -1 + 2 * i / 200, x0 = new Array(P.n).fill(0); x0[0] = m;
      let r = resuelve(P, x0, { q0: q, eps: 1e-6 });
      let ok = Math.max(...r.residuo.map(Math.abs)) < 1e-4;
      if (!ok && q) { r = resuelve(P, x0, { eps: 1e-6 }); ok = Math.max(...r.residuo.map(Math.abs)) < 1e-4; }
      if (!ok) fallos++;
      q = ok ? r.q : null;
      filas.push({ m, ok, ts: r.ts, niveles: r.niveles, brecha: r.brecha });
    }
    const nq = filas.filter((f) => f.ok).map((f) => f.ts.filter((t) => t < Math.PI / 2 - 1e-9).length);
    console.log(`${H.join(",")} ${nombre}: ${fallos} fallos de 201 | conmutaciones por cuarto ${Math.min(...nq)}–${Math.max(...nq)} | primer nivel en m=0,5: ${filas[150].niveles[0]}`);
    out[`${H.join(",")}|${nombre}`] = filas;
  }
}
fs.writeFileSync("tmp/dos_niveles.json", JSON.stringify(out));
