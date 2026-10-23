import assert from 'node:assert/strict';
import { GRAFOS_FLUJOS, describeFlujo } from '../src/modelo/grafo-flujos.js';
const { agua, energia, carbono } = GRAFOS_FLUJOS;
for (const g of Object.values(GRAFOS_FLUJOS)) {
  const ids = new Set(g.nodos.map((n) => n.id));
  assert.equal(ids.size, g.nodos.length);
  assert.equal(new Set(g.flujos.map((f) => f.id)).size, g.flujos.length);
  for (const f of g.flujos) assert.ok(ids.has(f.de) && ids.has(f.a), 'extremos conectados a nodos existentes');
}
const evap = agua.flujos.find((f) => f.id === 'sustrato-aire');
assert.equal(evap.reversible, true);
assert.deepEqual(describeFlujo(agua, evap, { vapor_evaporacion: -0.001 }), { valor: 3.6, de: 'Aire interior', a: 'Sustrato' });
const ventilacion = energia.flujos.find((f) => f.id === 'aire-exterior');
assert.equal(ventilacion.reversible, true);
assert.deepEqual(describeFlujo(energia, ventilacion, { ventilacion: -2000 }), { valor: 2, de: 'Exterior / cielo', a: 'Aire interior' });
assert.equal(agua.flujos.find((f) => f.id === 'riego-sustrato').reversible, false);
assert.equal(energia.flujos.find((f) => f.id === 'calef-aire').reversible, false);
assert.equal(energia.flujos.find((f) => f.id === 'sol-cultivo').reversible, false);
const fotosintesis = carbono.flujos.find((f) => f.id === 'aire-reserva');
assert.equal(describeFlujo(carbono, fotosintesis, { carbono_fotosintesis: 0.001 }).valor, 3.6);
assert.equal(describeFlujo(carbono, fotosintesis, { carbono_fotosintesis: -0.001 }).de, 'Reserva');
assert.equal(describeFlujo(carbono, fotosintesis, {}).valor, 0);
console.log('OK: reversibilidad, sentido neto, unidades, intercambio de carbono y conexiones válidas.');
