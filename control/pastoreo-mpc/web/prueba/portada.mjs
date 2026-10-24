// Una partida completa para el bucle de la portada: tres perros meten el rebaño en un corral.
//   node web/prueba/portada.mjs <escenario> <semilla> <salida.json>
// Mismo arranque que el visor (js/trabajador.js) con semilla fija; guarda cada subfotograma.
import fs from "node:fs";
import crear from "../mpc.js";
import { cargaCoste } from "../js/controlador.js";
import { Motor, corral } from "../js/motor.js";

const ESCENARIOS = {
  izquierda: { corral: corral(60, 30, 160, 100, "izq", 18), obj: [80, 30], ini: [170, -120] },
  arriba: { corral: corral(0, -40, 140, 90, "arr", 18), obj: [0, -50], ini: [-170, -130] },
  estrecha: { corral: corral(120, 0, 120, 120, "izq", 12), obj: [130, 0], ini: [-150, 110] },
};
const [escenario = "izquierda", semilla = "1", salida = "tmp/portada.json"] = process.argv.slice(2);
function azar(s) { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const esc = ESCENARIOS[escenario], r = azar(+semilla), n = 80;
const ini = [esc.ini[0] + 15 * normal(r), esc.ini[1] + 15 * normal(r)];
const X = new Float64Array(2 * n);
for (let i = 0; i < n; i++) { const kk = i + 0.5, rr = 20 * Math.sqrt(kk / n), th = kk * Math.PI * (3 - Math.sqrt(5)); X[2 * i] = ini[0] + rr * Math.cos(th) + 0.8 * normal(r); X[2 * i + 1] = ini[1] + rr * Math.sin(th) + 0.8 * normal(r); }
const ang = r() * 2 * Math.PI, Y = new Float64Array(6);
[0, 0.5, -0.5].forEach((d, j) => { Y[2 * j] = Math.max(-275, Math.min(275, ini[0] + 60 * Math.cos(ang + d))); Y[2 * j + 1] = Math.max(-195, Math.min(195, ini[1] + 60 * Math.sin(ang + d))); });
const centros = new Float64Array(20);
for (let j = 0; j < 10; j++) { const i = Math.floor(r() * n); centros[2 * j] = X[2 * i]; centros[2 * j + 1] = X[2 * i + 1]; }
const coste = await cargaCoste(crear);
const motor = new Motor(coste, esc, { X, V: new Float64Array(2 * n), Y, W: new Float64Array(6), centros }, 30);
motor.destino(...esc.obj);
const fotos = [{ X: [...X], Y: [...Y] }];
let fin = null;
for (let k = 0; k < 400; k++) {
  const res = motor.paso(true, true);
  for (const f of res.fotos) fotos.push({ X: [...f.X], Y: [...f.Y] });
  if (motor.dentro() === n) { fin = motor.t; break; }
}
fs.writeFileSync(salida, JSON.stringify({ escenario, semilla: +semilla, corral: esc.corral, obj: esc.obj, fin, fotos }));
console.log(JSON.stringify({ escenario, semilla: +semilla, fotos: fotos.length, dentro: motor.dentro(), fin }));
