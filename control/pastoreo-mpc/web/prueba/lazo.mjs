// Lazo cerrado completo en Node desde el estado inicial de una traza de Python.
//   node web/prueba/lazo.mjs tmp/traza_<esc>_<s>.json
import fs from "node:fs";
import crear from "../mpc.js";
import { cargaCoste } from "../js/controlador.js";
import { Motor } from "../js/motor.js";
import { MOLESTAR } from "../js/controlador.js";
MOLESTAR.activo = (process.argv[5] || "1") === "1";

const tr = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const CADA = +(process.argv[3] || 1), ITERS = +(process.argv[4] || 30);
const p0 = tr.pasos[0];
const plano = (a) => Float64Array.from(a.flat());
const coste = await cargaCoste(crear);
const seg = tr.seg.slice(0, tr.seg.length - 4);       // la traza incluye la valla; el motor la añade
const motor = new Motor(coste, { corral: { seg, puerta: tr.puerta, caja: tr.caja } },
  { X: plano(p0.X), V: plano(p0.V), Y: plano(p0.Y), W: plano(p0.W), centros: plano(p0.centros), u: p0.u_ini }, ITERS);
motor.destino(...tr.obj);
if (process.env.WDU) motor.wdu = +process.env.WDU; if (process.env.WREU) (typeof motor !== 'undefined' ? motor : m).wreu = +process.env.WREU; if (process.env.SUAVE === '0') motor.suavizar = false;
const giros = [], disps = []; let Yant = null, dirAnt = [null, null, null];
const GUARDA = process.env.GUARDA; const tray = [];
const ms = []; let fin = null; let molestias = 0, decisiones = 0;
for (let k = 0; k < 280; k++) {
  if (Yant) for (let j = 0; j < 3; j++) { const dx = motor.Y[2*j]-Yant[2*j], dy = motor.Y[2*j+1]-Yant[2*j+1]; if (Math.hypot(dx, dy) > 1) { const d = Math.atan2(dy, dx); if (dirAnt[j] !== null) { let g = Math.abs(d - dirAnt[j]); if (g > Math.PI) g = 2*Math.PI - g; giros.push(g * 180 / Math.PI); } dirAnt[j] = d; } }
  Yant = motor.Y.slice();
  { const X = motor.X, n = X.length / 2; let cx = 0, cy = 0; for (let i = 0; i < n; i++) { cx += X[2*i]; cy += X[2*i+1]; } cx /= n; cy /= n; let v = 0; for (let i = 0; i < n; i++) v += (X[2*i]-cx)**2 + (X[2*i+1]-cy)**2; disps.push(Math.sqrt(v / n)); }
  const r = motor.paso(false, k % CADA === 0); if (r.ms) ms.push(r.ms);
  if (GUARDA) tray.push({ X: [...motor.X], Y: [...motor.Y], roles: r.roles.map((q) => q.destino) });
  // ¿algún perro dentro de la zona (radio + 50) del grupo de otro perro con grupo distinto?
  if (r.roles) { decisiones++; const cs = r.roles.map((ro) => ro.grupo);
    for (let j = 0; j < 3; j++) for (let q = 0; q < 3; q++) { if (j === q || cs[j] === cs[q]) continue;
      const c = r.centrosGrupo && r.centrosGrupo[q]; if (!c) continue;
      if (Math.hypot(motor.Y[2 * j] - c[0], motor.Y[2 * j + 1] - c[1]) < c[2] + 50) molestias++; } }
  if (motor.dentro() === motor.X.length / 2) { fin = motor.t; break; }
  if (false) console.log(`t=${motor.t.toFixed(0)} dentro ${motor.dentro()}  ${r.ms.toFixed(0)} ms`);
}
ms.sort((a, b) => a - b);
if (GUARDA) fs.writeFileSync(GUARDA, JSON.stringify(tray));
console.log(JSON.stringify({ disp_media: +(disps.reduce((a, b) => a + b, 0) / Math.max(1, disps.length)).toFixed(1), giro_medio: +(giros.reduce((a, b) => a + b, 0) / Math.max(1, giros.length)).toFixed(1), molestias_por_decision: +(molestias / Math.max(1, decisiones)).toFixed(3), dentro: motor.dentro(), t_fin: fin, ms_mediana: +ms[ms.length >> 1].toFixed(1), ms_p95: +ms[Math.floor(ms.length * 0.95)].toFixed(1) }));
