// El rebaño arrinconado en una esquina del campo, con una oveja suelta dentro del corral.
//   node web/prueba/esquina.mjs <x_destino> <y_destino> [semilla]
import crear from "../mpc.js";
import { cargaCoste } from "../js/controlador.js";
import { Motor, corral } from "../js/motor.js";

const obj = [+process.argv[2], +process.argv[3]], semilla = +(process.argv[4] || 1);
let a = semilla * 2654435761 >>> 0;
const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cor = corral(60, 30, 160, 100, "izq", 18);
const n = 80, X = new Float64Array(2 * n);
for (let i = 0; i < n - 1; i++) {                      // rebaño apretado en la esquina de abajo a la izquierda
  const k = i + 0.5, rr = 24 * Math.sqrt(k / n), th = k * Math.PI * (3 - Math.sqrt(5));
  X[2 * i] = Math.max(-284, -258 + rr * Math.cos(th)); X[2 * i + 1] = Math.max(-204, -180 + rr * Math.sin(th));
}
X[2 * (n - 1)] = 125; X[2 * (n - 1) + 1] = 70;        // la oveja suelta, en el corral
const Y = Float64Array.from([-280, -40, -150, -205, 60, -20]);
const coste = await cargaCoste(crear);
const centros = new Float64Array(20); for (let j = 0; j < 10; j++) { const i = Math.floor(r() * n); centros[2 * j] = X[2 * i]; centros[2 * j + 1] = X[2 * i + 1]; }
const m = new Motor(coste, { corral: cor }, { X, V: new Float64Array(2 * n), Y, W: new Float64Array(6), centros }, 30);
m.destino(...obj);
const dist = () => { let s = 0; for (let i = 0; i < n; i++) s += Math.hypot(m.X[2 * i] - obj[0], m.X[2 * i + 1] - obj[1]); return s / n; };
const hitos = {}; let fin = null; const tray = [];
for (let k = 0; k < 240; k++) {
  const rr = m.paso(); if (process.env.GUARDA) tray.push({ X: [...m.X], Y: [...m.Y], d: rr.roles.map((q) => [q.destino, ""]) });
  if (k % 40 === 39) hitos[m.t] = m.enCorral ? m.dentro() : Math.round(dist());
  if (m.enCorral && m.dentro() === n - 0) { fin = m.t; break; }
}
if (process.env.GUARDA) (await import("node:fs")).writeFileSync(process.env.GUARDA, JSON.stringify({ seg: [...cor.seg], obj, tray }));
console.log(JSON.stringify({ obj, enCorral: m.enCorral, final: m.enCorral ? `${m.dentro()}/80 dentro` : `distancia media al destino ${Math.round(dist())}`, t_fin: fin, hitos }));
