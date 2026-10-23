// Regresión del bucle scrollbar → ancho → grafo → altura → scrollbar.
// Ejecutar con Playwright en NODE_PATH y la aplicación servida.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  // Playwright oculta las barras por defecto y así no reproduce el fallo.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const app = new URL(process.argv[2] || 'http://127.0.0.1:4381/');
    app.searchParams.set('incrustado', '');
    const marco = new URL('/prueba-marco-invernadero', app);
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.route(marco.href, (route) => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>body{margin:0;padding:8px}iframe{display:block;width:984px;max-width:100%;height:846px;border:0}</style>
      <iframe src="${app.href}"></iframe>
      <script>
        window.alturas = [];
        addEventListener('message', (e) => {
          const iframe = document.querySelector('iframe');
          if (e.origin !== location.origin || e.source !== iframe.contentWindow || e.data?.tipo !== 'altura-invernadero') return;
          window.alturas.push(e.data.altura);
          iframe.style.height = e.data.altura + 'px';
        });
      </script>` }));
    // El tamaño debe ser estable incluso con el módulo 3D todavía pendiente.
    let libera;
    const pendiente = new Promise((resolve) => { libera = resolve; });
    await page.route('**/js/Vista3D-*.js', async (route) => {
      await pendiente;
      await route.fulfill({ contentType: 'application/javascript', body: 'export function Vista3D(){return null}' });
    });
    await page.goto(marco.href, { waitUntil: 'domcontentloaded' });
    const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    await frame.locator('.cargando').waitFor();
    const compruebaEstabilidad = async () => {
      await page.waitForTimeout(800);
      await page.evaluate(() => { window.alturas = []; });
      const anchos = await frame.evaluate(async () => {
        const valores = [];
        for (let i = 0; i < 30; i++) {
          valores.push(document.querySelector('.app').getBoundingClientRect().width);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return [...new Set(valores)];
      });
      assert.equal(anchos.length, 1, 'el ancho no alterna por la barra interior');
      assert.ok((await page.evaluate(() => window.alturas.length)) < 4, 'sin bucle de reajuste del iframe');
      assert.ok(await frame.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'todo el contenido cabe en el iframe');
    };
    await compruebaEstabilidad();
    libera();
    await frame.locator('.cargando').waitFor({ state: 'detached' });
    await compruebaEstabilidad();
    await frame.getByRole('button', { name: 'Carbono', exact: true }).click();
    await compruebaEstabilidad();
    const alturaAntes = await page.locator('iframe').evaluate((el) => el.clientHeight);
    await frame.getByText('Ajustes de arranque', { exact: true }).click();
    await compruebaEstabilidad();
    assert.ok(await page.locator('iframe').evaluate((el) => el.clientHeight) > alturaAntes, 'el iframe crece al desplegar ajustes');
    await page.setViewportSize({ width: 390, height: 844 });
    await compruebaEstabilidad();
    assert.deepEqual(errores, []);
    console.log('OK: barras reales, carga 3D pendiente/completa, cambio de grafo, ajustes y móvil sin oscilaciones ni recortes.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
