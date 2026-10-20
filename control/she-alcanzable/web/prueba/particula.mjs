// La partícula en la caja que se encoge. Estado x(t) = lo que falta de (b1, bh); velocidad
// -D(t) u(t); caja R(t) = {∫_t^π D u}, con borde h_t(w) = ∫_t^π |w·D| (exacto, sin programación
// dinámica). Dos reglas: la ÓPTIMA (la onda del dual) y la PEREZOSA (mantener el nivel mientras
// se pueda seguir dentro; si no, cambiar al nivel que aguante más).
//   node web/prueba/particula.mjs <m> <h> <niveles> [salida.json]
import fs from "node:fs";
import { problema, resuelve, espectro } from "../js/she.js";
const m = +(process.argv[2] || 0.8), h = +(process.argv[3] || 5), nU = +(process.argv[4] || 3), salida = process.argv[5];
const U = nU === 2 ? [-1, 1] : Array.from({ length: nU }, (_, k) => -1 + 2 * k / (nU - 1));
const K = 4000, dt = Math.PI / K, NW = 720;
const D = Array.from({ length: K }, (_, k) => { const s = (k + 0.5) * dt; return [(2 / Math.PI) * Math.sin(s), (2 / Math.PI) * Math.sin(h * s)]; });
const Wd = Array.from({ length: NW }, (_, j) => [Math.cos((2 * Math.PI * j) / NW), Math.sin((2 * Math.PI * j) / NW)]);
// S[j][k] = h_{t_k}(w_j) = Σ_{i>=k} |w_j·D_i| dt
const S = Wd.map((w) => { const a = new Float64Array(K + 1); for (let k = K - 1; k >= 0; k--) a[k] = a[k + 1] + Math.abs(w[0] * D[k][0] + w[1] * D[k][1]) * dt; return a; });
const TOL = 1e-9;
const margen = (x, k) => { let mx = -Infinity; for (let j = 0; j < NW; j++) mx = Math.max(mx, Wd[j][0] * x[0] + Wd[j][1] * x[1] - S[j][k]); return mx; };   // <= 0: dentro
const paso = (x, k, u) => [x[0] - D[k][0] * u * dt, x[1] - D[k][1] * u * dt];
const x0 = [m, 0];
if (margen(x0, 0) > TOL) { console.log("objetivo fuera del conjunto alcanzable"); process.exit(0); }

// tamaño de la caja en cada instante (la menor anchura), para el margen de seguridad
const tam = Array.from({ length: K + 1 }, (_, k) => Math.min(...S.map((a) => a[k])));
const ALFA = +(process.env.ALFA || 0);
const dentro = (z, k) => margen(z, k) <= -ALFA * tam[k] + TOL;
function perezosa() {
  const aguante = (x, k, v) => { let y = x, i = k; while (i < K) { const z = paso(y, i, v); if (!dentro(z, i + 1)) break; y = z; i++; } return i - k; };
  let x = x0, u = null, cambios = 0; const tray = [x], us = [];
  for (let k = 0; k < K; k++) {
    if (u === null || !dentro(paso(x, k, u), k + 1)) {
      let mejor = null, mejorA = -1;
      for (const v of U) { if (v === u) continue; const a = aguante(x, k, v); if (a > mejorA || (a === mejorA && u !== null && Math.abs(v - u) < Math.abs(mejor - u))) { mejorA = a; mejor = v; } }
      if (u !== null) cambios++;
      u = mejor;
    }
    x = paso(x, k, u); tray.push(x); us.push(u);
  }
  return { tray, us, cambios, final: Math.hypot(...x) };
}

function optima() {
  const P = problema([], [1, h], U, nU === 2 ? { pendientes: [1] } : {});
  const r = resuelve(P, x0, { eps: 1e-8 }); const b = [0, ...r.ts, Math.PI];
  let x = x0; const tray = [x], us = [];
  for (let k = 0; k < K; k++) { const t = (k + 0.5) * dt; let i = 0; while (i < r.niveles.length - 1 && t >= b[i + 1]) i++; const u = r.niveles[i]; x = paso(x, k, u); tray.push(x); us.push(u); }
  return { tray, us, cambios: r.ts.length, final: Math.hypot(...x), ts: r.ts, niveles: r.niveles };
}

function deUs(us) {                    // conmutaciones y espectro a partir de la secuencia de niveles
  const ts = [], niveles = [us[0]];
  for (let k = 1; k < K; k++) if (us[k] !== us[k - 1]) { ts.push(k * dt); niveles.push(us[k]); }
  const e = espectro(ts, niveles, 49), nt = e.slice(1).filter((x) => x.h % 3);
  return { ts, niveles, b1: e[0].amp, bh: e[(h - 1) / 2].amp, thd: Math.sqrt(nt.filter((x) => x.h !== h).reduce((s, x) => s + x.amp ** 2, 0)) / e[0].amp };
}
const res = { m, h, nU, U };
for (const [nombre, f] of [["óptima", optima], ["perezosa", perezosa]]) {
  const t0 = performance.now(); const r = f(); const ms = performance.now() - t0; const d = deUs(r.us);
  console.log(`${nombre.padEnd(9)} ${nU} niveles, m=${m}, h=${h}${nombre === "perezosa" ? `, α=${ALFA}` : ""}: ${String(d.ts.length).padStart(4)} conmutaciones/semiperiodo | acaba a ${r.final.toExponential(1)} del origen | ${ms.toFixed(0)} ms`);
  res[nombre] = { tray: r.tray.filter((_, i) => i % 10 === 0), us: r.us.filter((_, i) => i % 10 === 0), ts: d.ts, niveles: d.niveles };
}
if (salida) {
  // fotogramas de la caja: punto del borde en cada dirección, ∫_t^π D sign(w·D)
  const cajas = [];
  for (let k = 0; k <= K; k += 40) {
    const poli = [];
    for (let j = 0; j < NW; j += 4) { let a0 = 0, a1 = 0; for (let i = k; i < K; i++) { const sg = Wd[j][0] * D[i][0] + Wd[j][1] * D[i][1] >= 0 ? 1 : -1; a0 += sg * D[i][0] * dt; a1 += sg * D[i][1] * dt; } poli.push([a0, a1]); }
    cajas.push({ k, poli });
  }
  res.cajas = cajas; res.K = K;
  fs.writeFileSync(salida, JSON.stringify(res));
}
