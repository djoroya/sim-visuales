// Núcleo JavaScript frente a Python (python/referencia.py): curvas de la celda y pila con escalones de carga.
//   node prueba/compara.mjs [paso_s]          (desde energia/pila-sofc/app)
import fs from "node:fs";
import { punto } from "../src/modelo/celda.js";
import { estadoInicial, pasoRK4, presiones, tension, ATM, H2, O2, N2 } from "../src/modelo/pila.js";
const h = +(process.argv[2] || 0.01);
const leer = (r) => JSON.parse(fs.readFileSync(new URL(r, import.meta.url), "utf8"));
const ref = leer("../../datos/referencia-js.json"), d = leer("../../datos/pila-visor.json");
let fallos = 0;
const informa = (nombre, valor, limite, u) => { const ok = valor <= limite; if (!ok) fallos++; console.log(`${ok ? "✔" : "✘"} ${nombre}: ${valor.toExponential(2)} ${u} (límite ${limite} ${u})`); };

// 1) Celda en régimen permanente
let maxCelda = 0;
for (const c of ref.curvas_celda)
  for (const [I, V] of c.puntos_I_V_conc_ohm_act) maxCelda = Math.max(maxCelda, Math.abs(punto(I, c.T_C + 273.15, c.q_anodo, c.x_H2, c.q_aire, d.celda).V - V));
informa("Celda: tensión frente a Python", maxCelda * 1000, 1e-6, "mV");

// 2) Pila dinámica con escalones de carga
const pila = { N0: d.N0, area: d.area_cm2, T: d.T_K, Va: d.Va_m3, Vc: d.Vc_m3, valvula: d.valvula, K_an: d.K_an, K_cat: d.K_cat, modo: "calibrado", celda: d.celda };
const fr = d.fraccion_combustible, orden = ["H2", "O2", "H2O", "N2", "CO", "CH4", "CO2"];
const qa = orden.map((e) => fr[e] * d.q_combustible_mol_s), qc = new Array(7).fill(0);
qc[O2] = 0.2095 * d.q_aire_mol_s; qc[N2] = 0.7905 * d.q_aire_mol_s;
const escalones = (t) => (t < 5 ? 0 : t < 25 ? 30 : t < 45 ? 45 : 20);
let y = estadoInicial(pila, qa, qc), t = 0, j = 0, maxV = 0, maxP = 0, sumV = 0;
const t0 = performance.now(), pasos = Math.round(60 / h);
for (let k = 0; k <= pasos; k++) {
  t = k * h;
  while (j < ref.serie.length && Math.abs(ref.serie[j].t - t) < h / 2) {
    const s = ref.serie[j], [pa, pc] = presiones(pila, y), v = tension(pila, s.I, qa, pa, pc);
    const dv = Math.abs(v.V - s.V); maxV = Math.max(maxV, dv); sumV += dv;
    for (let i = 0; i < 7; i++) {
      if (s.pa[i] > 1e-6) maxP = Math.max(maxP, Math.abs(pa[i] / ATM - s.pa[i]) / s.pa[i]);
      if (s.pc[i] > 1e-6) maxP = Math.max(maxP, Math.abs(pc[i] / ATM - s.pc[i]) / s.pc[i]);
    }
    j++;
  }
  if (k < pasos) y = pasoRK4(pila, y, h, escalones(t + h / 2), qa, qc);
}
const ms = performance.now() - t0;
console.log(`  60 s simulados con paso ${h} s: ${ms.toFixed(0)} ms (${((ms / 60) * 1000).toFixed(0)} µs por segundo simulado); ${j} puntos comparados`);
informa("Pila: tensión frente a Python (máx)", maxV * 1000, 1, "mV");
console.log(`  media ${((sumV / j) * 1000).toExponential(2)} mV`);
informa("Pila: presiones parciales frente a Python (error relativo máx)", maxP, 1e-3, "");
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo correcto.");
process.exit(fallos ? 1 : 0);
