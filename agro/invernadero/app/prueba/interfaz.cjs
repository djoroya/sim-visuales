// Regresión de edición durante la simulación. Requiere Playwright y la app servida.
// NODE_PATH=<carpeta node_modules con playwright> node prueba/interfaz.cjs [URL]
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 950 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.argv[2] || 'http://127.0.0.1:4381/');
    await page.waitForFunction(() => document.querySelectorAll('.lienzo-dependencias .react-flow__edge').length === 3);
    await page.getByRole('button', { name: 'Pausa', exact: true }).waitFor();
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const root = document.querySelector('.lienzo-dependencias');
      window.pruebaEstabilidad = { retirados: 0, ocultos: 0, encuadres: 0, valorInicial: document.querySelector('.estado-sistema').textContent };
      window.observadorPrueba = new MutationObserver((changes) => {
        for (const m of changes) {
          for (const el of m.removedNodes) if (el.nodeType === 1 && (el.matches('.react-flow__node') || el.querySelector('.react-flow__node'))) window.pruebaEstabilidad.retirados++;
          if (m.type === 'attributes' && m.target.matches('.react-flow__node') && m.target.style.visibility === 'hidden') window.pruebaEstabilidad.ocultos++;
          if (m.type === 'attributes' && m.target.matches('.react-flow__viewport')) window.pruebaEstabilidad.encuadres++;
        }
      });
      window.observadorPrueba.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    });
    // Interacción de teclado real: las pruebas fill/selectOption no detectan pérdida de foco.
    const calefaccion = page.getByLabel('Calefacción °C', { exact: true }); await calefaccion.check();
    const consigna = page.getByLabel('Consigna de calefacción', { exact: true });
    await consigna.click(); await consigna.press('ControlOrMeta+A'); await consigna.press('Backspace');
    await page.waitForTimeout(350); assert.equal(await consigna.inputValue(), '');
    await consigna.pressSequentially('18', { delay: 300 });
    assert.equal(await consigna.inputValue(), '18');
    assert.ok(await consigna.evaluate((el) => el === document.activeElement), 'se conserva el foco');
    const ventanas = page.getByLabel('Consigna de ventanas', { exact: true });
    await ventanas.click(); await ventanas.press('ControlOrMeta+A'); await ventanas.press('Backspace');
    await ventanas.pressSequentially('27.5', { delay: 150 }); await ventanas.press('Tab');
    assert.equal(await ventanas.inputValue(), '27.5');
    const riego = page.getByLabel('Riego', { exact: true });
    await riego.focus(); await riego.press('m'); await riego.press('Enter');
    // La selección nativa puede variar por plataforma; ArrowDown desde auto siempre es manual.
    if (await riego.inputValue() !== 'manual') { await riego.selectOption('auto'); await riego.focus(); await riego.press('ArrowDown'); await riego.press('Enter'); }
    assert.equal(await riego.inputValue(), 'manual');
    const dosis = page.getByLabel('Dosis de riego', { exact: true });
    await dosis.click(); await dosis.press('ControlOrMeta+A'); await dosis.press('Backspace');
    await dosis.pressSequentially('6.5', { delay: 200 }); await dosis.press('Tab');
    assert.equal(await dosis.inputValue(), '6.5');
    await page.getByRole('button', { name: 'Agua', exact: true }).click();
    await page.waitForTimeout(1500);
    assert.match(await page.locator('.grafo-transferencias').textContent(), /67,7/);
    const estable = await page.evaluate(() => {
      window.observadorPrueba.disconnect();
      return { ...window.pruebaEstabilidad, valorFinal: document.querySelector('.estado-sistema').textContent };
    });
    assert.equal(estable.retirados, 0, 'no se recrean los nodos durante la simulación');
    assert.equal(estable.ocultos, 0, 'no se ocultan para medirlos en cada fotograma');
    assert.equal(estable.encuadres, 0, 'no se reencuadra durante la simulación');
    assert.notEqual(estable.valorFinal, estable.valorInicial, 'el estado interno sigue evolucionando');
    // Un borrador fuera de rango se conserva mientras se escribe y se valida al salir.
    await dosis.click(); await dosis.press('ControlOrMeta+A'); await dosis.pressSequentially('99', { delay: 100 });
    assert.equal(await dosis.inputValue(), '99'); await dosis.press('Tab'); assert.equal(await dosis.inputValue(), '12');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const n = document.querySelector('.lienzo-dependencias .react-flow__node');
      return n && n.getBoundingClientRect().width > 250;
    });
    const co2 = page.getByLabel('Inyección de CO₂', { exact: true });
    await co2.click(); await co2.press('ControlOrMeta+A'); await co2.press('Backspace');
    await co2.pressSequentially('2.5', { delay: 200 }); await page.waitForTimeout(400);
    assert.equal(await co2.inputValue(), '2.5');
    assert.ok(await co2.evaluate((el) => el === document.activeElement), 'se conserva el foco también en móvil');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('OK: simulación activa, sin parpadeo ni reencuadres, foco estable, teclado, select, decimales, validación y móvil.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
