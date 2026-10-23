import assert from 'node:assert/strict';
import fs from 'node:fs';
import { creaClima, AJUSTES, derivadas as ges } from '../src/modelo/ges.js';
import { estadoInicial, derivadas, I, AGUA, balanceAgua } from '../src/modelo/agua.js';
import { pasoROS2 } from '../src/modelo/integrador.js';
const clima = creaClima(JSON.parse(fs.readFileSync(new URL('../public/datos/tiempo-hortimed.json', import.meta.url))));
const t0 = 105 * 86400 + 36000;
const ini = estadoInicial(clima, t0), inicial = ini[21] + ini[22];
// El acoplamiento sin estrés conserva las ecuaciones originales, incluso el enfriamiento latente.
const d0 = ges(t0, ini, clima), dw = derivadas(t0, ini, clima);
for (let k = 0; k < 21; k++) assert.equal(dw[k], d0[k]);
// El balance cierra también en seco, encharcado y con condensación nocturna.
for (const ws of [0, 100, 1400, 4000]) for (const wp of [0, 1, ini[22]]) {
  const y = Float64Array.from(ini); y[21] = ws; y[22] = wp;
  const d = derivadas(t0, y, clima);
  assert.ok(Math.abs(d[21] + d[22] - d[23] + d[24] + d[25] + d[26] + d[27]) < 1e-12);
  if (ws === 0) assert.ok(d[21] >= 0);
  if (wp === 0) assert.ok(d[22] >= 0);
}
const resultados = {};
for (const modo of ['auto', 'apagado', 'manual']) {
  let y = Float64Array.from(ini), f = {};
  const aj = { ...AJUSTES, riego: modo, dosisRiego: modo === 'manual' ? 12 : 4, latitud: 43 };
  const rhs = (t, y) => derivadas(t, y, clima, aj);
  for (let t = t0; t < t0 + 30 * 86400; t += 60) {
    y = pasoROS2(rhs, t, y, 60);
    assert.ok(y.every(Number.isFinite), `${modo}: estados finitos`);
    assert.ok(y[21] >= -1e-6 && y[22] >= -1e-6, `${modo}: reservas no negativas`);
    assert.ok(Math.abs(balanceAgua(y, inicial)) < 1e-5, `${modo}: conservación de agua`);
  }
  derivadas(t0 + 30 * 86400, y, clima, aj, f);
  resultados[modo] = { y, f };
  if (modo === 'apagado') assert.equal(y[I.riego], 0);
  if (modo === 'manual') assert.ok(Math.abs(y[I.riego] - 12 * AGUA.area * 30) < 1e-4);
  console.log(modo, JSON.stringify({ riego: y[23], drenaje: y[24], sustrato: y[21], plantas: y[22], estres: f.factor_hidrico, residuo: balanceAgua(y, inicial) }));
}
assert.ok(resultados.apagado.f.factor_hidrico < resultados.auto.f.factor_hidrico);
assert.ok(resultados.apagado.y[15] < resultados.auto.y[15], 'la sequía reduce el crecimiento');
assert.ok(resultados.manual.y[I.drenaje] > 0, 'el exceso drena');
console.log('OK: 30 días por modo, balance, sequía, drenaje y regresión GES.');
