import crear from "../mpc.js";
import { cargaCoste } from "../js/controlador.js";
import { Motor, corral } from "../js/motor.js";
import { avanza } from "../js/planta.js";
const coste = await cargaCoste(crear);
const esc = { corral: corral(60, 30, 160, 100, "izq", 18) };
const n = 80, X = new Float64Array(2 * n);
for (let i = 0; i < n; i++) { X[2 * i] = 170 + 20 * Math.cos(i); X[2 * i + 1] = -120 + 20 * Math.sin(i * 1.3); }
const Y = Float64Array.from([230, -120, 220, -90, 220, -150]);
const m = new Motor(coste, esc, { X, V: new Float64Array(2 * n), Y, W: new Float64Array(6), centros: X.slice(0, 20) }, 30);
m.destino(80, 30);
for (let i = 0; i < 3; i++) m.paso(true);
let t0 = performance.now(); for (let i = 0; i < 10; i++) avanza(m.X, m.V, m.Y, m.W, new Float64Array(6), m.seg, m.segPerro, [], 4);
console.log(`planta: ${((performance.now() - t0) / 10).toFixed(1)} ms por intervalo`);
for (const it of [30, 20, 15]) { m.iters = it; t0 = performance.now(); let s = 0; for (let i = 0; i < 6; i++) s += m.paso(true).ms; console.log(`decisión con ${it} iteraciones: ${(s / 6).toFixed(0)} ms (paso completo ${((performance.now() - t0) / 6).toFixed(0)} ms)`); }
