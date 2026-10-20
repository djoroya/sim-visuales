// Número de conmutaciones por cuarto de periodo de la solución óptima (el dual), en la
// formulación de solo senos: barrido de amplitud, para distintos niveles y número de armónicos.
// Cota inferior genérica: N >= n (n = número de ecuaciones: fundamental + eliminados).
import fs from "node:fs";
import { problema, resuelve } from "../js/she.js";
const out = [];
const niveles = (nU) => (nU === 2 ? [-1, 1] : Array.from({ length: nU }, (_, k) => -1 + 2 * k / (nU - 1)));
for (const nArm of [2, 3, 4, 5, 6, 7, 9]) {
  const H = [1]; for (let h = 5; H.length < nArm; h += 2) if (h % 3) H.push(h);
  for (const nU of [2, 3, 5, 7, 9]) {
    const P = problema([], H, niveles(nU), nU === 2 ? { pendientes: [1] } : {});
    let q = null; const filas = [];
    for (let i = 1; i <= 230; i++) {
      const m = 0.005 * i, x0 = new Array(P.n).fill(0); x0[0] = m;
      let r = resuelve(P, x0, { q0: q, eps: 1e-7 });
      if (Math.max(...r.residuo.map(Math.abs)) > 1e-4 && q) r = resuelve(P, x0, { eps: 1e-7 });
      const ok = Math.max(...r.residuo.map(Math.abs)) < 1e-4; q = ok ? r.q : null;
      if (!ok) continue;
      const Nq = r.ts.filter((t) => t < Math.PI / 2 - 1e-9).length;
      filas.push({ m, Nq });
    }
    const Ns = filas.map((f) => f.Nq), hist = {}; Ns.forEach((v) => (hist[v] = (hist[v] || 0) + 1));
    const minimas = Ns.filter((v) => v === nArm).length;
    console.log(`n=${nArm} (hasta el ${H[H.length - 1]}.º), ${nU} niveles: ${filas.length} amplitudes | N por cuarto: ${Object.entries(hist).map(([k, v]) => `${k}:${v}`).join(" ")} | en el mínimo N=n: ${(100 * minimas / filas.length).toFixed(0)} %`);
    out.push({ nArm, H, nU, filas });
  }
}
fs.writeFileSync("tmp/conmutaciones.json", JSON.stringify(out));
