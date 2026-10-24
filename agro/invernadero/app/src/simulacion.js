// La simulación: el modelo avanza en tiempo real (pasos de 60 s con el integrador implícito),
// guarda una muestra cada 10 minutos y expone el estado y los flujos del último paso.
import { useEffect, useRef, useState, useCallback } from "react";
import { creaClima, actuadores, AJUSTES } from "./modelo/ges.js";
import { estadoInicial, derivadas } from "./modelo/agua.js";
import { pasoROS2 } from "./modelo/integrador.js";

const T_K = 273.15, PASO = 60, MUESTRA = 600, DIAS_HISTORIAL = 4, DIAS_CULTIVO = 130;

// Racimos de tomate: una capa visual encima del modelo, que solo da la masa total de fruto (C_fruit).
// Lo que crece C_fruit se reparte entre los racimos que aún engordan; cada racimo cuenta los
// grados-día (base 0 °C, con la temperatura de las hojas) desde que nace, y madura de verde a rojo
// entre 750 y 1000 °C·día. Sale un racimo nuevo cada 140 °C·día (uno por semana a 20 °C).
// Energía: el modelo da el calor que entra al aire; cómo se produce lo elige el visor.
//   caldera de gas: gas = calor / 0,90; eléctrica = bomba de circulación, 1,5 % del calor
//   bomba de calor: eléctrica = calor / COP, con COP = 2 + 0,1·T_ext (entre 1,5 y 4,5)
import { acumulaRecursos, acumulaMovimiento } from "./modelo/recursos.js";
export { EQUIPOS, cop } from "./modelo/recursos.js";
function acumulaEnergia(st, aj, t, y) {
  const [calor, co2] = actuadores(t, y, aj);
  acumulaRecursos(st.energia, { calor, co2, equipo: aj.equipo, exterior: st.clima(t)[0], segundos: PASO, arranqueWh: aj.arranqueWh });
  const f = {}; derivadas(t, y, st.clima, aj, f);
  acumulaMovimiento(st.energia, 'ventanas', f.apertura, aj.motorVentanasWh);
  acumulaMovimiento(st.energia, 'pantalla', f.sombreo_cierre, aj.motorPantallaWh);
}

export const RACIMOS = { cadaGD: 140, engordaHasta: 800, maduraDesde: 750, maduroEn: 1000 };
function actualizaRacimos(st) {
  const y = st.y, dt = MUESTRA / 86400, gd = Math.max(y[2] - T_K, 0) * dt;
  for (const r of st.racimos) r.gd += gd;
  st.gdNuevo += gd;
  const crece = Math.max(y[15] - st.frutoAnterior, 0); st.frutoAnterior = y[15];
  if (st.gdNuevo >= RACIMOS.cadaGD && crece > 0) { st.racimos.push({ masa: 0, gd: 0, n: st.racimos.length }); st.gdNuevo = 0; }
  const jovenes = st.racimos.filter((r) => r.gd < RACIMOS.engordaHasta);
  if (crece > 0 && !jovenes.length) { const r = { masa: 0, gd: 0, n: st.racimos.length }; st.racimos.push(r); jovenes.push(r); st.gdNuevo = 0; }
  for (const r of jovenes) r.masa += crece / jovenes.length;
}

// dos juegos de datos de tiempo: el de HortiMED (Zenodo, 2018) y el de muestra del modelo GES (Inglaterra)
export const TIEMPOS = {
  hortimed: { nombre: "HortiMED 2018", archivo: "datos/tiempo-hortimed.json", anio: 2018,
    inicios: [[47, "febrero"], [105, "abril"], [166, "junio"], [196, "julio"]] },
  ges: { nombre: "Inglaterra (GES)", archivo: "datos/tiempo.json", anio: 2021,
    inicios: [[15, "enero"], [105, "abril"], [196, "julio"], [288, "octubre"]] },
};

