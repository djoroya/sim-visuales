import { potenciaRecursos } from './modelo/recursos.js';
const n = (v, d = 1) => (v ?? 0).toLocaleString('es-ES', { maximumFractionDigits: d });
export function EstadoActuadores({ sim }) {
  const { vista, ajustes: a, setAjustes } = sim, f = vista?.flujos || {}, e = vista?.energia || {};
  const p = potenciaRecursos(f.calefaccion || 0, a.equipo, f.T_ext || 0);
  const cambia = (k,v) => setAjustes((aj) => ({ ...aj, [k]: v }));
  return <section className="estado-actuadores" aria-label="Estado de los actuadores">
    <article><h3>Calefactor <span className={f.calefaccion > 1 ? 'activo' : ''}>{!a.calefaccion ? 'Deshabilitado' : f.calefaccion > 1 ? 'Calentando' : 'Sin demanda'}</span></h3>
      <p aria-live="polite">{n((f.calefaccion || 0)/1000)} kW de calor · <strong>{n(p.electrica/1000,2)} kW eléctricos</strong></p>
      <p>{n(e.arranques,0)} arranques · {n(e.horasActiva,2)} h activo</p>
      <details><summary>Ajustes de arranque</summary><label>Electricidad extra por arranque (Wh)<input aria-label="Electricidad por arranque" type="number" min="0" max="10000" value={a.arranqueWh} onChange={(e) => cambia('arranqueWh', Math.max(0, Math.min(10000, +e.target.value)))} /></label><p>Introduce el dato del equipo. Cero no añade un consumo de arranque supuesto; el consumo mientras calienta sí se integra.</p></details>
    </article>
    <article><h3>Ventanas <span>{n((f.apertura || 0)*100,0)} % abiertas</span></h3>
      <label>Modo de ventanas<select aria-label="Modo de ventanas" value={a.ventanasModo} onChange={(e) => cambia('ventanasModo',e.target.value)}><option value="auto">Automático por temperatura</option><option value="manual">Apertura manual</option></select></label>
      {a.ventanasModo === 'manual' && <label>Apertura<input aria-label="Apertura de ventanas" type="range" min="0" max="100" value={a.aperturaVentanas} onChange={(e) => cambia('aperturaVentanas',+e.target.value)} /></label>}
      <p>{n(f.renovaciones_h)} renovaciones/h</p>
      <details><summary>Motor · {n(e.electrica_ventanas,3)} kWh</summary><label>Wh por apertura completa (todos los motores)<input aria-label="Electricidad motor ventanas" type="number" min="0" max="10000" value={a.motorVentanasWh} onChange={(e) => cambia('motorVentanasWh',Math.max(0,Math.min(10000,+e.target.value)))} /></label><p>El cierre cuesta lo mismo. Cero deja el movimiento sin valorar.</p></details>
    </article>
    <article><h3>Pantalla de sombreo <span>{n((f.sombreo_cierre || 0)*100,0)} % cubierta</span></h3>
      <label>Modo de pantalla<select aria-label="Modo de pantalla" value={a.sombreoModo} onChange={(e) => cambia('sombreoModo',e.target.value)}><option value="retirada">Retirada</option><option value="fijo">Cobertura fija</option><option value="auto">Automática desde 250 W/m²</option></select></label>
      {a.sombreoModo === 'fijo' && <label>Cobertura<input aria-label="Cobertura de sombreo" type="range" min="0" max="100" value={a.sombreo} onChange={(e) => cambia('sombreo',+e.target.value)} /></label>}
      <details><summary>Motor · {n(e.electrica_pantalla,3)} kWh</summary><label>Wh por despliegue completo<input aria-label="Electricidad motor pantalla" type="number" min="0" max="10000" value={a.motorPantallaWh} onChange={(e) => cambia('motorPantallaWh',Math.max(0,Math.min(10000,+e.target.value)))} /></label><p>Recoger cuesta lo mismo. Cero deja el movimiento sin valorar.</p></details>
      <p>Tras pantalla: {n((f.sol_tras_pantalla || 0)/500,0)} W/m²</p>
    </article>
  </section>;
}
