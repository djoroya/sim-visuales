import { EQUIPOS } from './modelo/recursos.js';
import { TemperaturaAire } from './TemperaturaAire.jsx';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Handle, Position, MarkerType, useReactFlow, useNodesInitialized, useNodesState } from '@xyflow/react';
const n = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: d }) : '—';
function Dato({ nombre, valor, unidad }) {
  return <div className="dato-sistema"><span>{nombre}</span><strong>{valor}<small>{unidad}</small></strong></div>;
}
export { default as FlujosResumen } from './FlujosGrafo.jsx';
// Un borrador local conserva el foco y permite borrar o teclear un valor parcial.
// Solo los valores completos dentro del rango se aplican mientras se escribe;
// al salir del campo se valida el borrador sin dejar un estado inválido en el modelo.
function NumeroControl({ valor, cambia, min, max, ...props }) {
  const [texto, setTexto] = useState(String(valor)), editando = useRef(false);
  useEffect(() => { if (!editando.current) setTexto(String(valor)); }, [valor]);
  const aplica = (s) => {
    const v = Number(s);
    if (s.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) cambia(v);
  };
  return <input {...props} type="number" min={min} max={max} value={texto}
    onFocus={() => { editando.current = true; }}
    onChange={(e) => { setTexto(e.target.value); aplica(e.target.value); }}
    onBlur={() => {
      editando.current = false;
      const v = texto.trim() === '' ? valor : Number(texto);
      const valido = Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : valor;
      setTexto(String(valido)); cambia(valido);
    }}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
function TarjetaSistema({ sim, tipo }) {
  const { vista, ajustes, setAjustes } = sim, f = vista?.flujos || {}, y = vista?.y;
  const cambia = (k, v) => setAjustes((a) => ({ ...a, [k]: v }));
  const bloques = {
    exterior: <section className="grupo-sistema exterior-sistema"><h2 className="asa-nodo-sistema"><span>1</span> Exterior</h2><p>Señales impuestas por el clima</p><div className="datos-sistema">
      <Dato nombre="Temperatura" valor={n(f.T_ext)} unidad="°C" /><Dato nombre="Sol" valor={n(f.sol_exterior / 500, 0)} unidad="W/m²" />
      <Dato nombre="Humedad" valor={n(f.HR_ext, 0)} unidad="%" /><Dato nombre="Viento" valor={n(f.viento_exterior)} unidad="m/s" />
    </div></section>,
    estado: <section className="grupo-sistema estado-sistema"><h2 className="asa-nodo-sistema"><span>2</span> Estado interno</h2><p>Variables que evolucionan con los balances</p><div className="datos-sistema">
      <TemperaturaAire vista={vista} /><Dato nombre="Humedad" valor={n(f.HR_int, 0)} unidad="%" />
      <Dato nombre="CO₂ interior" valor={n(f.CO2_ppm, 0)} unidad="ppm" /><Dato nombre="Agua en plantas" valor={n(y?.[22], 0)} unidad="L" />
      <Dato nombre="Agua en sustrato" valor={n(y?.[21], 0)} unidad="L" /><Dato nombre="Fruto (carbohidrato)" valor={n(y ? y[15] * 187.5 : NaN, 2)} unidad="kg" />
    </div></section>,
    control: <section className="grupo-sistema control-sistema"><h2 className="asa-nodo-sistema"><span>3</span> Control</h2><p>Decisiones que cambian los flujos</p><div className="mandos-sistema">
      <label>Riego<select aria-label="Riego" value={ajustes.riego} onChange={(e) => cambia('riego',e.target.value)}><option value="auto">Automático</option><option value="manual">Dosis fija</option><option value="apagado">Apagado</option></select></label>
      <label>{ajustes.riego === 'auto' ? 'Máx. L/m²/día' : 'L/m²/día'}<NumeroControl aria-label="Dosis de riego" min={0} max={12} step="0.5" valor={ajustes.dosisRiego} disabled={ajustes.riego === 'apagado'} cambia={(v) => cambia('dosisRiego', v)} /></label>
      <label className="calef-check"><span><input type="checkbox" checked={ajustes.calefaccion} onChange={(e) => cambia('calefaccion',e.target.checked)} /> Calefacción °C</span><NumeroControl aria-label="Consigna de calefacción" min={8} max={22} step="0.5" valor={ajustes.consignaCalef} disabled={!ajustes.calefaccion} cambia={(v) => cambia('consignaCalef', v)} /></label>
      <label>Ventanas desde °C<NumeroControl aria-label="Consigna de ventanas" min={15} max={32} step="0.5" valor={ajustes.ventilacion} cambia={(v) => cambia('ventilacion', v)} /></label>
      <label>Equipo<select aria-label="Tipo de calefactor" value={ajustes.equipo} onChange={(e) => cambia('equipo',e.target.value)}>{Object.entries(EQUIPOS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Inyección CO₂ kg/h<NumeroControl aria-label="Inyección de CO₂" min={0} max={10} step="0.5" valor={ajustes.co2} cambia={(v) => cambia('co2', v)} /></label>
    </div></section>,
  };
  return bloques[tipo];
}
export function TotalesResumen({ vista }) {
  if (!vista) return null;
  const e = vista.energia, kwh = (v) => n(v || 0, v > 0 && v < 0.1 ? 3 : 2);
  return <div className="totales-resumen" aria-label="Recursos acumulados">
    <span>Desde el inicio</span><strong>{n(vista.y[23],0)} <small>L de riego</small></strong>
    <strong>{kwh(e.electrica)} <small>kWh eléctricos</small></strong>
    <strong>{kwh(e.gas)} <small>kWh de gas</small></strong>
    <strong>{kwh(e.calor)} <small>kWh de calor útil</small></strong>
    <strong>{n(e.co2,1)} <small>kg de CO₂ inyectado</small></strong>
  </div>;
}


const INFO_DEPENDENCIAS = {
  clima: 'El sol, la temperatura, la humedad y el viento exteriores modifican los balances de energía y materia del invernadero.',
  accion: 'El riego aporta agua, la calefacción aporta calor, la inyección aporta CO₂ y las ventanas regulan los intercambios con el exterior.',
  medida: 'La temperatura interior determina la calefacción y la apertura de ventanas. El riego automático usa el agua disponible y la demanda de las plantas; la dosis fija y el CO₂ siguen su consigna.',
};
const SimulacionSistema = createContext(null);
function NodoSistema({ data }) {
  const { tipo, vertical } = data, sim = useContext(SimulacionSistema);
  const lateral = (lado) => vertical ? (lado === 'entrada' ? Position.Top : Position.Bottom) : (lado === 'entrada' ? Position.Left : Position.Right);
  const sitio = (v) => vertical ? { left: `${v}%` } : { top: `${v}%` };
  return <div className={`nodo-dependencia nodo-dependencia-${tipo}`}>
    {tipo === 'exterior' && <Handle id="clima" type="source" position={vertical ? Position.Bottom : Position.Right} />}
    {tipo === 'estado' && <>
      <Handle id="exterior" type="target" position={lateral('entrada')} />
      <Handle id="control" type="target" position={vertical ? Position.Bottom : Position.Right} style={sitio(30)} />
      <Handle id="medida" type="source" position={vertical ? Position.Bottom : Position.Right} style={sitio(78)} />
    </>}
    {tipo === 'control' && <>
      <Handle id="accion" type="source" position={vertical ? Position.Top : Position.Left} style={sitio(30)} />
      <Handle id="medida" type="target" position={vertical ? Position.Top : Position.Left} style={sitio(78)} />
    </>}
    <div className="nodrag nopan nowheel">
      <TarjetaSistema sim={sim} tipo={tipo} />
    </div>
  </div>;
}
const TIPOS_SISTEMA = { sistema: NodoSistema };
const POSICIONES = {
  horizontal: { exterior: { x: 0, y: 12 }, estado: { x: 300, y: 12 }, control: { x: 670, y: 12 } },
  vertical: { exterior: { x: 0, y: 0 }, estado: { x: 0, y: 205 }, control: { x: 0, y: 435 } },
};
function GrafoVariables({ sim, vertical, ancho, seleccion, setSeleccion }) {
  const { fitView } = useReactFlow(), inicializado = useNodesInitialized();
  useEffect(() => {
    if (!inicializado) return;
    const raf = requestAnimationFrame(() => fitView({ padding: 0.04, maxZoom: 1, duration: 0 }));
    return () => cancelAnimationFrame(raf);
  }, [inicializado, ancho, fitView]);
  const posiciones = vertical ? POSICIONES.vertical : POSICIONES.horizontal;
  // La topología no cambia con los fotogramas de la simulación. useNodesState conserva
  // measured/handleBounds a través de los cambios de dimensiones de React Flow.
  const iniciales = useMemo(() => ['exterior','estado','control'].map((tipo) => ({ id: tipo, type: 'sistema', position: posiciones[tipo],
    style: { pointerEvents: 'all', width: vertical ? 310 : tipo === 'exterior' ? 225 : tipo === 'estado' ? 300 : 340 },
    ariaLabel: tipo === 'exterior' ? 'Señales exteriores' : tipo === 'estado' ? 'Estado interno del sistema' : 'Controles del sistema',
    data: { tipo, vertical }, draggable: false, selectable: false })), [vertical]);
  const [nodes, , onNodesChange] = useNodesState(iniciales);
  const arista = (id, source, target, sourceHandle, targetHandle, label, color, discontinua = false) => ({
    id, source, target, sourceHandle, targetHandle, label, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
    style: { stroke: color, strokeWidth: seleccion === id ? 2.6 : 1.7, ...(discontinua && { strokeDasharray: '5 4' }) },
    labelStyle: { fill: color, fontSize: 12 }, labelBgStyle: { fill: '#0d1f36', fillOpacity: 1 }, labelBgPadding: [5, 3], labelBgBorderRadius: 3,
    interactionWidth: 24, ariaLabel: INFO_DEPENDENCIAS[id],
  });
  const edges = useMemo(() => [
    arista('clima','exterior','estado','clima','exterior','clima','#a9bdd5'),
    arista('accion','control','estado','accion','control','actuación','#72d6b9'),
    arista('medida','estado','control','medida','medida','medidas','#a99bff',true),
  ], [seleccion]);
  return <ReactFlow nodes={nodes} onNodesChange={onNodesChange} edges={edges} nodeTypes={TIPOS_SISTEMA}
    fitView fitViewOptions={{ padding: 0.04, maxZoom: 1 }} minZoom={0.3} maxZoom={1.3}
    nodesConnectable={false} nodesDraggable={false} nodesFocusable={false} edgesReconnectable={false} deleteKeyCode={null}
    panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
    onEdgeClick={(_, edge) => setSeleccion((v) => v === edge.id ? null : edge.id)} onPaneClick={() => setSeleccion(null)}
    proOptions={{ hideAttribution: true }} colorMode="dark" />;
}
export function VariablesSistema({ sim }) {
  const caja = useRef(null), [ancho, setAncho] = useState(0), [seleccion, setSeleccion] = useState(null);
  const vertical = ancho > 0 && ancho < 620;
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setAncho(entry.contentRect.width));
    ro.observe(caja.current);
    return () => ro.disconnect();
  }, []);
  return <section className="dependencias-sistema" aria-label="Dependencias entre exterior, estado y control">
    <div ref={caja} className={`lienzo-dependencias${vertical ? ' vertical' : ''}`}>
      {ancho > 0 && <SimulacionSistema.Provider value={sim}><ReactFlowProvider key={vertical ? 'vertical' : 'horizontal'}><GrafoVariables vertical={vertical} ancho={ancho} seleccion={seleccion} setSeleccion={setSeleccion} /></ReactFlowProvider></SimulacionSistema.Provider>}
    </div>
    <p className="leyenda-dependencias" role="status">{seleccion ? INFO_DEPENDENCIAS[seleccion] : <><span>→</span> Influencia sobre los balances <span className="medida-dependencia">⇢</span> Realimentación del estado al control. Pulsa una conexión para ver qué depende de qué.</>}</p>
  </section>;
}
