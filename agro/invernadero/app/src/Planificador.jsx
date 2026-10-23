import { useEffect, useRef, useState } from 'react';
import { POLITICAS } from './modelo/campana.js';
import { TIEMPOS } from './simulacion.js';
const COLORES = ['#38d5db', '#f59e0b', '#a99bff'];
const fmt = (v, dec = 1) => v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: dec });
const FECHAS = { hortimed: ['2018-02-15', '2018-08-09'], ges: ['2021-01-01', '2021-12-31'] };
const TARIFAS = [['agua','Agua (€/m³)'],['electrica','Electricidad (€/kWh)'],['gas','Gas (€/kWh)'],['co2','CO₂ (€/kg)']];
function Numero({ texto, valor, cambia, min, max, paso = 1, disabled = false }) {
  return <label>{texto}<input type="number" aria-label={texto} required min={min} max={max} step={paso} value={valor} disabled={disabled}
    onChange={(e) => cambia(e.target.value === '' ? '' : Number(e.target.value))} /></label>;
}
function Politica({ p, indice, cambia }) {
  const campo = (k) => (v) => cambia({ ...p, [k]: v });
  return <section className="politica" style={{ '--color-politica': COLORES[indice] }}>
    <label className="nombre-politica">Política {indice + 1}<input aria-label={`Nombre política ${indice + 1}`} required maxLength={60} value={p.nombre} onChange={(e) => campo('nombre')(e.target.value)} /></label>
    <label className="check"><input type="checkbox" checked={p.calefaccion} onChange={(e) => campo('calefaccion')(e.target.checked)} />Calefacción · máximo 40 kW</label>
    <div className="campos-politica">
      <Numero texto="Día (°C)" valor={p.dia} cambia={campo('dia')} min={5} max={25} paso={0.5} disabled={!p.calefaccion} />
      <Numero texto="Noche (°C)" valor={p.noche} cambia={campo('noche')} min={5} max={25} paso={0.5} disabled={!p.calefaccion} />
      <label>Equipo<select aria-label="Equipo" value={p.equipo} onChange={(e) => campo('equipo')(e.target.value)} disabled={!p.calefaccion}><option value="electrico">Calefactor eléctrico</option><option value="bomba">Bomba de calor</option><option value="caldera">Caldera de gas</option></select></label>
      <Numero texto="Ventanas desde (°C)" valor={p.ventanas} cambia={campo('ventanas')} min={15} max={35} paso={0.5} />
      <label>Pantalla de sombreo<select aria-label="Pantalla de la política" value={p.sombreoModo ?? 'retirada'} onChange={(e) => campo('sombreoModo')(e.target.value)}><option value="retirada">Retirada</option><option value="fijo">Cobertura fija</option><option value="auto">Automática</option></select></label>
      {p.sombreoModo === 'fijo' && <Numero texto="Cobertura de pantalla (%)" valor={p.sombreo ?? 50} cambia={campo('sombreo')} min={0} max={100} />}
      <label>Modo de ventanas<select aria-label="Ventanas de la política" value={p.ventanasModo ?? 'auto'} onChange={(e) => campo('ventanasModo')(e.target.value)}><option value="auto">Automático</option><option value="manual">Manual</option></select></label>
      {p.ventanasModo === 'manual' && <Numero texto="Apertura de ventanas (%)" valor={p.aperturaVentanas ?? 0} cambia={campo('aperturaVentanas')} min={0} max={100} />}
      <Numero texto="CO₂ de día (kg/h)" valor={p.co2} cambia={campo('co2')} min={0} max={10} paso={0.5} />
      <label>Riego<select aria-label="Modo de riego" value={p.riego} onChange={(e) => campo('riego')(e.target.value)}><option value="auto">Automático al 70 %</option><option value="manual">Dosis fija</option><option value="apagado">Apagado</option></select></label>
      <Numero texto={p.riego === 'auto' ? 'Máximo (L/m²/día)' : 'Dosis (L/m²/día)'} valor={p.dosis} cambia={campo('dosis')} min={0} max={12} paso={0.5} disabled={p.riego === 'apagado'} />
      <Numero texto="Riego desde (h)" valor={p.desde} cambia={campo('desde')} min={0} max={23} disabled={p.riego === 'apagado'} />
      <Numero texto="Riego hasta (h)" valor={p.hasta} cambia={campo('hasta')} min={1} max={24} disabled={p.riego === 'apagado'} />
    </div>
    <p className="suave">Día: 06–20 h. La dosis fija se reparte dentro del horario; en automático es el máximo diario disponible.</p>
  </section>;
}
function GraficoCampana({ resultados, seleccion, setSeleccion, recurso }) {
  const W = 680, H = 240, margen = 46, maxX = Math.max(1, ...resultados.map((r) => r[recurso])),
    minY = Math.min(0, ...resultados.map((r) => r.fresco)), maxY = Math.max(1, ...resultados.map((r) => r.fresco));
  const X = (x) => margen + x / maxX * (W - margen - 110), Y = (y) => H - margen - (y - minY) / (maxY - minY) * (H - margen - 24);
  return <svg className="grafico-campana" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Comparación de recursos y crecimiento del fruto">
    {[0, 0.5, 1].map((v) => <g key={v}><line x1={margen} x2={W - 100} y1={Y(minY + v * (maxY - minY))} y2={Y(minY + v * (maxY - minY))} stroke="#2d4466" /><text x={margen - 6} y={Y(minY + v * (maxY - minY)) + 4} textAnchor="end">{fmt(minY + v * (maxY - minY))}</text><text x={X(maxX * v)} y={H - 25} textAnchor="middle">{fmt(maxX * v, 0)}</text></g>)}
    <text x={margen} y={13}>Incremento de fruto · kg frescos equivalentes</text>
    <text x={W - 100} y={H - 5} textAnchor="end">{recurso === 'agua' ? 'Riego (L)' : recurso === 'energia' ? 'Energía final (kWh)' : 'Coste de recursos (€)'}</text>
    {resultados.map((r, i) => <g key={i} className="punto-campana" role="button" tabIndex={0} aria-label={`Seleccionar ${r.politica.nombre}`} onClick={() => setSeleccion(i)} onKeyDown={(e) => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); setSeleccion(i); } }}>
      <circle cx={X(r[recurso])} cy={Y(r.fresco)} r={seleccion === i ? 9 : 6} fill={COLORES[i]} stroke={seleccion === i ? '#fff' : 'none'} strokeWidth="2" />
      <text x={X(r[recurso]) + 12} y={Y(r.fresco) + (i - 1) * 14} fill={COLORES[i]}>{String.fromCharCode(65 + i)}</text>
      <title>{r.politica.nombre}: {fmt(r.fresco)} kg equivalentes, {fmt(r[recurso])} {recurso === 'agua' ? 'L' : recurso === 'energia' ? 'kWh' : '€'}</title>
    </g>)}
  </svg>;
}
function Evolucion({ resultados, seleccion }) {
  const maxY = Math.max(1, ...resultados.flatMap((r) => r.serie.map((s) => s.fresco))),
    minY = Math.min(0, ...resultados.flatMap((r) => r.serie.map((s) => s.fresco))), dias = resultados[0].serie.at(-1).dia;
  return <svg className="grafico-campana" viewBox="0 0 680 200" role="img" aria-label="Evolución diaria del crecimiento del fruto por política">
    <text x="46" y="14">Fruto acumulado · kg frescos equivalentes</text>
    {[0, 0.5, 1].map((v) => <g key={v}><line x1="46" x2="650" y1={160 - 130 * v} y2={160 - 130 * v} stroke="#2d4466" /><text x="40" y={164 - 130 * v} textAnchor="end">{fmt(minY + v * (maxY - minY))}</text><text x={46 + 604 * v} y="180" textAnchor="middle">{fmt(dias * v, 0)}</text></g>)}
    {resultados.map((r, i) => <polyline key={i} fill="none" stroke={COLORES[i]} opacity={seleccion === i ? 1 : 0.5} strokeWidth={seleccion === i ? 3 : 1.5}
      points={r.serie.map((s) => `${46 + 604 * s.dia / dias},${160 - 130 * (s.fresco - minY) / (maxY - minY)}`).join(' ')} />)}
    <text x="650" y="198" textAnchor="end">Días desde el inicio</text>
  </svg>;
}
function descarga(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo })), a = document.createElement('a');
  a.href = url; a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvValor = (v) => `"${String(v ?? '').replaceAll('"','""')}"`;
