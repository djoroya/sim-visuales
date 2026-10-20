// Cuando la solución óptima usa más conmutaciones que el mínimo genérico (N > n), ¿hay otra
// penalización convexa (pendientes crecientes al azar) que dé una solución exacta con N = n?
import { problema, resuelve } from "../js/she.js";
const nArm = +(process.argv[2] || 5), nU = +(process.argv[3] || 5), PRUEBAS = +(process.argv[4] || 60);
const H = [1]; for (let h = 5; H.length < nArm; h += 2) if (h % 3) H.push(h);
const U = Array.from({ length: nU }, (_, k) => -1 + 2 * k / (nU - 1));
let semilla = 7; const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const Nq = (r) => r.ts.filter((t) => t < Math.PI / 2 - 1e-9).length;
const ok = (r) => Math.max(...r.residuo.map(Math.abs)) < 1e-4;
const base = problema([], H, U);
let casos = 0, recuperados = 0, extra = 0; const ejemplos = [];
let q = null;
for (let i = 1; i <= 220; i++) {
  const m = 0.005 * i, x0 = new Array(base.n).fill(0); x0[0] = m;
  const r = resuelve(base, x0, { q0: q, eps: 1e-7 }); q = ok(r) ? r.q : null;
  if (!ok(r) || Nq(r) <= nArm) continue;
  casos++; extra += Nq(r) - nArm;
  let hallado = null;
  for (let p = 0; p < PRUEBAS && !hallado; p++) {
    // pendientes crecientes al azar (convexa): desplazamiento y saltos positivos
    const pend = [(azar() - 0.5) * 4]; for (let k = 1; k < nU - 1; k++) pend.push(pend[k - 1] + 0.05 + azar() * 2);
    const rp = resuelve(problema([], H, U, { pendientes: pend }), x0, { eps: 1e-7 });
    if (ok(rp) && Nq(rp) === nArm) hallado = pend;
  }
  if (!hallado && process.env.LISTA) console.log("no recuperado m=" + m.toFixed(3) + " Nopt=" + Nq(r));
  if (hallado) { recuperados++; if (ejemplos.length < 3) ejemplos.push({ m, Nopt: Nq(r), pend: hallado.map((v) => +v.toFixed(2)) }); }
}
console.log(`n=${nArm}, ${nU} niveles: ${casos} amplitudes con N > n (media +${(extra / Math.max(casos, 1)).toFixed(1)}); con otra penalización convexa se llega a N = n en ${recuperados} (${(100 * recuperados / Math.max(casos, 1)).toFixed(0)} %)`);
console.log(JSON.stringify(ejemplos));
