import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulaCampana, POLITICAS, ajustesPolitica, metricas } from '../src/modelo/campana.js';
import { actuadores } from '../src/modelo/ges.js';
const datos = JSON.parse(fs.readFileSync(new URL('../public/datos/tiempo-hortimed.json', import.meta.url)));
const config = { inicio: 105 * 86400, dias: 30, fraccion: 0.06, tarifas: { agua: 1, gas: 0.1, electrica: 0.2, co2: 0.3 } };
// Horarios día/noche y dosis diaria concentrada, sin cambiar el agua total aplicada.
const p = { ...POLITICAS[1], riego: 'manual', dosis: 3, desde: 6, hasta: 18 };
assert.equal(ajustesPolitica(p, 12 * 3600, 43).dosisRiego, 6);
assert.equal(ajustesPolitica(p, 2 * 3600, 43).dosisRiego, 0);
assert.equal(ajustesPolitica(p, 2 * 3600, 43).T_sp_calef, 273.15 + p.noche);
assert.equal(ajustesPolitica(p, 12 * 3600, 43).T_sp_calef, 273.15 + p.dia);
const rr = [];
for (const politica of POLITICAS) {
  const r = simulaCampana(datos, config, politica); rr.push(r);
  assert.equal(r.serie.length, config.dias + 1);
  assert.equal(r.serie[0].fresco, 0);
  assert.equal(r.serie.at(-1).fresco, r.fresco);
  assert.ok(Math.abs(r.residuoAgua) < 1e-4);
  assert.ok(Math.abs(r.coste - (r.agua / 1000 + r.gas * 0.1 + r.electrica * 0.2 + r.co2 * 0.3)) < 1e-9);
  assert.ok(Math.abs(r.fresco * config.fraccion - r.fruto) < 1e-12);
  assert.ok(Math.abs(r.fruto - (r.estadoFinal[15] - r.estadoInicial[15]) * 187.5) < 1e-12);
  if (politica.equipo === 'bomba') assert.equal(r.gas, 0);
  console.log(politica.nombre, JSON.stringify({ kgEquivalentes: r.fresco, aguaL: r.agua, kWh: r.energia, co2kg: r.co2, coste: r.coste }));
}
assert.deepEqual(rr[0].estadoInicial, rr[1].estadoInicial);
assert.deepEqual(rr[1].estadoInicial, rr[2].estadoInicial);
assert.equal(rr[0].energia, 0);
assert.equal(rr[0].co2, 0);
assert.ok(Math.abs(rr[2].co2 - 5 * 14 * config.dias) < 1e-5, 'CO₂ 14 h/día, sin error en fronteras');
// Exactitud de la dosis por día; determinismo e independencia de políticas anteriores.
const corto = { ...config, dias: 1 };
const a = simulaCampana(datos, corto, p), b = simulaCampana(datos, corto, p);
assert.deepEqual(a, b);
assert.ok(Math.abs(a.agua - 3 * 250) < 1e-5);
assert.ok(a.gas === 0 && a.electrica > 0);
const caldera = simulaCampana(datos, corto, { ...p, equipo: 'caldera' });
assert.ok(Math.abs(caldera.gas * 0.9 - caldera.calor) < 1e-6);
assert.ok(Math.abs(caldera.electrica - caldera.calor * 0.015) < 1e-6);
const secos = new Float64Array(33); secos[15] = -1;
assert.equal(metricas(secos, 0, 0.06, config.tarifas).litrosKg, null);
assert.throws(() => simulaCampana(datos, { ...config, inicio: 210 * 86400 }, p), /clima disponible/);
assert.throws(() => simulaCampana(datos, { ...config, fraccion: 0 }, p), /Fracción/);
assert.throws(() => simulaCampana(datos, config, { ...p, hasta: 5 }), /terminar después/);
assert.throws(() => simulaCampana(datos, { ...config, dias: 1.5 }, p), /entero/);
console.log('OK: horarios, recursos, producción neta, balance, costes, periodos, determinismo y estado inicial común.');
