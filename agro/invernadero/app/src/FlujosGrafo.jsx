import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Handle, Position, MarkerType, EdgeLabelRenderer, BaseEdge, getSmoothStepPath, getBezierPath, useNodesState, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { GRAFOS_FLUJOS, describeFlujo } from './modelo/grafo-flujos.js';
const ContextoFlujos = createContext(null);
const numero = (v) => v > 0 && v < 0.001 ? '<0,001' : v.toLocaleString('es-ES', { maximumFractionDigits: v > 0 && v < 0.1 ? 3 : 1 });
function NodoMateria({ data }) {
  const { y } = useContext(ContextoFlujos);
  const masa = data.estado != null && y ? y[data.estado] * 187.5 : null;
  return <div className={`nodo-materia materia-${data.tipo}`}><strong>{data.nombre}</strong>{masa != null && <small>{numero(masa)} kg CH₂O<br />{numero(masa * 12 / 30)} kg C</small>}{Object.entries(Position).flatMap(([nombre,lado]) => [
    <Handle key={`s-${nombre}`} id={`s-${lado}`} type="source" position={lado} />,
    <Handle key={`t-${nombre}`} id={`t-${lado}`} type="target" position={lado} />,
  ])}</div>;
}
function AristaMateria(props) {
  const { grafo, valores, seleccion } = useContext(ContextoFlujos), flujo = props.data.flujo;
  const actual = describeFlujo(grafo, flujo, valores), etiqueta = `${numero(actual.valor)} ${grafo.unidad}`;
  const [path, labelX, labelY] = flujo.id === 'aire-cubierta'
    ? getBezierPath({ ...props, curvature: 0.45 })
    : getSmoothStepPath({ ...props, borderRadius: 12, offset: 24 });
  // Las etiquetas viven en una capa HTML sobre todas las aristas. Buscamos un
  // hueco cercano que no tape las cifras del interior de ningún nodo.
  const obstaculos = props.data.bloques;
  const xSeguro = Math.max(Math.min(...obstaculos.map((b) => b.x)) - 25, Math.min(Math.max(...obstaculos.map((b) => b.x)) + 145, labelX));
  const candidatos = [0, -25, 25, -50, 50, -75, 75].flatMap((dy) => [0, -60, 60].map((dx) => ({ x: xSeguro + dx, y: labelY + dy })));
  const hueco = candidatos.find(({ x, y }) => x >= Math.min(...obstaculos.map((b) => b.x)) - 25 && x <= Math.max(...obstaculos.map((b) => b.x)) + 145 && !obstaculos.some((b) => x + 54 > b.x - 5 && x - 54 < b.x + 125 && y + 12 > b.y - 5 && y - 12 < b.y + b.h + 5)) || { x: labelX, y: labelY };
  return <><g opacity={actual.valor < 0.001 ? 0.3 : 1}>
    <title>{flujo.nombre}: {actual.de} → {actual.a}, {etiqueta}. {flujo.reversible ? 'Intercambio reversible.' : 'Flujo de sentido único.'}</title>
    <BaseEdge id={props.id} path={path} markerStart={props.markerStart} markerEnd={props.markerEnd}
      style={{ stroke: grafo.color, strokeWidth: seleccion === props.id ? 3 : 1.8 }} interactionWidth={22}
      />
  </g><EdgeLabelRenderer><button className="etiqueta-caudal nodrag nopan" data-flujo={props.id}
    style={{ transform: `translate(-50%, -50%) translate(${hueco.x}px, ${hueco.y}px)`, color: grafo.color }}
    title={`${flujo.nombre}: ${actual.de} → ${actual.a}`} onClick={() => props.data.selecciona(props.id)}>{etiqueta}</button></EdgeLabelRenderer></>;
}
const NODE_TYPES = { materia: NodoMateria }, EDGE_TYPES = { materia: AristaMateria };
function GrafoMateria({ grafo, vertical, ancho, selecciona }) {
  const { fitBounds, getNodes } = useReactFlow(), listo = useNodesInitialized();
  const posicionesCarbono = { inyeccion: [0,0], aire: [200,0], exterior: [200,145], reserva: [0,165], fruto: [0,330], hojas: [200,330], tallo: [0,500], poda: [200,500] };
  const iniciales = useMemo(() => grafo.nodos.map((n) => ({ id: n.id, type: 'materia',
    position: grafo.unidad === 'kg C/h' ? (vertical ? { x: posicionesCarbono[n.id][0], y: posicionesCarbono[n.id][1] } : { x: n.x, y: n.y }) : vertical ? { x: (n.y - 60) * 1.25, y: n.x * 0.76 } : { x: n.x, y: n.y },
    data: n, style: { width: 120 }, selectable: false, draggable: false })), [grafo, vertical]);
  const [nodes, , onNodesChange] = useNodesState(iniciales);
  useEffect(() => {
    if (!listo) return;
    const raf = requestAnimationFrame(() => {
      const actuales = getNodes(), xs = actuales.map((n) => n.position.x), ys = actuales.map((n) => n.position.y);
      const x = Math.min(...xs) - 85, y = Math.min(...ys) - 45;
      fitBounds({ x, y, width: Math.max(...xs) + 120 + 85 - x, height: Math.max(...ys) + (grafo.unidad === 'kg C/h' ? 68 : 46) + 45 - y }, { padding: 0.02, maxZoom: 1, duration: 0 });
    });
    return () => cancelAnimationFrame(raf);
  }, [listo, ancho, fitBounds, getNodes, grafo]);
  const edges = useMemo(() => grafo.flujos.map((f) => {
    const de = nodes.find((n) => n.id === f.de).position, a = nodes.find((n) => n.id === f.a).position;
    let origen, destino;
    if (f.retorno) origen = destino = Position.Right;
    else if (f.latente) origen = destino = vertical ? Position.Top : Position.Left;
    else if (f.id === 'aire-cubierta') { origen = vertical ? Position.Bottom : Position.Right; destino = vertical ? Position.Right : Position.Bottom; }
    else if (f.rodea) origen = destino = grafo.unidad === 'kg C/h' ? (f.id === 'tallo-aire' ? Position.Right : Position.Left) : vertical ? Position.Left : Position.Top;
    else if (Math.abs(a.x - de.x) >= Math.abs(a.y - de.y)) { origen = a.x > de.x ? Position.Right : Position.Left; destino = a.x > de.x ? Position.Left : Position.Right; }
    else { origen = a.y > de.y ? Position.Bottom : Position.Top; destino = a.y > de.y ? Position.Top : Position.Bottom; }
    const marker = { type: MarkerType.ArrowClosed, color: grafo.color, width: 16, height: 16 };
    return { id: f.id, source: f.de, target: f.a, sourceHandle: `s-${origen}`, targetHandle: `t-${destino}`, type: 'materia',
      data: { flujo: f, selecciona, bloques: nodes.map((n) => ({ ...n.position, h: grafo.unidad === 'kg C/h' ? 68 : 46 })) }, markerEnd: marker, ...(f.reversible && { markerStart: marker }),
      ariaLabel: `${f.nombre}: ${f.reversible ? 'intercambio reversible' : 'sentido único'}` };
  }), [grafo, vertical]);
  return <ReactFlow nodes={nodes} onNodesChange={onNodesChange} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
    fitView fitViewOptions={{ padding: 0.09, maxZoom: 1 }} minZoom={0.3} maxZoom={1.3}
    nodesConnectable={false} nodesDraggable={false} nodesFocusable={false} edgesReconnectable={false} deleteKeyCode={null}
    panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
    onEdgeClick={(_, e) => selecciona(e.id)} proOptions={{ hideAttribution: true }} colorMode="dark" />;
}
export default function FlujosGrafo({ vista }) {
  const [tipo, setTipo] = useState('energia'), [seleccion, setSeleccion] = useState(null), [ancho, setAncho] = useState(0);
  const caja = useRef(null), grafo = GRAFOS_FLUJOS[tipo], valores = vista?.flujos || {}, vertical = ancho > 0 && ancho < 420;
  useEffect(() => { const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width)); ro.observe(caja.current); return () => ro.disconnect(); }, []);
  const elegido = grafo.flujos.find((f) => f.id === seleccion), actual = elegido && describeFlujo(grafo, elegido, valores);
  return <section className={`flujos-resumen flujos-${tipo}`} aria-label="Flujos de materia y energía">
    <div className="cabecera-flujos"><h2>Qué entra, se transfiere y sale</h2><div className="selector-flujos" role="group" aria-label="Tipo de flujo">{[['energia','Energía'],['agua','Agua'],['carbono','Carbono']].map(([k,v]) => <button key={k} aria-pressed={tipo === k} onClick={() => { setTipo(k); setSeleccion(null); }}>{v}</button>)}</div></div>
    <div className={`grafo-transferencias${tipo === 'carbono' ? ' grafo-carbono' : ''}${vertical ? ' vertical' : ''}`} ref={caja}>
      {ancho > 0 && <ContextoFlujos.Provider value={{ grafo, valores, seleccion, y: vista?.y }}><ReactFlowProvider key={`${tipo}-${vertical}`}><GrafoMateria grafo={grafo} vertical={vertical} ancho={ancho} selecciona={setSeleccion} /></ReactFlowProvider></ContextoFlujos.Provider>}
    </div>
    <p className="nota-flujos" aria-live="polite">{elegido ? <>{elegido.nombre}: <strong>{actual.de} → {actual.a}, {numero(actual.valor)} {grafo.unidad}</strong>.</> : <>→ Sentido único · ↔ Intercambio reversible. Pulsa una conexión para ver su nombre y sentido actual.</>} {tipo === 'carbono' && 'CO₂ del aire → azúcares → fruto, hojas y tallo. Flujos en kg de carbono por hora; los nodos muestran carbohidratos CH₂O y su carbono (40 %). La respiración devuelve carbono al aire.'} Intercambios principales; balances completos en el detalle.</p>
  </section>;
}
