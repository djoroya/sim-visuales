// Supuestos de los equipos, compartidos por el visor y las campañas comparadas.
export const EQUIPOS = { caldera: 'caldera de gas', bomba: 'bomba de calor', electrico: 'calefactor eléctrico' };
export const cop = (temperaturaExterior) => Math.min(Math.max(2 + 0.1 * temperaturaExterior, 1.5), 4.5);
export function potenciaRecursos(calor, equipo, temperaturaExterior) {
  if (equipo === 'electrico') return { gas: 0, electrica: calor };
  return equipo === 'bomba'
    ? { gas: 0, electrica: calor / cop(temperaturaExterior) }
    : { gas: calor / 0.9, electrica: calor * 0.015 };
}

// Contabilidad del visor por intervalos; el arranque adicional solo se cobra si se especifica.
export function acumulaRecursos(e, { calor, co2 = 0, equipo, exterior, segundos = 60, arranqueWh = 0 }) {
  const p = potenciaRecursos(calor, equipo, exterior), activa = calor > 1;
  if (activa && !e.activaAnterior) {
    e.arranques = (e.arranques || 0) + 1;
    const extra = Math.max(0, arranqueWh) / 1000;
    e.electrica += extra; e.electricaArranques = (e.electricaArranques || 0) + extra;
  }
  e.activaAnterior = activa;
  e.horasActiva = (e.horasActiva || 0) + (activa ? segundos / 3600 : 0);
  e.calor += calor * segundos / 3.6e6;
  e.gas += p.gas * segundos / 3.6e6;
  e.electrica += p.electrica * segundos / 3.6e6;
  e.co2 += co2 * segundos;
}

export function acumulaMovimiento(e, nombre, posicion, whCarrera = 0) {
  const clave = `posicion_${nombre}`, anterior = e[clave] ?? 0;
  const energia = Math.abs(posicion - anterior) * Math.max(0, whCarrera) / 1000;
  e[clave] = posicion;
  e.electrica += energia;
  const contador = `electrica_${nombre}`; e[contador] = (e[contador] || 0) + energia;
}