export default function Planificador() {
  const [tiempo, setTiempo] = useState('hortimed'), [fecha, setFecha] = useState('2018-04-16'), [dias, setDias] = useState(30);
  const [politicas, setPoliticas] = useState(() => POLITICAS.map((p) => ({ ...p })));
  const [porcentaje, setPorcentaje] = useState(6), [tarifas, setTarifas] = useState({ agua: 0, electrica: 0, gas: 0, co2: 0 });
  const [resultado, setResultado] = useState(null), [ejecutando, setEjecutando] = useState(false), [progreso, setProgreso] = useState(0), [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(0), [recurso, setRecurso] = useState('agua');
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const entrada = { tiempo, fecha, dias, politicas, porcentaje, tarifas }, firma = JSON.stringify(entrada);
  const cancela = () => { worker.current?.terminate(); worker.current = null; setEjecutando(false); setError('Cálculo cancelado. Puedes cambiar las políticas y volver a comparar.'); };
  const calcula = (e) => {
    e.preventDefault(); setError(''); setProgreso(0); setEjecutando(true);
    const anio = TIEMPOS[tiempo].anio, inicio = (Date.parse(fecha + 'T00:00:00Z') - Date.UTC(anio, 0, 1)) / 1000;
    const config = { inicio, dias, fraccion: porcentaje / 100, tarifas: { ...tarifas } };
    const w = new Worker(new URL('./campana.worker.js', import.meta.url), { type: 'module' }); worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.tipo === 'progreso') setProgreso(data.valor);
      else {
        if (data.tipo === 'resultado') { setResultado({ ...data, entrada: JSON.parse(firma), firma }); setSeleccion(0); setRecurso('agua'); }
        else setError(data.mensaje);
        w.terminate(); worker.current = null; setEjecutando(false);
      }
    };
    w.onerror = () => { setError('El cálculo no ha podido completarse. Revisa el periodo y vuelve a intentarlo.'); w.terminate(); worker.current = null; setEjecutando(false); };
    w.postMessage({ url: new URL(TIEMPOS[tiempo].archivo, location.href).href, config, politicas });
  };
  const csv = () => {
    const cabecera = ['politica','clima','fecha_inicio','dias','conversion_fresco_fraccion','fruto_CH2O_kg','fresco_equivalente_kg','riego_L','drenaje_L','calor_kWh','gas_kWh','electricidad_kWh','CO2_kg','coste_recursos_EUR','L_por_kg_equivalente','kWh_por_kg_equivalente','horas_estres'];
    const filas = resultado.resultados.map((r) => [r.politica.nombre, resultado.entrada.tiempo, resultado.entrada.fecha, resultado.config.dias, resultado.config.fraccion, r.fruto, r.fresco, r.agua, r.drenaje, r.calor, r.gas, r.electrica, r.co2, r.coste, r.litrosKg, r.kwhKg, r.horasEstres]);
    descarga('comparacion-invernadero.csv', '\ufeff' + [cabecera,...filas].map((f) => f.map(csvValor).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  const activo = resultado?.resultados[seleccion];
  return <section className="planificador">
    <header className="cabecera-plan"><span className="etiqueta-plan">SIMULADOR DE CAMPAÑA · 250 m²</span><h1>Qué gastamos y cuánto crece el cultivo</h1><p>Define políticas de control y compara sus resultados con el mismo clima y las mismas plantas iniciales.</p></header>
    <form onSubmit={calcula}>
      <fieldset disabled={ejecutando}>
        <legend>1. Periodo y supuestos comunes</legend>
        <div className="parametros-campana">
          <label>Clima de referencia<select aria-label="Clima de referencia" value={tiempo} onChange={(e) => { const k = e.target.value; setTiempo(k); setFecha(k === 'ges' ? '2021-04-16' : '2018-04-16'); }}><option value="hortimed">HortiMED · 2018</option><option value="ges">Inglaterra (GES) · 2021</option></select></label>
          <label>Fecha inicial<input aria-label="Fecha inicial" type="date" required min={FECHAS[tiempo][0]} max={FECHAS[tiempo][1]} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
          <Numero texto="Duración (días)" valor={dias} cambia={setDias} min={1} max={130} />
          <Numero texto="Conversión a fresco (%)" valor={porcentaje} cambia={setPorcentaje} min={1} max={20} paso={0.5} />
        </div>
        <p className="suave">Clima histórico impuesto durante toda la campaña; cada política empieza a las 00:00 con el mismo cultivo joven y las mismas reservas de agua. Se simula el periodo completo, sin prolongar los datos meteorológicos.</p>
        <details className="tarifas"><summary>Tarifas para calcular el coste de los recursos</summary><p className="suave">Introduce tus precios. Los valores iniciales a cero dejan el coste sin valorar.</p><div className="parametros-campana">{TARIFAS.map(([k, label]) => <Numero key={k} texto={label} valor={tarifas[k]} cambia={(v) => setTarifas((a) => ({ ...a, [k]: v }))} min={0} max={1000} paso={0.001} />)}</div></details>
      </fieldset>
      <fieldset disabled={ejecutando}><legend>2. Políticas de control</legend><div className="politicas">{politicas.map((p, i) => <Politica key={i} p={p} indice={i} cambia={(nuevo) => setPoliticas((a) => a.map((v, j) => i === j ? nuevo : v))} />)}</div></fieldset>
      <div className="acciones-campana"><button className="boton-comparar" type="submit" disabled={ejecutando}>{ejecutando ? `Calculando ${Math.round(progreso * 100)} %…` : 'Simular y comparar las 3 políticas'}</button>{ejecutando && <button type="button" onClick={cancela}>Cancelar</button>}<span className="suave" role="status">{ejecutando ? 'Calculando campañas completas en segundo plano.' : 'Mismo periodo · mismo estado inicial · paso de un minuto'}</span></div>
      {ejecutando && <progress aria-label="Progreso de la comparación" max="1" value={progreso} />}
    </form>
    {error && <p className="error-campana" role="alert">{error}</p>}
    <p className="limite-modelo">Estimaciones condicionadas al clima y al modelo. El resultado físico es el incremento neto de carbohidrato del fruto; su equivalente fresco divide por la conversión elegida. No calcula cosecha, maduración comercial ni pérdidas. El agua y el estrés hídrico están pendientes de calibración experimental.</p>
    {resultado && <section aria-label="Resultados de la comparación" className="resultados-campana">
      <div className="titulo-resultados"><div><h2>Resultados de la última ejecución</h2><p>{resultado.entrada.fecha} · {resultado.config.dias} días · {TIEMPOS[resultado.entrada.tiempo].nombre} · conversión {resultado.config.fraccion * 100} %</p></div><div className="acciones-exportar"><button onClick={csv}>Descargar CSV</button><button onClick={() => descarga('campana-invernadero.json', JSON.stringify({ version: 1, modelo: 'GES + agua didáctica, ROS2 60 s', supuestos: 'Equivalente fresco, sin cosecha; sin costes de bombeo, trabajo ni capital.', ...resultado }, null, 2), 'application/json')}>Exportar escenario y series</button></div></div>
      {resultado.firma !== firma && <p className="pendiente-campana">Has cambiado las entradas. Vuelve a simular para actualizar estos resultados.</p>}
      <div className="tabla-scroll"><table className="tabla-campana"><thead><tr><th>Resultado · total 250 m²</th>{resultado.resultados.map((r, i) => <th key={i}><button style={{ color: COLORES[i] }} aria-pressed={seleccion === i} onClick={() => setSeleccion(i)}>{r.politica.nombre}</button></th>)}</tr></thead><tbody>
        {[
          ['Fruto nuevo (kg CH₂O)', 'fruto'], ['Equivalente fresco (kg)', 'fresco'], ['Riego aportado (L)', 'agua'], ['Drenaje (L)', 'drenaje'],
          ['Calor útil (kWh)', 'calor'], ['Gas (kWh)', 'gas'], ['Electricidad (kWh)', 'electrica'], ['CO₂ inyectado (kg)', 'co2'],
          ['Agua / fruto equivalente (L/kg)', 'litrosKg'], ['Energía / fruto equivalente (kWh/kg)', 'kwhKg'],
          ['Coste de recursos (€)', 'coste'], ['Coste / fruto equivalente (€/kg)', 'costeKg'], ['Horas con estrés hídrico', 'horasEstres'], ['Temperatura media (°C)', 'temperaturaMedia'],
        ].map(([nombre, k]) => <tr key={k}><th>{nombre}</th>{resultado.resultados.map((r, i) => <td key={i} className={seleccion === i ? 'celda-activa' : ''}>{['coste','costeKg'].includes(k) && Object.values(resultado.config.tarifas).every((v) => v === 0) ? 'Sin valorar' : fmt(r[k], ['fruto','costeKg'].includes(k) ? 3 : 1)}</td>)}</tr>)}
      </tbody></table></div>
      <div className="graficos-campana"><div><label>Comparar producción frente a<select aria-label="Recurso del gráfico" value={recurso} onChange={(e) => setRecurso(e.target.value)}><option value="agua">Riego</option><option value="energia">Energía final</option><option value="coste" disabled={Object.values(resultado.config.tarifas).every((v) => v === 0)}>Coste de recursos</option></select></label><GraficoCampana resultados={resultado.resultados} seleccion={seleccion} setSeleccion={setSeleccion} recurso={recurso} /></div><div><h3>Evolución de las tres políticas</h3><Evolucion resultados={resultado.resultados} seleccion={seleccion} /></div></div>
      <p className="detalle-seleccion" style={{ borderColor: COLORES[seleccion] }}><strong>{activo.politica.nombre}</strong> · {fmt(activo.fresco / 250, 2)} kg equivalentes/m² · {fmt(activo.agua / 250)} L/m² · {fmt(activo.energia / 250)} kWh/m². Selecciona una columna o un punto para resaltarla.</p>
      <p className="suave">Fuente: {resultado.fuente}. Gas y electricidad son energía final de calefacción. No se incluyen bombeo del riego, iluminación, trabajo ni inversión. Los precios cero omiten ese recurso del coste; no representan una tarifa de mercado. Cambiar el estado inicial, el clima o la conversión cambia la predicción.</p>
    </section>}
  </section>;
}
