// Gráficas pequeñas en SVG, sin librerías: series de los últimos segundos y curva de polarización.
const W = 300, H = 130, M = { i: 42, d: 8, a: 10, b: 22 };

function escala(v0, v1, p0, p1) { return (v) => p0 + ((v - v0) / (v1 - v0 || 1)) * (p1 - p0); }

function Ejes({ x, y, yTicks, xTicks, fmtY = (v) => v, fmtX = (v) => v }) {
  return (
    <g className="ejes">
      {yTicks.map((v) => (
        <g key={`y${v}`}><line x1={M.i} x2={W - M.d} y1={y(v)} y2={y(v)} /><text x={M.i - 4} y={y(v) + 4} textAnchor="end">{fmtY(v)}</text></g>
      ))}
      {xTicks.map((v) => <text key={`x${v}`} x={x(v)} y={H - 6} textAnchor={x(v) > W - M.d - 12 ? "end" : "middle"}>{fmtX(v)}</text>)}
    </g>
  );
}

/** Series en el tiempo. series: [{ clave, color, nombre }]; datos: [{ t, ...claves }]. */
export function Serie({ titulo, datos, series, yMin = 0, yMax, unidad, ventana = 90 }) {
  const tFin = datos.length ? datos[datos.length - 1].t : 0, t0 = Math.max(0, tFin - ventana);
  const vis = datos.filter((d) => d.t >= t0);
  const max = yMax ?? Math.max(1, ...vis.flatMap((d) => series.map((s) => (Number.isFinite(d[s.clave]) ? d[s.clave] : 0)))) * 1.1;
  const x = escala(t0, Math.max(t0 + ventana, tFin), M.i, W - M.d), y = escala(yMin, max, H - M.b, M.a);
  const ticks = [yMin, (yMin + max) / 2, max];
  return (
    <div className="grafica">
      <div className="grafica-titulo">{titulo} <span className="leyenda">{series.map((s) => <span key={s.clave}><i style={{ background: s.color }} />{s.nombre}</span>)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <Ejes x={x} y={y} yTicks={ticks} xTicks={[]} fmtY={(v) => `${v.toLocaleString("es-ES", { maximumFractionDigits: v >= 10 ? 0 : 1 })}${unidad}`} />
        {series.map((s) => (
          <polyline key={s.clave} fill="none" stroke={s.color} strokeWidth="1.8"
            points={vis.filter((d) => Number.isFinite(d[s.clave])).map((d) => `${x(d.t).toFixed(1)},${y(Math.max(yMin, Math.min(max, d[s.clave]))).toFixed(1)}`).join(" ")} />
        ))}
        <text x={W - M.d} y={H - 6} textAnchor="end" className="ejes-t">últimos {ventana} s</text>
      </svg>
    </div>
  );
}

/** Curva de polarización (tensión por celda y potencia) con el punto de trabajo. */
export function Polarizacion({ puntos, I, V, P, Imax: Ilim }) {
  const Imax = puntos.length ? puntos[puntos.length - 1].I : 60, Pmax = Math.max(1, ...puntos.map((p) => p.P)) * 1.1;
  const x = escala(0, Math.max(60, Imax), M.i, W - M.d), yv = escala(0.2, 1.1, H - M.b, M.a), yp = escala(0, Pmax, H - M.b, M.a);
  const pMax = puntos.reduce((a, p) => (p.P > a.P ? p : a), { P: 0, I: 0 });
  return (
    <div className="grafica">
      <div className="grafica-titulo">Curva de polarización <span className="leyenda"><span><i style={{ background: "#4f9be8" }} />V por celda</span><span><i style={{ background: "#f59e0b" }} />potencia</span></span></div>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <Ejes x={x} y={yv} yTicks={[0.4, 0.7, 1.0]} xTicks={[0, 20, 40, 60].filter((v) => v <= Math.max(60, Imax))} fmtY={(v) => v.toFixed(1)} fmtX={(v) => `${v} A`} />
        <polyline fill="none" stroke="#4f9be8" strokeWidth="1.8" points={puntos.map((p) => `${x(p.I).toFixed(1)},${yv(p.V).toFixed(1)}`).join(" ")} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="4 3" points={puntos.map((p) => `${x(p.I).toFixed(1)},${yp(p.P).toFixed(1)}`).join(" ")} />
        {pMax.P > 0 && <g><line x1={x(pMax.I)} x2={x(pMax.I)} y1={M.a} y2={H - M.b} stroke="#f59e0b" strokeOpacity="0.35" /><text x={x(pMax.I) + 3} y={M.a + 9} className="ejes-t">máx. {pMax.P.toFixed(0)} W</text></g>}
        {Number.isFinite(Ilim) && Ilim < Math.max(60, Imax) && <g><line x1={x(Ilim)} x2={x(Ilim)} y1={M.a} y2={H - M.b} stroke="#e07a5f" strokeDasharray="3 3" /><text x={x(Ilim) - 3} y={H - M.b - 4} textAnchor="end" className="ejes-t">límite</text></g>}
        {Number.isFinite(V) && V > 0.2 && <circle cx={x(I)} cy={yv(V)} r="4.5" fill="#fff" stroke="#4f9be8" strokeWidth="2" />}
        {Number.isFinite(P) && P > 0 && <circle cx={x(I)} cy={yp(P)} r="3.5" fill="#f59e0b" />}
      </svg>
    </div>
  );
}
