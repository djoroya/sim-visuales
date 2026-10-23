// Motor puro, utilizable en un Worker y en las pruebas de Node.
import { creaClima, AJUSTES, actuadores } from './ges.js';
import { derivadas, estadoInicial, I, AGUA, balanceAgua } from './agua.js';
import { potenciaRecursos } from './recursos.js';
import { pasoROS2 } from './integrador.js';
const DIA = 86400, H = 60;
const EN = { calor: 29, gas: 30, electrica: 31, co2: 32 };
export const POLITICAS = [
  { nombre: 'A · Sin calefacción', calefaccion: false, dia: 18, noche: 14, ventanas: 25, equipo: 'caldera', co2: 0, riego: 'auto', dosis: 4, desde: 0, hasta: 24 },
  { nombre: 'B · Clima regulado', calefaccion: true, dia: 18, noche: 16, ventanas: 26, equipo: 'bomba', co2: 0, riego: 'auto', dosis: 4, desde: 0, hasta: 24 },
  { nombre: 'C · Clima y CO₂', calefaccion: true, dia: 18, noche: 16, ventanas: 26, equipo: 'bomba', co2: 5, riego: 'auto', dosis: 6, desde: 0, hasta: 24 },
];
function numero(v, min, max, nombre) {
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${nombre}: debe estar entre ${min} y ${max}.`);
}
export function validaPolitica(p) {
  if (!p.nombre?.trim()) throw new Error('Pon un nombre a cada política.');
  for (const k of ['dia', 'noche']) numero(p[k], 5, 25, 'Consigna de calefacción');
  numero(p.ventanas, 15, 35, 'Consigna de ventanas'); numero(p.co2, 0, 10, 'Inyección de CO₂');
  if (p.sombreo != null) numero(p.sombreo, 0, 100, 'Cierre de la pantalla');
  if (p.aperturaVentanas != null) numero(p.aperturaVentanas, 0, 100, 'Apertura de ventanas');
  if (p.sombreoModo && !['retirada','fijo','auto'].includes(p.sombreoModo)) throw new Error('Modo de sombreo desconocido');
  if (p.ventanasModo && !['auto','manual'].includes(p.ventanasModo)) throw new Error('Modo de ventanas desconocido');
  numero(p.dosis, 0, 12, 'Dosis de riego'); numero(p.desde, 0, 23, 'Inicio del riego');
  numero(p.hasta, 1, 24, 'Fin del riego');
  if (!Number.isInteger(p.desde) || !Number.isInteger(p.hasta) || p.hasta <= p.desde) throw new Error('El riego debe terminar después de empezar, en horas enteras del mismo día.');
  if (!['auto','manual','apagado'].includes(p.riego) || !['caldera','bomba','electrico'].includes(p.equipo)) throw new Error('Modo de control desconocido.');
}
export function ajustesPolitica(p, t, latitud) {
  const hora = ((t / 3600) % 24 + 24) % 24, dia = hora >= 6 && hora < 20;
  const riega = hora >= p.desde && hora < p.hasta;
  return { ...AJUSTES, latitud, calefaccion: p.calefaccion, T_sp_calef: 273.15 + (dia ? p.dia : p.noche),
    T_sp_vent: 273.15 + p.ventanas, ventanasModo: p.ventanasModo ?? 'auto', aperturaVentanas: p.aperturaVentanas ?? 0, sombreoModo: p.sombreoModo ?? 'retirada', sombreo: p.sombreo ?? 50, added_CO2: p.co2, horarioCO2: [6, 20], equipo: p.equipo,
    riego: p.riego, dosisRiego: riega ? p.dosis * 24 / (p.hasta - p.desde) : 0 };
}
export function metricas(y, frutoInicial, fraccion, tarifas) {
  const fruto = (y[15] - frutoInicial) * AGUA.areaCultivo;
  const fresco = fruto / fraccion;
  const agua = y[I.riego], gas = y[EN.gas], electrica = y[EN.electrica], co2 = y[EN.co2];
  const coste = agua / 1000 * tarifas.agua + gas * tarifas.gas + electrica * tarifas.electrica + co2 * tarifas.co2;
  return { fruto, fresco, agua, drenaje: y[I.drenaje], transpiracion: y[I.transpiracion],
    calor: y[EN.calor], gas, electrica, energia: gas + electrica, co2, coste,
    litrosKg: fresco > 1e-6 ? agua / fresco : null,
    kwhKg: fresco > 1e-6 ? (gas + electrica) / fresco : null,
    costeKg: fresco > 1e-6 ? coste / fresco : null };
}
export function simulaCampana(datos, config, politica, progreso = () => {}) {
  validaPolitica(politica);
  numero(config.dias, 1, 130, 'Duración');
  if (!Number.isInteger(config.dias)) throw new Error('Elige un número entero de días.');
  numero(config.fraccion, 0.01, 0.2, 'Fracción de conversión a fresco');
  for (const k of ['agua', 'gas', 'electrica', 'co2']) numero(config.tarifas[k], 0, 1000, `Tarifa de ${k}`);
  const clima = creaClima(datos), inicio = config.inicio, fin = inicio + config.dias * DIA;
  if (!Number.isFinite(inicio) || inicio % DIA !== 0 || inicio < (datos.t0 || 0) || fin > clima.fin) {
    throw new Error('No hay clima disponible para todo ese periodo. Cambia la fecha inicial o reduce los días.');
  }
  let y = new Float64Array(33); y.set(estadoInicial(clima, inicio));
  const inicial = Array.from(y), aguaInicial = y[21] + y[22];
  const serie = [], latitud = datos.latitud ?? 53.193583;
  let tempHoras = 0, horasEstres = 0;
  const anota = (t) => serie.push({ dia: (t - inicio) / DIA, ...metricas(y, inicial[15], config.fraccion, config.tarifas) });
  anota(inicio);
  for (let t = inicio; t < fin; t += H) {
    // Las políticas cambian en fronteras de minuto. Se mantiene la decisión durante el paso,
    // evitando que una etapa ROS2 use la política del minuto siguiente en una discontinuidad.
    const aj = ajustesPolitica(politica, t + H / 2, latitud);
    const rhs = (ti, yi) => {
      const d = new Float64Array(33); d.set(derivadas(ti, yi, clima, aj));
      // Mismo horario congelado que el resto de la política en este minuto.
      const [q] = actuadores(ti, yi, aj);
      const co2 = actuadores(t + H / 2, yi, aj)[1];
      const energia = potenciaRecursos(q, politica.equipo, clima(ti)[0]);
      d[29] = q / 3.6e6; d[30] = energia.gas / 3.6e6; d[31] = energia.electrica / 3.6e6; d[32] = co2;
      return d;
    };
    // Congelar también el interruptor de CO₂, conservando el mismo caudal en el modelo y contador.
    const activoCO2 = (t + H / 2) % DIA >= 6 * 3600 && (t + H / 2) % DIA < 20 * 3600;
    aj.added_CO2 = activoCO2 ? politica.co2 : 0; aj.horarioCO2 = [0, 24];
    y = pasoROS2(rhs, t, y, H);
    if (!y.every(Number.isFinite) || y[21] < -1e-5 || y[22] < -1e-5) throw new Error(`La simulación de ${politica.nombre} ha salido de su rango numérico. Revisa la política.`);
    const f = {}; derivadas(t + H, y, clima, aj, f);
    tempHoras += (y[1] - 273.15) * H / 3600;
    if (f.factor_hidrico < 0.99) horasEstres += H / 3600;
    if ((t + H - inicio) % DIA === 0) { anota(t + H); progreso((t + H - inicio) / (fin - inicio)); }
  }
  const residuoAgua = balanceAgua(y, aguaInicial);
  if (Math.abs(residuoAgua) > 1e-3) throw new Error('El balance de agua no ha cerrado con la tolerancia requerida.');
  return { politica: { ...politica }, ...metricas(y, inicial[15], config.fraccion, config.tarifas),
    temperaturaMedia: tempHoras / (config.dias * 24), horasEstres, residuoAgua, serie,
    estadoInicial: inicial, estadoFinal: Array.from(y) };
}
