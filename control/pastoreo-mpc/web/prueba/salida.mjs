// Prueba reproducible de «sacar el rebaño del corral»: 80 ovejas dentro, perros fuera y un
// destino fuera, todo al azar según la semilla.   node web/prueba/salida.mjs <semilla> [escenario]
import crear from "../mpc.mjs";
import { cargaCoste } from "../js/controlador.js";
import { Motor, corral } from "../js/motor.js";

const semilla = +(process.argv[2] || 1), nombre = process.argv[3] || "izquierda";
const ESC = { izquierda: corral(60, 30, 160, 100, "izq", 18), arriba: corral(0, -40, 140, 90, "arr", 18) };
const cor = ESC[nombre];
let a = semilla * 2654435761 >>> 0;
const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const [x0, x1, y0, y1] = cor.caja;
const n = 80, X = new Float64Array(2 * n);
const cx = x0 + 30 + r() * (x1 - x0 - 60), cy = y0 + 25 + r() * (y1 - y0 - 50);
for (let i = 0; i < n; i++) {
  const k = i + 0.5, rr = 22 * Math.sqrt(k / n), th = k * Math.PI * (3 - Math.sqrt(5));
  X[2 * i] = Math.min(x1 - 4, Math.max(x0 + 4, cx + rr * Math.cos(th))); X[2 * i + 1] = Math.min(y1 - 4, Math.max(y0 + 4, cy + rr * Math.sin(th)));
}
const fuera = () => { for (;;) { const x = -260 + 520 * r(), y = -180 + 360 * r(); if (x < x0 - 40 || x > x1 + 40 || y < y0 - 40 || y > y1 + 40) return [x, y]; } };
const Y = Float64Array.from([...fuera(), ...fuera(), ...fuera()]);
const obj = fuera();
const coste = await cargaCoste(crear);
const centros = new Float64Array(20); for (let j = 0; j < 10; j++) { const i = Math.floor(r() * n); centros[2 * j] = X[2 * i]; centros[2 * j + 1] = X[2 * i + 1]; }
const m = new Motor(coste, { corral: cor }, { X, V: new Float64Array(2 * n), Y, W: new Float64Array(6), centros }, 30);
m.destino(...obj);
if (process.env.WDU) m.wdu = +process.env.WDU; if (process.env.WREU) (typeof motor !== 'undefined' ? motor : m).wreu = +process.env.WREU; if (process.env.SUAVE === '0') m.suavizar = false;
const giros = [], disps = []; let Yant = null, dirAnt = [null, null, null];
const hitos = {}; let fin = null; const tray = [];
for (let k = 0; k < 280; k++) {
  if (Yant) for (let j = 0; j < 3; j++) { const dx = m.Y[2*j]-Yant[2*j], dy = m.Y[2*j+1]-Yant[2*j+1]; if (Math.hypot(dx, dy) > 1) { const d = Math.atan2(dy, dx); if (dirAnt[j] !== null) { let g = Math.abs(d - dirAnt[j]); if (g > Math.PI) g = 2*Math.PI - g; giros.push(g * 180 / Math.PI); } dirAnt[j] = d; } }
  Yant = m.Y.slice();
  { const X = m.X, n = X.length / 2; let cx = 0, cy = 0; for (let i = 0; i < n; i++) { cx += X[2*i]; cy += X[2*i+1]; } cx /= n; cy /= n; let v = 0; for (let i = 0; i < n; i++) v += (X[2*i]-cx)**2 + (X[2*i+1]-cy)**2; disps.push(Math.sqrt(v / n)); }
  const rr = m.paso(); if (process.env.GUARDA) tray.push({ X: [...m.X], Y: [...m.Y], d: rr.roles.map((q) => [q.destino, q.sacar || ""]) });
  const dentro = m.enElCorral();
  if (k % 40 === 39) hitos[m.t] = dentro;
  if (dentro === 0) { fin = m.t; break; }
}
if (process.env.GUARDA) (await import("node:fs")).writeFileSync(process.env.GUARDA, JSON.stringify({ seg: [...cor.seg], obj, tray }));
console.log(JSON.stringify({ disp_media: +(disps.reduce((a, b) => a + b, 0) / Math.max(1, disps.length)).toFixed(1), giro_medio: +(giros.reduce((a, b) => a + b, 0) / Math.max(1, giros.length)).toFixed(1), semilla, escenario: nombre, obj: obj.map((v) => Math.round(v)), quedan: m.enElCorral(), t_fin: fin, hitos }));
