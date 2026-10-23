import { useEffect, useMemo, useRef, useState } from "react";
import Esquema from "./Esquema.jsx";
import { Serie, Polarizacion } from "./Graficas.jsx";
import { COMBUSTIBLES, PILA, V_MIN_CELDA, avanza, corrienteMaxima, crea, entradas, lectura, polarizacion } from "./simulacion.js";

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

export default function App() {
  const [I, setI] = useState(30);
  const [combustible, setCombustible] = useState("biogas");
  const [factorComb, setFactorComb] = useState(1);
  const [factorAire, setFactorAire] = useState(1);
  const [velocidad, setVelocidad] = useState(1);
  const [pausa, setPausa] = useState(false);
  const sim = useRef(crea("biogas"));
  const [, refresca] = useState(0);
  const { qa, qc } = useMemo(() => entradas(combustible, factorComb, factorAire), [combustible, factorComb, factorAire]);
  const curva = useMemo(() => polarizacion(qa, qc), [qa, qc]);
  // La electrónica no deja pedir más de lo que la pila sostiene por encima de V_MIN_CELDA.
  const Imax = useMemo(() => corrienteMaxima(qa, qc), [qa, qc]);
  const Ief = Math.min(I, Imax);
  const entradasRef = useRef({ I: Ief, qa, qc });
  entradasRef.current = { I: Ief, qa, qc };

  // Bucle: integra en tiempo real (o acelerado) y guarda un punto cada 0,25 s simulado.
  useEffect(() => {
    if (pausa) return undefined;
    let ultimo = performance.now(), acumulado = 0, id;
    const marco = (ahora) => {
      const dt = Math.min(0.1, (ahora - ultimo) / 1000) * velocidad;
      ultimo = ahora;
      const s = sim.current, { I: i, qa: a, qc: c } = entradasRef.current;
      avanza(s, dt, i, a, c);
      acumulado += dt;
      if (acumulado >= 0.25) {
        acumulado = 0;
        const l = lectura(s, i, a, c);
        s.historial.push({ t: s.t, I: i, V: l.V, Vc: l.Vcelda, P: l.electrica / 1000, Q: l.calor / 1000, U: l.utilizacion * 100, H2: l.pa[0] });
        if (s.historial.length > 600) s.historial.shift();
        refresca((n) => n + 1);
      }
      id = requestAnimationFrame(marco);
    };
    id = requestAnimationFrame(marco);
    return () => cancelAnimationFrame(id);
  }, [pausa, velocidad]);

  const l = lectura(sim.current, Ief, qa, qc);
  const limitada = I > Imax + 0.05;
  const aviso = limitada ? `Pides ${I} A, pero la pila solo sostiene ${fmt(Imax, 1)} A con este combustible: por encima, la tensión bajaría de ${V_MIN_CELDA.toLocaleString("es-ES")} V por celda y el hidrógeno del ánodo se agotaría. La electrónica limita la corriente.`
    : l.utilizacion > 0.8 ? `Cerca del límite: se usa el ${fmt(l.utilizacion * 100)} % del combustible. Queda poco hidrógeno en el ánodo y la tensión cae deprisa.` : null;

  return (
    <div className="app">
      <div className="barra">
        <label>Corriente pedida <input type="range" min="0" max="60" step="1" value={I} onChange={(e) => setI(+e.target.value)} /><output>{I} A</output></label>
        <label>Combustible <select value={combustible} onChange={(e) => setCombustible(e.target.value)}>
          {Object.entries(COMBUSTIBLES).map(([k, c]) => <option key={k} value={k}>{c.nombre}</option>)}
        </select></label>
        <label>Caudal de combustible <input type="range" min="0.5" max="1.5" step="0.05" value={factorComb} onChange={(e) => setFactorComb(+e.target.value)} /><output>{fmt(factorComb * 100)} %</output></label>
        <label>Aire <input type="range" min="0.3" max="1.5" step="0.05" value={factorAire} onChange={(e) => setFactorAire(+e.target.value)} /><output>{fmt(factorAire * 100)} %</output></label>
        <span className="reloj">
          <button onClick={() => setPausa((p) => !p)}>{pausa ? "▶" : "❚❚"}</button>{" "}
          <select value={velocidad} onChange={(e) => setVelocidad(+e.target.value)} aria-label="Velocidad">
            <option value="1">×1</option><option value="5">×5</option>
          </select>{" "}
          t = {fmt(sim.current.t, 0)} s
        </span>
      </div>
      <p className="nota-comb">{COMBUSTIBLES[combustible].nota}</p>
      {aviso && <div className="aviso" role="status">{aviso}</div>}
      <div className="cuerpo">
        <div className="diagrama">
          <Esquema l={l} I={Ief} velocidad={velocidad} />
        </div>
        <div className="columna">
          <div className="panel">
            <h3>La pila ahora</h3>
            <div className="cifras">
              <div><b>{fmt(l.V, 1)} V</b><span>{fmt(l.Vcelda, 3)} V por celda</span></div>
              <div><b>{fmt(l.electrica)} W</b><span>electricidad</span></div>
              <div><b>{fmt(l.calor)} W</b><span>calor</span></div>
              <div><b>{fmt(l.utilizacion * 100)} %</b><span>del combustible usado</span></div>
              <div><b>{fmt(l.rendimiento * 100)} %</b><span>rendimiento eléctrico</span></div>
              <div><b>{fmt(l.co2_g_h)} g/h</b><span>CO₂ en el escape</span></div>
            </div>
            <h3>De dónde sale la tensión (por celda)</h3>
            <Perdidas l={l} />
            <p className="suave">El calor y el CO₂ del escape son lo que un invernadero podría aprovechar: calefacción y enriquecimiento del aire.</p>
          </div>
        </div>
      </div>
      <div className="graficas">
        <Serie titulo="Tensión de la pila" datos={sim.current.historial} series={[{ clave: "V", color: "#4f9be8", nombre: "V" }]} unidad=" V" yMax={32} />
        <Serie titulo="Potencia" datos={sim.current.historial} series={[{ clave: "P", color: "#f59e0b", nombre: "electricidad" }, { clave: "Q", color: "#e07a5f", nombre: "calor" }]} unidad=" kW" />
        <Polarizacion puntos={curva} I={Ief} V={l.Vcelda} P={l.electrica} Imax={Imax} />
      </div>
      <p className="pie">Modelo: pila SOFC de parámetros concentrados ({PILA.N0} celdas de {PILA.area} cm², 750 °C) con pérdidas
        calibradas con medidas públicas de Del Zotto et al. (2021). Isoterma: no calcula la temperatura de la pila.</p>
    </div>
  );
}

function Perdidas({ l }) {
  if (!Number.isFinite(l.E)) return null;
  const filas = [
    ["Nernst (ideal)", l.E, "#4f9be8"],
    ["− concentración", -l.etaConc, "#a78bfa"],
    ["− resistencia", -l.etaOhm, "#e07a5f"],
    ["− activación", -l.etaAct, "#f2c14e"],
  ];
  return (
    <table className="perdidas"><tbody>
      {filas.map(([n, v, c]) => (
        <tr key={n}><td>{n}</td><td className="num">{Number.isFinite(v) ? `${v > 0 ? "" : "−"}${fmt(Math.abs(v) * 1000)} mV` : "—"}</td>
          <td className="barra-celda"><span className="barrita" style={{ width: `${Math.min(100, (Math.abs(Number.isFinite(v) ? v : 0) / 1.2) * 100)}%`, background: c }} /></td></tr>
      ))}
      <tr className="total"><td>= tensión</td><td className="num">{fmt(l.Vcelda * 1000)} mV</td><td /></tr>
    </tbody></table>
  );
}
