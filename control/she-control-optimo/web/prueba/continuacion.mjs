// Seguir una solución al variar la amplitud: Newton por continuación (la homotopía de Kato en
// su forma más simple) frente al dual en caliente. Los dos arrancan de la misma solución en
// m = 0,2 (la del dual en frío) y recorren m hasta 0,8 en pasos de 0,01. En cada paso se mide
// el tiempo y si la solución seguida es la de menor penalización (la del dual en frío en ese m).
//
//   node web/prueba/continuacion.mjs [N...]
import { problema, resuelve } from "../js/she.js";
import { armonicos, valido, errMax, newton } from "./clasico.mjs";

const Ns = process.argv.slice(2).map(Number).filter(Boolean);
const TAMANOS = Ns.length ? Ns : [5, 9, 13, 17, 25];
const PASO = 0.01, M0 = 0.2, M1 = 0.8;

const angulos = (r) => r.ts.filter((t) => t < Math.PI / 2 - 1e-12);
const igual = (a, b) => a && b && a.length === b.length && a.every((t, k) => Math.abs(t - b[k]) < 1e-6);

for (const N of TAMANOS) {
  const H = armonicos(N), P = problema([], H, [-1, 0, 1]);
  const x0 = (m) => H.map((_, j) => (j === 0 ? m : 0));
  const r0 = resuelve(P, x0(M0), { eps: 1e-10 });
  let th = angulos(r0), q = r0.q;
  let tN = 0, tD = 0, fallosN = 0, fallosD = 0, pasos = 0, distintaN = 0, distintaD = 0, peorN = 0;
  for (let m = M0 + PASO; m <= M1 + 1e-9; m += PASO) {
    pasos++;
    let t0 = performance.now(); const thn = th && newton(th, H, m); tN += performance.now() - t0;
    t0 = performance.now(); const rd = resuelve(P, x0(m), { q0: q, eps: 1e-10 }); tD += performance.now() - t0;
    const thd = angulos(rd), okD = thd.length === N && valido(thd) && errMax(thd, H, m) < 1e-8;
    // referencia: el dual en frío (la solución de menor penalización)
    const ref = angulos(resuelve(P, x0(m), { eps: 1e-10 }));
    if (thn) { if (!igual(thn, ref)) distintaN++; peorN = Math.max(peorN, errMax(thn, H, m)); } else fallosN++;
    if (okD) { if (!igual(thd, ref)) distintaD++; } else fallosD++;
    th = thn; q = okD ? rd.q : null;
  }
  console.log(`N=${N}: ${pasos} pasos de ${PASO} | Newton por continuación: ${(tN / pasos).toFixed(2)} ms/paso, ${fallosN} fallos, ${distintaN} con otra solución | dual en caliente: ${(tD / pasos).toFixed(2)} ms/paso, ${fallosD} fallos, ${distintaD} con otra solución`);
}