export function useSimulacion() {
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null), [recarga, setRecarga] = useState(0);
  const [vista, setVista] = useState(null);          // lo que se dibuja (se actualiza ~20 veces por segundo)
  const [enMarcha, setEnMarcha] = useState(true);
  // ?calefaccion=1&co2=5&inicio=15&velocidad=24 en la URL: para enlazar un caso concreto
  const par = new URLSearchParams(location.search);
  const [velocidad, setVelocidad] = useState(+(par.get("velocidad") || 3));     // horas simuladas por segundo
  const [ajustes, setAjustes] = useState({ equipo: ["bomba", "caldera", "electrico"].includes(par.get("equipo")) ? par.get("equipo") : "electrico", arranqueWh: 0, motorVentanasWh: 0, motorPantallaWh: 0, ventanasModo: "auto", aperturaVentanas: 0, sombreoModo: "retirada", sombreo: 50, riego: "auto", dosisRiego: 4, ventilacion: 25, calefaccion: par.get("calefaccion") === "1", consignaCalef: 16, co2: +(par.get("co2") || 0) });
  // ?tiempo=ges: los datos de tiempo de muestra del modelo original
  const [tiempo, setTiempoBase] = useState(TIEMPOS[par.get("tiempo")] ? par.get("tiempo") : "hortimed");
  const cercano = (k, dia) => TIEMPOS[k].inicios.reduce((a, b) => (Math.abs(b[0] - dia) < Math.abs(a[0] - dia) ? b : a))[0];
  const [inicio, setInicio] = useState(() => cercano(TIEMPOS[par.get("tiempo")] ? par.get("tiempo") : "hortimed", +(par.get("inicio") || 105)));   // día del año en que empieza (por defecto, mediados de abril)
  const [latitud, setLatitud] = useState(null);
  const [rango, setRango] = useState(null);          // primer y último instante con datos de tiempo (s)
  const s = useRef({ clima: null, t: 0, y: null, historial: [], cultivo: [], flujos: {}, ultimaVista: 0 });
  const setTiempo = (k) => {                       // al cambiar de datos, el inicio pasa al mes más parecido
    setInicio(cercano(k, inicio));
    setTiempoBase(k);
  };

  const aj = useCallback(() => ({ ...AJUSTES, arranqueWh: ajustes.arranqueWh, motorVentanasWh: ajustes.motorVentanasWh, motorPantallaWh: ajustes.motorPantallaWh, ventanasModo: ajustes.ventanasModo, aperturaVentanas: ajustes.aperturaVentanas, sombreoModo: ajustes.sombreoModo, sombreo: ajustes.sombreo, riego: ajustes.riego, dosisRiego: ajustes.dosisRiego, T_sp_vent: ajustes.ventilacion + T_K, calefaccion: ajustes.calefaccion, T_sp_calef: ajustes.consignaCalef + T_K, added_CO2: ajustes.co2, equipo: ajustes.equipo,
    ...(latitud != null && { latitud }) }), [ajustes, latitud]);

  const reinicia = useCallback((dia) => {
    const st = s.current; if (!st.clima) return;
    // ?hora=13: empieza a esa hora (para enlazar o capturar un momento concreto)
    const hora = +(new URLSearchParams(location.search).get("hora") ?? 10);   // por defecto, a media mañana
    st.t = dia * 86400 + hora * 3600; st.inicio = st.t; st.y = estadoInicial(st.clima, st.t); st.historial = [];
    st.cultivo = []; st.energia = { calor: 0, gas: 0, electrica: 0, co2: 0 }; st.racimos = []; st.gdNuevo = RACIMOS.cadaGD; st.frutoAnterior = st.y[15];
    // un primer paso para tener flujos que dibujar
    st.flujos = {}; derivadas(st.t, st.y, st.clima, aj(), st.flujos); muestrea(st);
    setVista(foto(st));
  }, [aj]);

  // Carga con cancelación: un cambio rápido de clima no puede reponer una respuesta antigua.
  useEffect(() => {
    const controller = new AbortController();
    setListo(false); setVista(null); setErrorCarga(null);
    fetch(TIEMPOS[tiempo].archivo, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('No se pudo descargar el clima'); return r.json(); })
      .then((d) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(d.horas) || d.horas.length < 2) throw new Error('Datos de clima incompletos');
        s.current.clima = creaClima(d); setLatitud(d.latitud ?? null);
        setRango({ ini: d.t0 || 0, fin: s.current.clima.fin }); setListo(true);
      })
      .catch((e) => { if (e.name !== 'AbortError') setErrorCarga('No se ha podido cargar el clima. Reintenta la descarga.'); });
    return () => controller.abort();
  }, [tiempo, recarga]);
  useEffect(() => { if (listo) reinicia(inicio); }, [listo, inicio, latitud]);   // eslint-disable-line react-hooks/exhaustive-deps

  // bucle
  useEffect(() => {
    if (!listo || !enMarcha) return;
    let raf, anterior = performance.now(), acumulado = 0;
    const f = (t, y) => derivadas(t, y, s.current.clima, ajRef.current);
    const bucle = (ahora) => {
      const st = s.current, dt = Math.min((ahora - anterior) / 1000, 0.1); anterior = ahora;
      acumulado += dt * velocidad * 3600;
      let pasos = 0;
      if (st.t + PASO > st.clima.fin) { setEnMarcha(false); return; }   // se acabaron los datos de tiempo
      while (acumulado >= PASO && pasos < 600 && st.t + PASO <= st.clima.fin) {
        acumulaEnergia(st, ajRef.current, st.t, st.y);
        st.y = pasoROS2(f, st.t, st.y, PASO); st.t += PASO; acumulado -= PASO; pasos++;
        if (st.t % MUESTRA === 0) { st.flujos = {}; derivadas(st.t, st.y, st.clima, ajRef.current, st.flujos); muestrea(st); actualizaRacimos(st); }
      }
      if (ahora - st.ultimaVista > 50) { st.flujos = {}; derivadas(st.t, st.y, st.clima, ajRef.current, st.flujos); st.ultimaVista = ahora; setVista(foto(st)); }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [listo, enMarcha, velocidad]);

  // los ajustes se leen en cada paso sin reiniciar el bucle
  const ajRef = useRef(aj()); useEffect(() => { ajRef.current = aj(); }, [aj]);

  // Los actuadores y sus flujos también responden cuando se editan con el visor en pausa.
  useEffect(() => {
    const st = s.current;
    if (!listo || !st.y) return;
    st.flujos = {}; derivadas(st.t, st.y, st.clima, aj(), st.flujos); setVista(foto(st));
  }, [aj, listo]);

  // latitud: la de los datos, o la de GES si no la traen
  return { listo, errorCarga, reintentaCarga: () => setRecarga((n) => n + 1), tiempo, setTiempo, rango, latitud: latitud ?? 53.193583, vista, enMarcha, setEnMarcha, velocidad, setVelocidad, ajustes, setAjustes, inicio, setInicio, reinicia: () => { reinicia(inicio); setEnMarcha(true); } };
}

function muestrea(st) {
  const f = st.flujos, y = st.y;
  st.historial.push({ t: st.t, T_ext: f.T_ext, T_int: y[1] - T_K, T_veg: y[2] - T_K, HR_int: f.HR_int, HR_ext: f.HR_ext, CO2: f.CO2_ppm,
    aguaSustrato: y[21] / 250, aguaPlantas: y[22] / 250, riego: f.agua_riego * 3600, transpiracion: f.vapor_transpiracion * 3600, hidratacion: 100 * y[22] / f.agua_objetivo,
    sol: f.sol_exterior / 500, fruto: y[15] * 1000, calef: f.calefaccion / 1000, renov: f.renovaciones_h, co2iny: f.co2_inyeccion * 3600 });
  const corte = st.t - DIAS_HISTORIAL * 86400;
  while (st.historial.length && st.historial[0].t < corte) st.historial.shift();
  // el cultivo cambia despacio: una muestra por hora y una ventana larga
  if (st.t % 3600 === 0 || !st.cultivo.length) {
    st.cultivo.push({ t: st.t, fruto: y[15] * 1000, hojas: y[16] * 1000, tallo: y[17] * 1000 });
    while (st.cultivo.length && st.cultivo[0].t < st.t - DIAS_CULTIVO * 86400) st.cultivo.shift();
  }
}

const foto = (st) => ({ t: st.t, y: Array.from(st.y), flujos: { ...st.flujos }, historial: st.historial.slice(), cultivo: st.cultivo.slice(), inicio: st.inicio, energia: { ...st.energia }, racimos: (st.racimos || []).map((r) => ({ ...r })) });

/**
 * Una foto al día (a la misma hora) de una campaña entera, calculada de un tirón y sin React: el
 * bucle del carrusel de djoroya.com la usa para ver crecer las plantas y madurar los racimos.
 * Ajustes: los de por defecto del visor (ventilación a 25 °C, sin calefacción ni CO₂).
 */
export async function fotosCampana({ tiempo = "hortimed", inicio = 105, dias = 72, hora = 12 } = {}) {
  const d = await (await fetch(TIEMPOS[tiempo].archivo)).json();
  const clima = creaClima(d);
  const aj = { ...AJUSTES, arranqueWh: 0, motorVentanasWh: 0, motorPantallaWh: 0, ventanasModo: "auto", aperturaVentanas: 0, sombreoModo: "retirada", sombreo: 50,
    riego: "auto", dosisRiego: 4, T_sp_vent: 25 + T_K, calefaccion: false, T_sp_calef: 16 + T_K, added_CO2: 0, equipo: "electrico", ...(d.latitud != null && { latitud: d.latitud }) };
  const st = { clima, t: inicio * 86400 + hora * 3600, historial: [], cultivo: [], flujos: {}, energia: { calor: 0, gas: 0, electrica: 0, co2: 0 }, racimos: [], gdNuevo: RACIMOS.cadaGD };
  st.inicio = st.t; st.y = estadoInicial(clima, st.t); st.frutoAnterior = st.y[15];
  const f = (t, y) => derivadas(t, y, clima, aj);
  const fotos = [];
  for (let k = 0; k < dias; k++) {
    const fin = st.inicio + k * 86400;
    while (st.t < fin) {
      st.y = pasoROS2(f, st.t, st.y, PASO); st.t += PASO;
      if (st.t % MUESTRA === 0) { st.flujos = {}; derivadas(st.t, st.y, clima, aj, st.flujos); muestrea(st); actualizaRacimos(st); }
    }
    st.flujos = {}; derivadas(st.t, st.y, clima, aj, st.flujos); fotos.push(foto(st));
  }
  return { fotos, latitud: d.latitud ?? 53.193583 };
}
