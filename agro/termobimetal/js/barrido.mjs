// Barrido en paralelo: node js/barrido.mjs [procesos]  → tmp/barrido.json
// Cada caso es una descripción JSON; los hijos (node js/barrido.mjs --hijo i n) simulan su parte.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { HOJA } from "./lamina.js";

export function casos() {
  const L = [{ tipo: "cerradas" }];
  for (const T0 of [16, 18, 20, 22, 25]) L.push({ tipo: "motor", T0 });
  for (const T0 of [16, 18, 20, 22, 24]) L.push({ tipo: "cera", T0 });
  // la hoja de 0,4 mm (HOJA), que el viento levanta poco y sin tope
  for (const sombra of [false, true]) for (const alfa of sombra ? [0] : [0.1, 0.25, 0.5, 0.9]) for (const T_c of [12, 15, 18, 21]) for (const r of [1.5, 2, 3])
    L.push({ tipo: "bimetal", sombra, alfa, T_c, r });
  return L;
}

async function hijo(i, n) {
  const ex = await import("./experimento.mjs");
  const res = [];
  casos().forEach((c, k) => {
    if (k % n !== i) return;
    const e = c.tipo === "cerradas" ? ex.cerradas : c.tipo === "motor" ? ex.motor(false, c.T0) : c.tipo === "cera" ? ex.cera(c.T0)
      : ex.bimetal({ ...HOJA, sombra: c.sombra, alfa: c.alfa, T_c: c.T_c }, { r: c.r });
    const { serie, ...r } = ex.simula(e);
    res.push({ ...c, ...r });
  });
  process.stdout.write(JSON.stringify(res));
}

if (process.argv[2] === "--hijo") hijo(+process.argv[3], +process.argv[4]);
else {
  const n = +(process.argv[2] || 12), salidas = [];
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((ok, mal) => {
    const p = spawn(process.execPath, [new URL(import.meta.url).pathname, "--hijo", String(i), String(n)]);
    let s = ""; p.stdout.on("data", (d) => (s += d)); p.stderr.on("data", (d) => process.stderr.write(d));
    p.on("close", (code) => (code ? mal(new Error(`hijo ${i}: ${code}`)) : (salidas.push(...JSON.parse(s)), ok())));
  })));
  fs.mkdirSync("tmp", { recursive: true });
  fs.writeFileSync("tmp/barrido.json", JSON.stringify(salidas, null, 1));
  console.log(`${salidas.length} casos en tmp/barrido.json`);
}
