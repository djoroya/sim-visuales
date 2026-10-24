import { useEffect, useMemo, useRef, useState } from "react";
import Esquema from "./Esquema.jsx";
import { MapaHollin, Serie } from "./Graficas.jsx";
import { NOMINAL, avanza, crea, entradas, lectura } from "./simulacion.js";
import { CH4, CO, CO2, H2 } from "./modelo/reformador.js";

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

export default function App() {
  const [potencia, setPotencia] = useState(NOMINAL.potencia);
  const [sc, setSc] = useState(NOMINAL.sc);
  const [o2c, setO2c] = useState(NOMINAL.o2c);
  const [velocidad, setVelocidad] = useState(300);
  const [pausa, setPausa] = useState(false);
  const sim = useRef(crea());
  const [, refresca] = useState(0);
  const mandos = useMemo(() => ({ potencia, sc, o2c }), [potencia, sc, o2c]);
  const e = useMemo(() => entradas(mandos), [mandos]);
  const actual = useRef({ e, mandos });
  actual.current = { e, mandos };

  // Bucle: integra a la velocidad elegida y guarda un punto cada 0,25 s de reloj.
  useEffect(() => {
    if (pausa) return undefined;
    let ultimo = performance.now(), acumulado = 0, id;
    const marco = (ahora) => {
      const real = Math.min(0.1, Math.max(0, (ahora - ultimo) / 1000));   // el primer fotograma puede venir «de antes»
      ultimo = ahora;
      const s = sim.current, { e: en, mandos: m } = actual.current;
      avanza(s, real * velocidad, en);
      acumulado += real;
      if (acumulado >= 0.25) {
        acumulado = 0;
        const l = lectura(s, en, m);
        s.historial.push({ t: s.t, T: l.T_C, H2: l.ys[H2] * 100, CO: l.ys[CO] * 100, CO2: l.ys[CO2] * 100, CH4: l.ys[CH4] * 100, eta: l.rendimiento * 100 });
        if (s.historial.length > 1200) s.historial.splice(0, s.historial.length - 1200);
        refresca((n) => n + 1);
      }
      id = requestAnimationFrame(marco);
    };
    id = requestAnimationFrame(marco);
    return () => cancelAnimationFrame(id);
  }, [pausa, velocidad]);

  const reinicia = () => { sim.current = crea(); refresca((n) => n + 1); };
  const l = lectura(sim.current, e, mandos);
  const avisos = [];
  if (l.T_C > 900) avisos.push(`El catalizador pasa de 900 °C: con tanto aire se quema más combustible del necesario y un catalizador real se degrada (sus partículas de metal se sinterizan).`);
  if (l.conversion < 0.9 && sim.current.t > 600) avisos.push(`Sale un ${fmt((1 - l.conversion) * 100)} % del diésel sin reformar: a ${fmt(l.T_C)} °C las reacciones van lentas. Más aire calienta el catalizador.`);
  if (l.hollin) avisos.push(`Con S/C ${fmt(sc, 1)} y O₂/C ${fmt(o2c, 2)}, a ${fmt(l.T_C)} °C el equilibrio forma grafito: hace falta S/C de al menos ${fmt(l.scMin, 2)}. El hollín tapa los poros del catalizador.`);

  return (
    <div className="app">
      <div className="barra">
        <label>Diésel <input type="range" min="0.5" max="2.5" step="0.1" value={potencia} onChange={(ev) => setPotencia(+ev.target.value)} /><output>{fmt(potencia, 1)} kW</output></label>
        <label>Vapor/carbono <input type="range" min="0.5" max="3" step="0.1" value={sc} onChange={(ev) => setSc(+ev.target.value)} /><output>{fmt(sc, 1)}</output></label>
        <label>Oxígeno/carbono <input type="range" min="0.2" max="0.9" step="0.01" value={o2c} onChange={(ev) => setO2c(+ev.target.value)} /><output>{fmt(o2c, 2)}</output></label>
        <span className="reloj">
          <button onClick={() => setPausa((p) => !p)} aria-label={pausa ? "Seguir" : "Pausa"}>{pausa ? "▶" : "❚❚"}</button>{" "}
          <select value={velocidad} onChange={(ev) => setVelocidad(+ev.target.value)} aria-label="Velocidad">
            {[1, 10, 60, 300].map((v) => <option key={v} value={v}>×{v}</option>)}
          </select>{" "}
          <button onClick={reinicia}>Arrancar de nuevo</button>{" "}
          t = {fmt(sim.current.t / 60, 0)} min
        </span>
      </div>
      {avisos.map((a) => <div key={a.slice(0, 20)} className="aviso" role="status">{a}</div>)}
      <div className="cuerpo">
        <div className="diagrama"><Esquema l={l} e={e} mandos={mandos} velocidad={velocidad} /></div>
        <div className="columna">
          <div className="panel">
            <h3>El reformador ahora</h3>
            <div className="cifras">
              <div><b>{fmt(l.T_C)} °C</b><span>catalizador</span></div>
              <div><b>{fmt(l.rendimiento * 100)} %</b><span>de la energía del diésel queda en el gas</span></div>
              <div><b>{fmt(l.h2co * 100)} %</b><span>H₂ + CO en el gas seco</span></div>
              <div><b>{fmt(l.conversion * 100)} %</b><span>del diésel reformado</span></div>
            </div>
            <h3>Balance de calor del catalizador</h3>
            <Balance l={l} />
            <p className="suave">Un reformador autotérmico no tiene quemador: su temperatura sale de este balance. El aire la sube y el vapor la baja.</p>
          </div>
        </div>
      </div>
      <div className="graficas">
        <Serie titulo="Temperatura del catalizador" datos={sim.current.historial} series={[{ clave: "T", color: "#ef6f45", nombre: "T" }]} unidad=" °C" yMin={300} yMax={1000} />
        <Serie titulo="Gas seco" datos={sim.current.historial} unidad=" %" yMax={50}
          series={[{ clave: "H2", color: "#4f9be8", nombre: "H₂" }, { clave: "CO", color: "#a78bfa", nombre: "CO" }, { clave: "CO2", color: "#9fb3c8", nombre: "CO₂" }, { clave: "CH4", color: "#34d399", nombre: "CH₄" }]} />
        <MapaHollin sc={sc} o2c={o2c} T_C={l.T_C} scMin={l.scMin} />
      </div>
      <p className="pie">Modelo: reformador autotérmico de diésel bien mezclado, con cinco reacciones globales y el balance de energía del
        catalizador; equilibrio químico por minimización de Gibbs. Las velocidades de reacción son supuestas, no ajustadas a un reactor concreto.</p>
    </div>
  );
}

