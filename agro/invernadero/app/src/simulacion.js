// La simulación: el modelo avanza en tiempo real (pasos de 60 s con el integrador implícito),
// guarda una muestra cada 10 minutos y expone el estado y los flujos del último paso.
import { useEffect, useRef, useState, useCallback } from "react";
import { creaClima, estadoInicial, derivadas, AJUSTES } from "./modelo/ges.js";
import { pasoROS2 } from "./modelo/integrador.js";

const T_K = 273.15, PASO = 60, MUESTRA = 600, DIAS_HISTORIAL = 4;

export function useSimulacion() {
  const [listo, setListo] = useState(false);
  const [vista, setVista] = useState(null);          // lo que se dibuja (se actualiza ~20 veces por segundo)
  const [enMarcha, setEnMarcha] = useState(true);
  const [velocidad, setVelocidad] = useState(3);     // horas simuladas por segundo
  // ?calefaccion=1&co2=5&inicio=15 en la URL: para enlazar un caso concreto
  const par = new URLSearchParams(location.search);
  const [ajustes, setAjustes] = useState({ ventilacion: 25, calefaccion: par.get("calefaccion") === "1", consignaCalef: 16, co2: +(par.get("co2") || 0) });
  const [inicio, setInicio] = useState(+(par.get("inicio") || 105));   // día del año en que empieza (por defecto, mediados de abril)
  const s = useRef({ clima: null, t: 0, y: null, historial: [], flujos: {}, ultimaVista: 0 });

  const aj = useCallback(() => ({ ...AJUSTES, T_sp_vent: ajustes.ventilacion + T_K, calefaccion: ajustes.calefaccion, T_sp_calef: ajustes.consignaCalef + T_K, added_CO2: ajustes.co2 }), [ajustes]);

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
    fetch("datos/tiempo.json").then((r) => r.json()).then((tiempo) => { s.current.clima = creaClima(tiempo); setListo(true); });
  }, []);
  useEffect(() => { if (listo) reinicia(inicio); }, [listo, inicio]);   // eslint-disable-line react-hooks/exhaustive-deps

  // bucle
  useEffect(() => {
    if (!listo || !enMarcha) return;
    let raf, anterior = performance.now(), acumulado = 0;
    const f = (t, y) => derivadas(t, y, s.current.clima, ajRef.current);
    const bucle = (ahora) => {
      const st = s.current, dt = Math.min((ahora - anterior) / 1000, 0.1); anterior = ahora;
      acumulado += dt * velocidad * 3600;
      let pasos = 0;
      while (acumulado >= PASO && pasos < 600) {
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

  return { listo, vista, enMarcha, setEnMarcha, velocidad, setVelocidad, ajustes, setAjustes, inicio, setInicio, reinicia: () => reinicia(inicio) };
}

function muestrea(st) {
  const f = st.flujos, y = st.y;
  st.historial.push({ t: st.t, T_ext: f.T_ext, T_int: y[1] - T_K, T_veg: y[2] - T_K, HR_int: f.HR_int, HR_ext: f.HR_ext, CO2: f.CO2_ppm,
    sol: f.sol_exterior / 500, fruto: y[15] * 1000, calef: f.calefaccion });
  const corte = st.t - DIAS_HISTORIAL * 86400;
  while (st.historial.length && st.historial[0].t < corte) st.historial.shift();
}

const foto = (st) => ({ t: st.t, y: Array.from(st.y), flujos: { ...st.flujos }, historial: st.historial.slice() });
