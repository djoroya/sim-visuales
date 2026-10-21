// La simulación: el modelo avanza en tiempo real (pasos de 60 s con el integrador implícito),
// guarda una muestra cada 10 minutos y expone el estado y los flujos del último paso.
import { useEffect, useRef, useState, useCallback } from "react";
import { creaClima, estadoInicial, derivadas, AJUSTES } from "./modelo/ges.js";
import { pasoROS2 } from "./modelo/integrador.js";

const T_K = 273.15, PASO = 60, MUESTRA = 600, DIAS_HISTORIAL = 4;

// dos juegos de datos de tiempo: el de HortiMED (Zenodo, 2018) y el de muestra del modelo GES (Inglaterra)
export const TIEMPOS = {
  hortimed: { nombre: "HortiMED 2018", archivo: "datos/tiempo-hortimed.json", anio: 2018,
    inicios: [[47, "febrero"], [105, "abril"], [166, "junio"], [196, "julio"]] },
  ges: { nombre: "Inglaterra (GES)", archivo: "datos/tiempo.json", anio: 2021,
    inicios: [[15, "enero"], [105, "abril"], [196, "julio"], [288, "octubre"]] },
};

export function useSimulacion() {
  const [listo, setListo] = useState(false);
  const [vista, setVista] = useState(null);          // lo que se dibuja (se actualiza ~20 veces por segundo)
  const [enMarcha, setEnMarcha] = useState(true);
  const [velocidad, setVelocidad] = useState(3);     // horas simuladas por segundo
  // ?calefaccion=1&co2=5&inicio=15 en la URL: para enlazar un caso concreto
  const par = new URLSearchParams(location.search);
  const [ajustes, setAjustes] = useState({ ventilacion: 25, calefaccion: par.get("calefaccion") === "1", consignaCalef: 16, co2: +(par.get("co2") || 0) });
  // ?tiempo=ges: los datos de tiempo de muestra del modelo original
  const [tiempo, setTiempoBase] = useState(TIEMPOS[par.get("tiempo")] ? par.get("tiempo") : "hortimed");
  const cercano = (k, dia) => TIEMPOS[k].inicios.reduce((a, b) => (Math.abs(b[0] - dia) < Math.abs(a[0] - dia) ? b : a))[0];
  const [inicio, setInicio] = useState(() => cercano(TIEMPOS[par.get("tiempo")] ? par.get("tiempo") : "hortimed", +(par.get("inicio") || 105)));   // día del año en que empieza (por defecto, mediados de abril)
  const [latitud, setLatitud] = useState(null);
  const s = useRef({ clima: null, t: 0, y: null, historial: [], flujos: {}, ultimaVista: 0 });
  const setTiempo = (k) => {                       // al cambiar de datos, el inicio pasa al mes más parecido
    setInicio(cercano(k, inicio));
    setTiempoBase(k);
  };

  const aj = useCallback(() => ({ ...AJUSTES, T_sp_vent: ajustes.ventilacion + T_K, calefaccion: ajustes.calefaccion, T_sp_calef: ajustes.consignaCalef + T_K, added_CO2: ajustes.co2,
    ...(latitud != null && { latitud }) }), [ajustes, latitud]);

  const reinicia = useCallback((dia) => {
    const st = s.current; if (!st.clima) return;
    // ?hora=13: empieza a esa hora (para enlazar o capturar un momento concreto)
    const hora = +(new URLSearchParams(location.search).get("hora") || 0);
    st.t = dia * 86400 + hora * 3600; st.y = estadoInicial(st.clima, st.t); st.historial = [];
    // un primer paso para tener flujos que dibujar
    st.flujos = {}; derivadas(st.t, st.y, st.clima, aj(), st.flujos); muestrea(st);
    setVista(foto(st));
  }, [aj]);

  // datos de tiempo
  useEffect(() => {
    setListo(false);
    fetch(TIEMPOS[tiempo].archivo).then((r) => r.json()).then((d) => { s.current.clima = creaClima(d); setLatitud(d.latitud ?? null); setListo(true); });
  }, [tiempo]);
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
        st.y = pasoROS2(f, st.t, st.y, PASO); st.t += PASO; acumulado -= PASO; pasos++;
        if (st.t % MUESTRA === 0) { st.flujos = {}; derivadas(st.t, st.y, st.clima, ajRef.current, st.flujos); muestrea(st); }
      }
      if (ahora - st.ultimaVista > 50) { st.flujos = {}; derivadas(st.t, st.y, st.clima, ajRef.current, st.flujos); st.ultimaVista = ahora; setVista(foto(st)); }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [listo, enMarcha, velocidad]);

  // los ajustes se leen en cada paso sin reiniciar el bucle
  const ajRef = useRef(aj()); useEffect(() => { ajRef.current = aj(); }, [aj]);

  // latitud: la de los datos, o la de GES si no la traen
  return { listo, tiempo, setTiempo, latitud: latitud ?? 53.193583, vista, enMarcha, setEnMarcha, velocidad, setVelocidad, ajustes, setAjustes, inicio, setInicio, reinicia: () => { reinicia(inicio); setEnMarcha(true); } };
}

function muestrea(st) {
  const f = st.flujos, y = st.y;
  st.historial.push({ t: st.t, T_ext: f.T_ext, T_int: y[1] - T_K, T_veg: y[2] - T_K, HR_int: f.HR_int, HR_ext: f.HR_ext, CO2: f.CO2_ppm,
    sol: f.sol_exterior / 500, fruto: y[15] * 1000, calef: f.calefaccion });
  const corte = st.t - DIAS_HISTORIAL * 86400;
  while (st.historial.length && st.historial[0].t < corte) st.historial.shift();
}

const foto = (st) => ({ t: st.t, y: Array.from(st.y), flujos: { ...st.flujos }, historial: st.historial.slice() });
