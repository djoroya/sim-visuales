import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// El portal evita que el lienzo de React Flow recorte o escale la gráfica.
export function TemperaturaAire({ vista }) {
  const [abierta, setAbierta] = useState(false), [posicion, setPosicion] = useState(null);
  const ancla = useRef(null), tarjeta = useRef(null), fijada = useRef(false), id = useId();
  useEffect(() => {
    if (!abierta) return;
    const coloca = () => {
      const r = ancla.current.getBoundingClientRect(), ancho = Math.min(300, innerWidth - 24);
      const alto = tarjeta.current?.offsetHeight || 210;
      setPosicion({ width: ancho, left: Math.max(12, Math.min(r.left, innerWidth - ancho - 12)),
        top: Math.max(12, r.bottom + alto + 10 < innerHeight ? r.bottom + 8 : r.top - alto - 8) });
    };
    const cierra = (e) => { if (!ancla.current?.contains(e.target) && !tarjeta.current?.contains(e.target)) { fijada.current = false; setAbierta(false); } };
    coloca();
    addEventListener('resize', coloca); addEventListener('scroll', coloca, true); addEventListener('pointerdown', cierra);
    return () => { removeEventListener('resize', coloca); removeEventListener('scroll', coloca, true); removeEventListener('pointerdown', cierra); };
  }, [abierta]);
  const actual = vista?.y ? vista.y[1] - 273.15 : NaN;
  const formato = (v) => Number.isFinite(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '—';
  const t1 = vista?.t || 0, t0 = t1 - 86400;
  const datos = (vista?.historial || []).filter((h) => h.t >= t0 && h.t < t1 && Number.isFinite(h.T_int));
  if (Number.isFinite(actual)) datos.push({ t: t1, T_int: actual });
  const min = Math.floor(Math.min(10, ...datos.map((h) => h.T_int)) / 5) * 5;
  const max = Math.ceil(Math.max(30, ...datos.map((h) => h.T_int)) / 5) * 5;
  const X = (t) => 30 + (t - t0) / 86400 * 240, Y = (v) => 110 - (v - min) / (max - min) * 92;
  return <div className="dato-sistema dato-temperatura nodrag nopan" ref={ancla} onMouseEnter={() => setAbierta(true)} onMouseLeave={() => { if (!fijada.current) setAbierta(false); }}>
    <button type="button" className="consulta-temperatura" aria-expanded={abierta} aria-controls={abierta ? id : undefined}
      onPointerDown={(e) => { if (e.pointerType === 'touch') fijada.current = true; }}
      onFocus={() => setAbierta(true)} onBlur={() => { if (!fijada.current) setAbierta(false); }} onClick={() => setAbierta(true)}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fijada.current = false; setAbierta(false); } }}>
      <span>Aire interior <span aria-hidden="true">↗</span></span><strong>{formato(actual)}<small>°C</small></strong>
    </button>
    {abierta && posicion && createPortal(<aside ref={tarjeta} id={id} className="temperatura-flotante" style={posicion} aria-label="Historial de temperatura del aire interior">
      <div><strong>Aire interior · {formato(actual)} °C</strong><span>Últimas 24 h · en directo</span></div>
      <svg viewBox="0 0 280 140" role="img" aria-label="Temperatura interior en grados Celsius frente al tiempo">
        {[min, (min + max) / 2, max].map((v) => <g key={v}><line x1="30" x2="270" y1={Y(v)} y2={Y(v)} stroke="#2d4466" /><text x="25" y={Y(v) + 3} textAnchor="end">{v}°</text></g>)}
        <polyline data-serie="temperatura-aire" points={datos.map((h) => `${X(h.t).toFixed(1)},${Y(h.T_int).toFixed(1)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
        {Number.isFinite(actual) && <circle cx={X(t1)} cy={Y(actual)} r="3" fill="#f59e0b" />}
        {[-24, -12, 0].map((h) => <text key={h} x={X(t1 + h * 3600)} y="132" textAnchor={h === 0 ? 'end' : 'start'}>{h === 0 ? 'Ahora' : `${h} h`}</text>)}
      </svg>
      <p>La curva avanza con el tiempo de la simulación.</p>
    </aside>, document.body)}
  </div>;
}
