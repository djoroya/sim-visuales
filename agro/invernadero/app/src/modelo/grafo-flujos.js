// Intercambios principales del modelo. La reversibilidad describe el mecanismo,
// no el signo de una muestra. El valor positivo sigue de → a.
const nodo = (id, nombre, x, y, tipo = 'estado') => ({ id, nombre, x, y, tipo });
const flujo = (id, de, a, nombre, claves, reversible = false, rodea = false) => ({ id, de, a, nombre, claves, reversible, rodea });
export const GRAFOS_FLUJOS = {
  energia: { color: '#f59e0b', unidad: 'kW', factor: 0.001,
    nodos: [nodo('sol','Sol',0,60,'exterior'), nodo('calef','Calefacción',0,240,'control'), nodo('cultivo','Cultivo',245,60), nodo('aire','Aire interior',245,240), nodo('cubierta','Cubierta',490,60), nodo('exterior','Exterior / cielo',490,240,'exterior')],
    flujos: [
      flujo('sol-cultivo','sol','cultivo','Calor solar en el cultivo',['sol_vegetacion']),
      flujo('sol-cubierta','sol','cubierta','Calor solar en la cubierta',['sol_cubierta'],false,true),
      flujo('calef-aire','calef','aire','Calefacción',['calefaccion']),
      flujo('cultivo-aire','cultivo','aire','Convección de las hojas',['vegetacion_aire'],true),
      { ...flujo('cultivo-vapor','cultivo','aire','Enfriamiento por transpiración (calor latente)',['transpiracion']), latente: true },
      flujo('cultivo-cubierta','cultivo','cubierta','Radiación térmica del cultivo',['vegetacion_cubierta'],true),
      flujo('aire-cubierta','aire','cubierta','Convección y calor de condensación',['aire_cubierta'],true),
      flujo('aire-exterior','aire','exterior','Calor por ventilación',['ventilacion'],true),
      flujo('cubierta-exterior','cubierta','exterior','Convección al exterior y radiación al cielo',['cubierta_exterior','cubierta_cielo'],true),
    ] },
  agua: { color: '#38d5db', unidad: 'kg/h', factor: 3600,
    nodos: [nodo('riego','Riego',0,60,'control'),nodo('sustrato','Sustrato',245,60),nodo('plantas','Plantas',490,60),nodo('drenaje','Drenaje',0,240,'exterior'),nodo('aire','Aire interior',245,240),nodo('exterior','Exterior',490,240,'exterior')],
    flujos: [
      flujo('riego-sustrato','riego','sustrato','Riego aportado',['agua_riego']),
      flujo('sustrato-plantas','sustrato','plantas','Absorción radicular',['agua_absorcion']),
      flujo('plantas-aire','plantas','aire','Transpiración',['vapor_transpiracion']),
      flujo('sustrato-aire','sustrato','aire','Evaporación / condensación sobre el sustrato',['vapor_evaporacion'],true),
      flujo('aire-exterior','aire','exterior','Vapor por ventilación',['vapor_ventilacion'],true),
      flujo('sustrato-drenaje','sustrato','drenaje','Drenaje sin recuperar',['agua_drenaje']),
    ] },
  carbono: { color: '#72d6b9', unidad: 'kg C/h', factor: 3600,
    nodos: [nodo('inyeccion','Inyección de CO₂',0,0,'control'),nodo('aire','CO₂ del aire',245,0),nodo('exterior','Exterior',490,0,'exterior'),
      {...nodo('reserva','Reserva',245,170), estado: 14},
      {...nodo('fruto','Tomates',0,350), estado: 15}, {...nodo('hojas','Hojas',245,350), estado: 16}, {...nodo('tallo','Tallo',490,350), estado: 17},
      nodo('poda','Poda',245,510,'exterior')],
    flujos: [
      flujo('inyeccion-aire','inyeccion','aire','Carbono aportado como CO₂',['carbono_inyeccion']),
      flujo('aire-exterior','aire','exterior','Carbono por ventilación',['carbono_ventilacion'],true),
      flujo('aire-reserva','aire','reserva','Fotosíntesis: CO₂ convertido en carbohidratos',['carbono_fotosintesis'],true),
      {...flujo('reserva-aire','reserva','aire','Respiración asociada al crecimiento',['carbono_resp_reserva']), rodea: true},
      flujo('reserva-fruto','reserva','fruto','Carbohidratos destinados al fruto',['carbono_fruto']),
      flujo('reserva-hojas','reserva','hojas','Carbohidratos destinados a hojas',['carbono_hojas']),
      flujo('reserva-tallo','reserva','tallo','Carbohidratos destinados al tallo',['carbono_tallo']),
      {...flujo('fruto-aire','fruto','aire','Respiración del fruto: carbono devuelto como CO₂',['carbono_resp_fruto']), rodea: true},
      {...flujo('hojas-aire','hojas','aire','Respiración de las hojas',['carbono_resp_hojas']), retorno: true},
      {...flujo('tallo-aire','tallo','aire','Respiración del tallo',['carbono_resp_tallo']), rodea: true},
      flujo('hojas-poda','hojas','poda','Carbono retirado con la poda',['carbono_poda']),
    ] },
};
export function valorFlujo(flujo, valores) {
  return flujo.claves.reduce((s, k) => s + (k.startsWith('-') ? -(valores[k.slice(1)] ?? 0) : (valores[k] ?? 0)), 0);
}
export function describeFlujo(grafo, flujo, valores) {
  const valor = valorFlujo(flujo, valores), ids = Object.fromEntries(grafo.nodos.map((n) => [n.id,n.nombre]));
  return { valor: Math.abs(valor * grafo.factor), de: ids[valor < 0 ? flujo.a : flujo.de], a: ids[valor < 0 ? flujo.de : flujo.a] };
}
