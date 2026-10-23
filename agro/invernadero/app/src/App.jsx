import { EstadoActuadores } from './EstadoActuadores.jsx';
import { VisorSeguro } from './VisorSeguro.jsx';
import { useEffect, useState } from "react";
import { ReactFlow, Handle, Position, BaseEdge, getBezierPath, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSimulacion, TIEMPOS } from "./simulacion.js";
import { PIEZAS, FLUJOS, TIPOS } from "./piezas.js";
import { Graficas } from "./Graficas.jsx";
import { Calendario } from "./Calendario.jsx";
import Planificador from "./Planificador.jsx";
import { VariablesSistema, FlujosResumen, TotalesResumen } from "./ResumenSistema.jsx";
import { Agua } from "./Agua.jsx";
import { Energia } from "./Energia.jsx";
import { EQUIPOS } from "./simulacion.js";
import { lazy, Suspense } from "react";
// three.js solo se descarga si se abre la vista 3D
const Vista3D = lazy(() => import("./Vista3D.jsx").then((m) => ({ default: m.Vista3D })));

const LADOS = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const DESPLAZA = { vapor: 25, agua: 40, energia: 55, co2: 75 };                // posición de cada tipo en el lado (%)

// ---- nodo: una pieza del invernadero ----
function NodoPieza({ data }) {
  const { pieza, valor, seleccionado } = data;
  return (
    <div className={`nodo nodo-${pieza.tipo}${seleccionado ? " sel" : ""}`}>
      <div className="nodo-titulo">{pieza.titulo}</div>
      {valor && <div className="nodo-valor">{valor}</div>}
      {Object.keys(LADOS).flatMap((l) => Object.keys(DESPLAZA).flatMap((tp) => {
        const estilo = l === "top" || l === "bottom" ? { left: `${DESPLAZA[tp]}%` } : { top: `${DESPLAZA[tp]}%` };
        return [<Handle key={`s-${l}-${tp}`} id={`s-${l}-${tp}`} type="source" position={LADOS[l]} style={estilo} />,
          <Handle key={`t-${l}-${tp}`} id={`t-${l}-${tp}`} type="target" position={LADOS[l]} style={estilo} />];
      }))}
    </div>
  );
}

