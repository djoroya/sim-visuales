// Series cada 10 min de las estrategias principales → tmp/serie.json (para las figuras).
//   node js/serie.mjs
import fs from "node:fs";
import { simula, cerradas, motor, cera, bimetal } from "./experimento.mjs";
import { HOJA } from "./lamina.js";
const casos = {
  cerradas, motor: motor(false, 22), cera: cera(22),
  bimetal: bimetal(HOJA, { r: 4 }),                                          // 0,4 mm, blanca, plana a 18 °C, 4 × área
  bimetal_fina: bimetal({ ...HOJA, s: 0.2e-3 }, { r: 2 }),                   // 0,2 mm: el viento la levanta
  bimetal_negra: bimetal({ ...HOJA, alfa: 0.9 }, { r: 4 }),
};
const out = {};
for (const [n, e] of Object.entries(casos)) {
  const r = simula(e, { serie: true });
  out[n] = { serie: r.serie, h30: r.h30, h32dia: r.h32dia, h10: r.h10, fruto: r.fruto, co2: r.co2, apMedia: r.apMedia, Tmax: r.Tmax };
  console.log(n.padEnd(14), "h>30", r.h30.toFixed(0), "h>32 día", r.h32dia.toFixed(0), "h<10", r.h10.toFixed(0), "fruto", r.fruto.toFixed(0));
}
fs.writeFileSync("tmp/serie.json", JSON.stringify(out));
