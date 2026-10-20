// Banco de pruebas: tres métodos para la SHE clásica de tres niveles, misma máquina, mismos casos.
//
// Formulación clásica (cuarto de onda, solo senos): N ángulos 0 < θ1 < … < θN < π/2, la onda
// vale 0, 1, 0, 1… entre ellos y
//     b_h = 4/(hπ) Σ_k s_k cos(h θ_k),   s_k = +1 (k impar, sube), -1 (k par, baja)
// con b_1 = m y b_h = 0 para los N - 1 armónicos impares no triples siguientes.
//
//   1. Newton clásico desde ángulos al azar (multiarranque): tasa de éxito y tiempo hasta la
//      primera solución.
//   2. PSO + Newton, con los parámetros de Chen, Zhang y Yin (arXiv 2608.22391, tabla I):
//      población 300, 200 iteraciones, inercia 1,5 -> 0,4, c1 = c2 = 0,5, |v| <= 3,6°.
//   3. El dual de control óptimo (web/js/she.js), en frío y en caliente (barrido de amplitudes).
//
//   node web/prueba/banco.mjs [N...]       p. ej.  node web/prueba/banco.mjs 5 9 13
import { problema, resuelve } from "../js/she.js";
import { TOL, azar, armonicos, residuo, valido, errMax, newton } from "./clasico.mjs";

const Ns = process.argv.slice(2).map(Number).filter(Boolean);
const TAMANOS = Ns.length ? Ns : [5, 9, 13, 17, 25];
const AMPLITUDES = [0.2, 0.4, 0.6, 0.8];
const LIMITE_MS = 20000;                 // presupuesto del multiarranque de Newton por caso

function newtonMultiarranque(H, m) {
  const N = H.length, t0 = performance.now(); let intentos = 0;
  while (performance.now() - t0 < LIMITE_MS) {
    intentos++;
    const th0 = Array.from({ length: N }, () => azar() * Math.PI / 2).sort((a, b) => a - b);
    const th = newton(th0, H, m);
    if (th) return { ok: true, intentos, ms: performance.now() - t0, th };
  }
  return { ok: false, intentos, ms: performance.now() - t0 };
}

/** PSO (Chen et al.) y refinado con Newton desde el mejor. Posiciones en grados. */
function psoNewton(H, m, P = 300, tmax = 200) {
  const N = H.length, t0 = performance.now(), gr = Math.PI / 180;
  const coste = (x) => {
    const th = x.map((v) => v * gr), F = residuo(th, H, m);
    let dc = (x[0] < 0 ? 1 : 0) + (x[N - 1] > 90 ? 1 : 0); for (let i = 0; i < N - 1; i++) if (x[i] > x[i + 1]) dc++;
    return 50 * F[0] ** 2 + F.slice(1).reduce((s, v) => s + v * v, 0) + 1e5 * dc;
  };
  const X = Array.from({ length: P }, () => Array.from({ length: N }, () => azar() * 90).sort((a, b) => a - b));
  const V = Array.from({ length: P }, () => new Array(N).fill(0));
  const Pb = X.map((x) => [...x]), Jp = X.map(coste);
  let g = Jp.indexOf(Math.min(...Jp)), G = [...Pb[g]], Jg = Jp[g];
  for (let t = 1; t <= tmax; t++) {
    const w = 1.5 - (1.5 - 0.4) * t / tmax, c1 = t < 100 ? 0.5 : 0.5 - 0.5 * (t - 100) / (tmax - 100), c2 = 0.5;
    for (let i = 0; i < P; i++) {
      for (let k = 0; k < N; k++) {
        let v = w * V[i][k] + c1 * azar() * (Pb[i][k] - X[i][k]) + c2 * azar() * (G[k] - X[i][k]);
        V[i][k] = Math.max(-3.6, Math.min(3.6, v)); X[i][k] += V[i][k];
      }
      const J = coste(X[i]);
      if (J < Jp[i]) { Jp[i] = J; Pb[i] = [...X[i]]; if (J < Jg) { Jg = J; G = [...X[i]]; } }
    }
  }
  const th = newton(G.map((v) => v * gr), H, m);
  return { ok: !!th, ms: performance.now() - t0, th, errPSO: errMax(G.map((v) => v * gr), H, m) };
}

/** El dual: ángulos en [0, π/2] de la solución (tres niveles, solo senos). */
function dual(P, H, m, q0) {
  const t0 = performance.now(), x0 = H.map((_, j) => (j === 0 ? m : 0));
  const r = resuelve(P, x0, { q0, eps: 1e-10 });
  const th = r.ts.filter((t) => t < Math.PI / 2 - 1e-12);
  return { ok: th.length === H.length && valido(th) && errMax(th, H, m) < 1e-8, ms: performance.now() - t0, th, q: r.q, nconm: th.length };
}

const fila = (s) => console.log(s);
fila("N | m | Newton multiarranque: éxito, intentos, ms | PSO+Newton: éxito, ms, error PSO | dual frío: ms | dual caliente: ms | ¿misma solución?");
const resumen = [];
for (const N of TAMANOS) {
  const H = armonicos(N), P = problema([], H, [-1, 0, 1]);
  let qPrev = null;
  for (const m of AMPLITUDES) {
    const nw = newtonMultiarranque(H, m);
    const ps = psoNewton(H, m);
    const df = dual(P, H, m, null);
    const dc = dual(P, H, m, qPrev); qPrev = dc.ok ? dc.q : null;
    const igual = (a, b) => a && b && a.length === b.length && a.every((t, k) => Math.abs(t - b[k]) < 1e-6);
    const misma = [nw.ok && igual(nw.th, df.th) ? "N=" : "", ps.ok && igual(ps.th, df.th) ? "P=" : ""].join("") || "—";
    fila(`${N} | ${m} | ${nw.ok ? "sí" : "NO"}, ${nw.intentos}, ${nw.ms.toFixed(0)} | ${ps.ok ? "sí" : "NO"}, ${ps.ms.toFixed(0)}, ${ps.errPSO.toExponential(0)} | ${df.ok ? "" : "FALLO "}${df.ms.toFixed(1)} (${df.nconm} áng.) | ${dc.ok ? "" : "FALLO "}${dc.ms.toFixed(1)} | ${misma}`);
    resumen.push({ N, m, nw, ps, df, dc });
  }
}
console.log(JSON.stringify(resumen.map((r) => ({ N: r.N, m: r.m, newton: { ok: r.nw.ok, intentos: r.nw.intentos, ms: +r.nw.ms.toFixed(1) }, pso: { ok: r.ps.ok, ms: +r.ps.ms.toFixed(1), errPSO: r.ps.errPSO }, dualFrio: { ok: r.df.ok, ms: +r.df.ms.toFixed(1) }, dualCaliente: { ok: r.dc.ok, ms: +r.dc.ms.toFixed(1) } }))));