// ---- arista: un flujo, animado; grosor según su valor, sentido según su signo ----
function AristaFlujo({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [camino] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const { tipo, valor, atenuado } = data;
  const T = TIPOS[tipo], mag = Math.abs(valor);
  const ancho = Math.min(1 + 2.4 * Math.log10(1 + mag / T.escala), 9), visible = mag >= T.escala * 0.02;
  const dur = mag > 0 ? Math.max(0.35, 2.4 / Math.log10(2 + mag / T.escala)) : 0;
  return (
    <>
      <BaseEdge id={id} path={camino} style={{ stroke: T.color, strokeWidth: ancho, opacity: atenuado ? 0.08 : visible ? 0.85 : 0.18 }} />
      {!atenuado && visible && (
        <path d={camino} fill="none" stroke="#e8eef6" strokeWidth={Math.max(1, ancho * 0.35)} strokeDasharray="2 14" strokeLinecap="round"
          style={{ animation: `fluye ${dur}s linear infinite`, animationDirection: valor < 0 ? "reverse" : "normal", opacity: 0.8 }} />
      )}
    </>
  );
}

const tiposNodo = { pieza: NodoPieza };
const tiposArista = { flujo: AristaFlujo };

function lados(a, b) {                         // por qué lados sale y entra la arista, según las posiciones
  const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1];
  if (Math.abs(dx) > Math.abs(dy) * 1.2) return dx > 0 ? ["right", "left"] : ["left", "right"];
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

function useEstrecho() {
  const [e, setE] = useState(() => window.innerWidth < 760);
  useEffect(() => { const f = () => setE(window.innerWidth < 760); addEventListener("resize", f); return () => removeEventListener("resize", f); }, []);
  return e;
}

function Diagrama({ vista, ajustes, seleccion, setSeleccion }) {
  const estrecho = useEstrecho();
  const activo = (o) => !o.opcional || (o.opcional === "calefaccion" ? ajustes.calefaccion : ajustes.co2 > 0);
  const piezas = PIEZAS.filter(activo).map((p) => ({ ...p, p: estrecho ? p.posMovil : p.pos }));
  const porId = Object.fromEntries(piezas.map((p) => [p.id, p]));
  const nodes = piezas.map((p) => ({ id: p.id, type: "pieza", position: { x: p.p[0], y: p.p[1] }, draggable: true,
    data: { pieza: p, valor: vista ? p.valor(vista.y, vista.flujos) : "", seleccionado: seleccion === p.id } }));
  const edges = FLUJOS.filter((f) => !f.oculto && activo(f) && porId[f.de] && porId[f.a]).map((f) => {
    const [ls, lt] = lados(porId[f.de], porId[f.a]);
    const v = vista ? vista.flujos[f.clave] || 0 : 0;
    // con una pieza seleccionada, se atenúan los flujos que no la tocan (sus valores están en el panel)
    const atenuado = !!seleccion && seleccion !== f.de && seleccion !== f.a;
    return { id: f.id, source: f.de, target: f.a, type: "flujo", sourceHandle: `s-${ls}-${f.tipo}`, targetHandle: `t-${lt}-${f.tipo}`,
      data: { tipo: f.tipo, valor: v, atenuado } };
  });
  return (
    <ReactFlow key={estrecho ? "estrecho" : "ancho"} nodes={nodes} edges={edges} nodeTypes={tiposNodo} edgeTypes={tiposArista} fitView fitViewOptions={{ padding: 0.08 }}
      onNodeClick={(_, n) => setSeleccion(n.id === seleccion ? null : n.id)} onPaneClick={() => setSeleccion(null)}
      proOptions={{ hideAttribution: true }} colorMode="dark" minZoom={0.3} nodesConnectable={false} zoomOnScroll={false} preventScrolling={false} />
  );
}

function Panel({ vista, seleccion }) {
  if (!seleccion) return (
    <div className="panel">
      <h3>Un invernadero por piezas</h3>
      <p>Cada caja es un balance físico (energía, agua, vapor, CO₂); cada línea, un flujo que sale de una pieza y entra en otra. El grosor es su valor en este momento; los puntos que corren, su sentido.</p>
      <p className="leyenda">{Object.values(TIPOS).map((t) => <span key={t.nombre}><i style={{ background: t.color }} />{t.nombre}</span>)}</p>
      <p className="suave">Pulsa una pieza para ver su ecuación y los flujos que entran y salen.</p>
    </div>
  );
  const p = PIEZAS.find((x) => x.id === seleccion);
  const fl = FLUJOS.filter((f) => f.de === seleccion || f.a === seleccion);
  return (
    <div className="panel">
      <h3>{p.titulo}</h3>
      {vista && <div className="panel-valor">{p.valor(vista.y, vista.flujos)}</div>}
      <p>{p.texto}</p>
      <pre className="ecuacion">{p.ecuacion}</pre>
      {vista && fl.length > 0 && (
        <table className="flujos"><tbody>
          {fl.map((f) => {
            const v = vista.flujos[f.clave] || 0, entra = (f.a === seleccion) === v >= 0;
            return <tr key={f.id}><td style={{ color: TIPOS[f.tipo].color }}>{entra ? "→ entra" : "← sale"}</td><td>{f.nombre}</td><td className="num">{TIPOS[f.tipo].formato(Math.abs(v))}</td></tr>;
          })}
        </tbody></table>
      )}
    </div>
  );
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fecha(t, anio) {
  const d = new Date(Date.UTC(anio, 0, 1) + t * 1000);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function App() {
  const sim = useSimulacion();
  const [modo, setModo] = useState(() => new URLSearchParams(location.search).get('modo') === 'campana' ? 'campana' : 'explorar');
  const [detalle, setDetalle] = useState(() => { const q = new URLSearchParams(location.search); return q.has('pieza') || q.get('vista') === 'piezas'; });
  useEffect(() => { sim.setEnMarcha(modo === 'explorar'); }, [modo]);
  const [seleccion, setSeleccion] = useState(() => new URLSearchParams(location.search).get('pieza'));
  const { vista, ajustes, setAjustes } = sim;
  return (
    <div className="app app-compacta">
      <nav className="modos-simulador" aria-label="Modo del simulador">
        <button aria-pressed={modo === 'explorar'} onClick={() => setModo('explorar')}>Sistema y flujos</button>
        <button aria-pressed={modo === 'campana'} onClick={() => setModo('campana')}>Comparar campañas</button>
      </nav>
      <div hidden={modo !== 'campana'}><Planificador /></div>
      {modo === 'explorar' && <>
        <header className="cabecera-sistema"><div><h1>Un invernadero por piezas</h1><p>El exterior impone, el estado evoluciona y el control actúa.</p></div>
          <div className="reproduccion-sistema"><button onClick={() => sim.setEnMarcha(!sim.enMarcha)}>{sim.enMarcha ? 'Pausa' : 'Seguir'}</button><label>Velocidad <select aria-label="Velocidad" value={sim.velocidad} onChange={(e) => sim.setVelocidad(+e.target.value)}>{[1,3,6,12,24,48].map((v) => <option key={v} value={v}>{v} h/s</option>)}</select></label><button onClick={sim.reinicia}>Reiniciar</button></div>
        </header>
        {sim.errorCarga && <p className="error-campana" role="alert">{sim.errorCarga} <button onClick={sim.reintentaCarga}>Reintentar carga</button></p>}
        {!sim.listo && !sim.errorCarga && <p role="status">Cargando datos de clima…</p>}
        <VariablesSistema sim={sim} />
        <div className="visual-sistema">
          <div className="columna-invernadero">
          <EstadoActuadores sim={sim} />
          <section className="escena-compacta" aria-label="Vista 3D del invernadero"><VisorSeguro><Suspense fallback={<div className="cargando">Cargando 3D…</div>}><Vista3D vista={vista} latitud={sim.latitud} compacta /></Suspense></VisorSeguro></section>
          </div>
          <FlujosResumen vista={vista} />
        </div>
        <div className="fecha-sistema">{vista && sim.listo ? fecha(vista.t, TIEMPOS[sim.tiempo].anio) : 'Cargando clima…'} · {TIEMPOS[sim.tiempo].nombre}</div>
        <TotalesResumen vista={vista} />
        <details className="ajustes-contexto"><summary>Cambiar clima, fecha y equipo de calefacción</summary><div className="barra">
          <label>Clima <select aria-label="Clima" value={sim.tiempo} onChange={(e) => sim.setTiempo(e.target.value)}>{Object.entries(TIEMPOS).map(([k,v]) => <option key={k} value={k}>{v.nombre}</option>)}</select></label>
          <label>Inicio <select aria-label="Inicio" value={sim.inicio} onChange={(e) => sim.setInicio(+e.target.value)}>{TIEMPOS[sim.tiempo].inicios.map(([d,m]) => <option key={d} value={d}>{m}</option>)}{!TIEMPOS[sim.tiempo].inicios.some(([d]) => d === sim.inicio) && <option value={sim.inicio}>{fecha(sim.inicio * 86400, TIEMPOS[sim.tiempo].anio).split(',')[0]}</option>}</select></label>
          <label>Equipo <select aria-label="Equipo de calefacción" value={ajustes.equipo} onChange={(e) => setAjustes((a) => ({ ...a, equipo: e.target.value }))}>{Object.entries(EQUIPOS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>{vista && sim.listo && <Calendario t={vista.t} rango={sim.rango} anio={TIEMPOS[sim.tiempo].anio} saltar={(d) => { sim.setInicio(d); sim.setEnMarcha(true); }} />}</details>
        <details className="detalle-sistema" open={detalle} onToggle={(e) => setDetalle(e.currentTarget.open)}><summary>Ver piezas, ecuaciones y series</summary>
          {detalle && <><div className="cuerpo"><div className="diagrama"><ReactFlowProvider><Diagrama vista={vista} ajustes={ajustes} seleccion={seleccion} setSeleccion={setSeleccion} /></ReactFlowProvider></div><div className="columna"><Panel vista={vista} seleccion={seleccion} />{vista && <Energia energia={vista.energia} dias={(vista.t-vista.inicio)/86400} equipo={ajustes.equipo} />}</div></div>
          {vista && <><Agua vista={vista} /><Graficas historial={vista.historial} cultivo={vista.cultivo} inicio={vista.inicio} ajustes={ajustes} anio={TIEMPOS[sim.tiempo].anio} /></>}</>}
        </details>
      </>}
    </div>
  );
}
