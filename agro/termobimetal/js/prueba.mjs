// Comprobaciones del modelo de la hoja: node js/prueba.mjs
import fs from "node:fs";
import { factorCalculix, levantaViento, HOJA } from "./lamina.js";
let ok = true;
const t04 = JSON.parse(fs.readFileSync(new URL("../datos/hoja-termica-0.4.json", import.meta.url)));
// la punta que predice la tabla de 0,2 mm reescalada, frente a la que da CalculiX para 0,4 mm
const mm = t04.filas.map((f) => Math.abs((factorCalculix(f.dT, 0.4e-3) / f.factor) * f.z_medio - f.z_medio));
const rel = t04.filas.filter((f) => f.dT >= 7.5).map((f) => Math.abs(factorCalculix(f.dT, 0.4e-3) / f.factor - 1));
console.log(`1. Semejanza ΔT·(b/s)²: la tabla de 0,2 mm reescalada da la punta de la de 0,4 mm con ${Math.max(...mm).toFixed(2)} mm de diferencia máx. (${(100 * Math.max(...rel)).toFixed(1)} % desde 7,5 K)`);
ok &= Math.max(...mm) < 0.5 && Math.max(...rel) < 0.02;
const v = JSON.parse(fs.readFileSync(new URL("../datos/hoja-viento-0.2.json", import.meta.url))).find((r) => r.u === 8 && r.caso.startsWith("cerrada"));
const z = levantaViento({ ...HOJA, s: 0.2e-3, vientoAbre: true }, 8) * 150;
console.log(`2. Viento de 8 m/s sobre la hoja cerrada de 0,2 mm: placa ${z.toFixed(1)} mm, CalculiX ${v.z_con.toFixed(1)} mm`);
ok &= Math.abs(z / v.z_con - 1) < 0.02;
console.log(ok ? "Todo correcto." : "HAY FALLOS.");
process.exit(ok ? 0 : 1);
