// Compara la versión JavaScript con la traza de Python pieza a pieza:
// mapa de distancias, un intervalo de la planta, los parámetros que se mandan al coste
// y la decisión del resolvedor.   node web/prueba/compara.mjs tmp/traza_<esc>_<s>.json
import fs from "node:fs";
import crear from "../mpc.mjs";
import { geodesica, gradiente } from "../js/mapa.js";
import { avanza } from "../js/planta.js";
import { cargaCoste, reduce, asigna, empaqueta, paredesParametro, spg } from "../js/controlador.js";
import { NSEG, NSEGP, VALLA } from "../js/constantes.js";

const tr = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const maxdif = (a, b) => { let m = 0; const fa = a.flat(), fb = b.flat(); for (let i = 0; i < fa.length; i++) m = Math.max(m, Math.abs(fa[i] - fb[i])); return m; };
const plano = (a) => Float64Array.from(a.flat());

// 1. mapa
const seg = tr.seg;                                   // ya incluye la valla
const D = geodesica(seg, tr.obj);
console.log(`mapa:   max|D_js - D_py| = ${maxdif([...D], tr.dmap).toExponential(2)}  (máximo ${Math.max(...tr.dmap).toFixed(0)})`);

// 2. planta: cada intervalo de la traza, desde el estado de Python con su aceleración
const segPerro = [...seg, tr.puerta];
for (const [k, pa] of tr.pasos.entries()) {
  const X = plano(pa.X), V = plano(pa.V), Y = plano(pa.Y), W = plano(pa.W);
  avanza(X, V, Y, W, Float64Array.from(pa.acc), seg, segPerro);
  console.log(`planta ${k}: max|X| ${maxdif([...X], pa.X1).toExponential(2)}  max|Y| ${maxdif([...Y], pa.Y1).toExponential(2)}  max|V| ${maxdif([...V], pa.V1).toExponential(2)}`);
}

// 3. controlador: parámetros y decisión del primer intervalo (y de los siguientes)
const coste = await cargaCoste(crear);
const [gx, gy] = gradiente(D);
const mapa = { D, gx, gy };
const [x0, x1, y0, y1] = tr.caja;
const dentro = (x, y) => x > x0 + 2 && x < x1 - 2 && y > y0 + 2 && y < y1 - 2;
const [segv, actv] = paredesParametro(seg, NSEG), [segpv, actpv] = paredesParametro([tr.puerta], NSEGP);
for (const [k, pa] of tr.pasos.entries()) {
  const Xa = pa.X, Va = pa.V;
  const fuera = Xa.map((q) => !dentro(q[0], q[1]));
  const Xf = plano(Xa.filter((_, i) => fuera[i])), Vf = plano(Va.filter((_, i) => fuera[i]));
  const red = reduce(Xf.length ? Xf : plano(Xa), Vf.length ? Vf : plano(Va), plano(pa.centros));
  const Y = plano(pa.Y), W = plano(pa.W);
  const as = asigna(red.centros, red.peso, Y, pa.previa, mapa, seg);
  const p = empaqueta(coste.NPAR, red, Y, W, as, segv, actv, segpv, actpv, D);
  // cuánto difiere cada bloque de p
  const pp = pa.p;
  const zona = (a, b) => maxdif([...p.slice(a, b)], pp.slice(a, b)).toExponential(1);
  console.log(`decisión ${k}: p estado ${zona(0, 52)} pesos ${zona(52, 62)} roles ${zona(62, 101)} paredes ${zona(101, 151)} mapa ${zona(151, p.length)}`);
  coste.fijaParametros(Float64Array.from(pp));         // con los parámetros de Python, la decisión
  const [u, f] = spg(coste, Float64Array.from(pa.u_ini), 30);
  console.log(`          J_js ${f.toFixed(8)}  J_py ${pa.J.toFixed(8)}  max|u_js - u_py| ${maxdif([...u], pa.u).toExponential(2)}`);
}
