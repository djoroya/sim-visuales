// Graba la escena fotograma a fotograma: node anim/grabar.mjs <carpeta> <fps> <ancho> <alto> [lista de tiempos s]
//   (sirve sim-visuales en http://127.0.0.1:4397/; necesita playwright-core y Chromium con SwiftShader)
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, fps = "24", ancho = "1600", alto = "900", lista] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: +ancho, height: +alto }, deviceScaleFactor: 1 })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message)); p.on("console", (m) => m.type() === "error" && console.log("consola:", m.text()));
await p.goto("http://127.0.0.1:4397/agro/termobimetal/anim/escena.html?grabar");
await p.waitForFunction(() => window.__portada, null, { timeout: 60000 }); await p.waitForTimeout(300);
const dur = await p.evaluate(() => window.__portada.DURACION);
const tiempos = lista ? lista.split(",").map(Number) : [...Array(Math.round(dur * +fps)).keys()].map((k) => k / +fps);
let k = 0;
for (const t of tiempos) {
  await p.evaluate((t) => window.__portada.fotograma(t), t);
  await p.screenshot({ path: `${out}/f${String(k++).padStart(4, "0")}.png` });
}
await b.close();
console.log(`${k} fotogramas en ${out}`);
