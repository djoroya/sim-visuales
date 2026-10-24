// Graba los fotogramas de un bucle de portada desde una escena web que expone window.__portada.fotograma(t, opciones).
// node fotogramas.mjs <url> <carpeta> <n> <fps> [opciones JSON] [lista de fotogramas]   (necesita playwright-core)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [url, out, n = '1', fps = '24', opts = '{}', pasos] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 2400, height: 800 }, deviceScaleFactor: 1 })).newPage();
p.on('pageerror', e => console.log('pageerror:', e.message));
await p.goto(url); await p.waitForFunction(() => window.__portada, null, { timeout: 30000 }); await p.waitForTimeout(500);
const lista = pasos ? pasos.split(',').map(Number) : [...Array(+n).keys()];
for (const k of lista) {
  await p.evaluate(([t, o]) => window.__portada.fotograma(t, o), [k / +fps, JSON.parse(opts)]);
  await p.screenshot({ path: `${out}/f${String(k).padStart(4, '0')}.png` });
}
await b.close();