function Balance({ l }) {
  // lo que entra a 400 °C y sale a T se calienta con el calor de las reacciones
  const sensible = l.qOxidacion + l.qReformado + l.qDesplazamiento - l.perdidas;
  const filas = [
    ["Oxidación", l.qOxidacion, "#ef6f45"],
    ["Reformado", l.qReformado, "#4f9be8"],
    ["Desplazamiento del agua", l.qDesplazamiento, "#a78bfa"],
    ["Pérdidas al ambiente", -l.perdidas, "#8fa3bd"],
  ];
  const escala = Math.max(200, ...filas.map(([, v]) => Math.abs(v)));
  return (
    <table className="perdidas"><tbody>
      {filas.map(([n, v, c]) => (
        <tr key={n}><td>{n}</td><td className="num">{v >= 0 ? "+" : "−"}{fmt(Math.abs(v))} W</td>
          <td className="barra-celda"><span className="barrita" style={{ width: `${Math.min(100, (Math.abs(v) / escala) * 100)}%`, background: c }} /></td></tr>
      ))}
      <tr className="total"><td>= calienta el gas y el catalizador</td><td className="num">{sensible >= 0 ? "+" : "−"}{fmt(Math.abs(sensible))} W</td><td /></tr>
    </tbody></table>
  );
}
