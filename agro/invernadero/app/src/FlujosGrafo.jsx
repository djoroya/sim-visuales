import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Handle, Position, MarkerType, EdgeLabelRenderer, BaseEdge, getSmoothStepPath, getBezierPath, useNodesState, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { GRAFOS_FLUJOS, describeFlujo } from './modelo/grafo-flujos.js';
import { TemperaturaAire } from './TemperaturaAire.jsx';
import { PlegableMovil } from './PlegableMovil.jsx';
const ContextoFlujos = createContext(null);
const numero = (v) => v > 0 && v < 0.001 ? '<0,001' : v.toLocaleString('es-ES', { maximumFractionDigits: v > 0 && v < 0.1 ? 3 : 1 });
function NodoMateria({ data }) {
  const { y, vista } = useContext(ContextoFlujos);
  const masa = data.estado != null && y ? y[data.estado] * 187.5 : null;
  return <div className={`nodo-materia materia-${data.tipo}`}>{data.nombre === 'Aire interior' ? <TemperaturaAire vista={vista} /> : <strong>{data.nombre}</strong>}{masa != null && <small>{numero(masa)} kg CH₂O<br />{numero(masa * 12 / 30)} kg C</small>}{Object.entries(Position).flatMap(([nombre,lado]) => [
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
  const hueco = props.data.etiqueta;
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
    data: n, style: { width: 120, pointerEvents: 'all' }, selectable: false, draggable: false })), [grafo, vertical]);
  const [nodes, , onNodesChange] = useNodesState(iniciales);
  useEffect(() => {
    if (!listo) return;
    const raf = requestAnimationFrame(() => {
      const actuales = getNodes(), xs = actuales.map((n) => n.position.x), ys = actuales.map((n) => n.position.y);
      const x = Math.min(...xs) - 85, y = Math.min(...ys) - 45;
      fitBounds({ x, y, width: Math.max(...xs) + 120 + 85 - x, height: Math.max(...ys) + (grafo.unidad === 'kg C/h' ? 95 : 60) + 45 - y }, { padding: 0.02, maxZoom: 1, duration: 0 });
    });
    return () => cancelAnimationFrame(raf);
  }, [listo, ancho, fitBounds, getNodes, grafo]);
  const edges = useMemo(() => {
    const ocupados = nodes.map((n) => ({ ...n.position, w: 120, h: grafo.unidad === 'kg C/h' ? 95 : 60 }));
    const limites = { izq: Math.min(...ocupados.map((b) => b.x)) - 85, der: Math.max(...ocupados.map((b) => b.x)) + 205, arriba: Math.min(...ocupados.map((b) => b.y)) - 45, abajo: Math.max(...ocupados.map((b) => b.y + b.h)) + 45 };
    return grafo.flujos.map((f) => {
    const de = nodes.find((n) => n.id === f.de).position, a = nodes.find((n) => n.id === f.a).position;
    let origen, destino;
    if (f.retorno) origen = destino = Position.Right;
    else if (f.latente) origen = destino = vertical ? Position.Top : Position.Left;
    else if (f.id === 'aire-cubierta') { origen = vertical ? Position.Bottom : Position.Right; destino = vertical ? Position.Right : Position.Bottom; }
    else if (f.rodea) origen = destino = grafo.unidad === 'kg C/h' ? (f.id === 'tallo-aire' ? Position.Right : Position.Left) : vertical ? Position.Left : Position.Top;
    else if (Math.abs(a.x - de.x) >= Math.abs(a.y - de.y)) { origen = a.x > de.x ? Position.Right : Position.Left; destino = a.x > de.x ? Position.Left : Position.Right; }
    else { origen = a.y > de.y ? Position.Bottom : Position.Top; destino = a.y > de.y ? Position.Top : Position.Bottom; }
    const alto = grafo.unidad === 'kg C/h' ? 95 : 60;
    const punto = (p, lado) => ({ x: p.x + (lado === Position.Left ? 0 : lado === Position.Right ? 120 : 60), y: p.y + (lado === Position.Top ? 0 : lado === Position.Bottom ? alto : alto / 2) });
    const desde = punto(de, origen), hasta = punto(a, destino);
    const props = { sourceX: desde.x, sourceY: desde.y, sourcePosition: origen, targetX: hasta.x, targetY: hasta.y, targetPosition: destino };
    const [, lx, ly] = f.id === 'aire-cubierta' ? getBezierPath({ ...props, curvature: 0.45 }) : getSmoothStepPath({ ...props, borderRadius: 12, offset: 24 });
    // Reserva espacio para la cifra más larga, aunque el valor actual sea cero.
    // Se calcula una sola vez por topología, sin mover rótulos en cada fotograma.
    const w = grafo.unidad === 'kg C/h' ? 156 : 112, h = 34;
    const x0 = Math.max(limites.izq + w / 2, Math.min(limites.der - w / 2, lx));
    const y0 = Math.max(limites.arriba + h / 2, Math.min(limites.abajo - h / 2, ly));
    const xs = [x0, limites.izq+w/2, limites.der-w/2, ...ocupados.flatMap((b) => [b.x-w/2-5, b.x+b.w+w/2+5])];
    const ys = [y0, limites.arriba+h/2, limites.abajo-h/2, ...ocupados.flatMap((b) => [b.y-h/2-5, b.y+b.h+h/2+5])];
    const candidatos = xs.flatMap((x) => ys.map((y) => ({x,y}))).sort((a,b) => Math.hypot(a.x-x0,a.y-y0)-Math.hypot(b.x-x0,b.y-y0));
    const etiqueta = candidatos.find(({x,y}) => x-w/2 >= limites.izq && x+w/2 <= limites.der && y-h/2 >= limites.arriba && y+h/2 <= limites.abajo && !ocupados.some((b) => x+w/2+4 > b.x && x-w/2-4 < b.x+b.w && y+h/2+4 > b.y && y-h/2-4 < b.y+b.h)) || {x:x0,y:y0};
    ocupados.push({ x: etiqueta.x-w/2, y: etiqueta.y-h/2, w, h });
    const marker = { type: MarkerType.ArrowClosed, color: grafo.color, width: 16, height: 16 };
    return { id: f.id, source: f.de, target: f.a, sourceHandle: `s-${origen}`, targetHandle: `t-${destino}`, type: 'materia',
      data: { flujo: f, selecciona, etiqueta }, markerEnd: marker, ...(f.reversible && { markerStart: marker }),
      ariaLabel: `${f.nombre}: ${f.reversible ? 'intercambio reversible' : 'sentido único'}` };
    });
  }, [grafo, vertical]);
  return <ReactFlow nodes={nodes} onNodesChange={onNodesChange} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
    fitView fitViewOptions={{ padding: 0.09, maxZoom: 1 }} minZoom={0.3} maxZoom={1.3}
    nodesConnectable={false} nodesDraggable={false} nodesFocusable={false} edgesReconnectable={false} deleteKeyCode={null}
    panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
    onEdgeClick={(_, e) => selecciona(e.id)} proOptions={{ hideAttribution: true }} colorMode="dark" />;
}
export default function FlujosGrafo({ vista }) {
  const [tipo, setTipo] = useState('energia'), [seleccion, setSeleccion] = useState(null), [ancho, setAncho] = useState(0);
  const caja = useRef(null), grafo = GRAFOS_FLUJOS[tipo], valores = vista?.flujos || {}, vertical = ancho > 0 && ancho < 420;
  // La altura sigue la caja usada por fitBounds: evita bandas vacías cuando
  // el encuadre queda limitado por el ancho, también en móviles apaisados.
  const proporcion = vertical ? (tipo === 'carbono' ? 685 / 490 : 522.4 / 515) : (tipo === 'carbono' ? 695 / 780 : 330 / 780);
  const altura = Math.ceil(Math.min(vertical ? Infinity : tipo === 'carbono' ? 460 : 290, ancho * proporcion));
  useEffect(() => { const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width)); ro.observe(caja.current); return () => ro.disconnect(); }, []);
  const elegido = grafo.flujos.find((f) => f.id === seleccion), actual = elegido && describeFlujo(grafo, elegido, valores);
  return <section className={`flujos-resumen flujos-${tipo}`} aria-label="Flujos de materia y energía">
    <div className="cabecera-flujos"><h2>Qué entra, se transfiere y sale</h2><div className="selector-flujos" role="group" aria-label="Tipo de flujo">{[['energia','Energía'],['agua','Agua'],['carbono','Carbono']].map(([k,v]) => <button key={k} aria-pressed={tipo === k} onClick={() => { setTipo(k); setSeleccion(null); }}>{v}</button>)}</div></div>
    <div className={`grafo-transferencias${tipo === 'carbono' ? ' grafo-carbono' : ''}${vertical ? ' vertical' : ''}`} ref={caja}
      style={ancho > 0 ? { height: altura } : undefined}>
      {ancho > 0 && <ContextoFlujos.Provider value={{ grafo, valores, seleccion, y: vista?.y, vista }}><ReactFlowProvider key={`${tipo}-${vertical}`}><GrafoMateria grafo={grafo} vertical={vertical} ancho={ancho} selecciona={setSeleccion} /></ReactFlowProvider></ContextoFlujos.Provider>}
    </div>
    {elegido && <p className="seleccion-flujo" role="status">{elegido.nombre}: <strong>{actual.de} → {actual.a}, {numero(actual.valor)} {grafo.unidad}</strong>.</p>}
    <PlegableMovil titulo="Cómo leer el grafo"><p className="nota-flujos">→ Sentido único · ↔ Intercambio reversible. Pulsa una conexión para ver su nombre y sentido actual. {tipo === 'carbono' && 'CO₂ del aire → azúcares → fruto, hojas y tallo. Flujos en kg de carbono por hora; los nodos muestran carbohidratos CH₂O y su carbono (40 %). La respiración devuelve carbono al aire.'} Intercambios principales; balances completos en el detalle.</p></PlegableMovil>
  </section>;
}
