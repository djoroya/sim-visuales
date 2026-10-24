// Gráficas pequeñas en SVG, sin librerías: series en el tiempo y el mapa del hollín.
import { MAPA } from "./simulacion.js";

const W = 300, H = 150, M = { i: 40, d: 10, a: 10, b: 22 };
const escala = (v0, v1, p0, p1) => (v) => p0 + ((v - v0) / (v1 - v0 || 1)) * (p1 - p0);
const num = (v, d = 0) => v.toLocaleString("es-ES", { maximumFractionDigits: d });

function Ejes({ x, y, yTicks, xTicks, fmtY, fmtX }) {
  return (
    <g className="ejes">
      {yTicks.map((v) => <g key={`y${v}`}><line x1={M.i} x2={W - M.d} y1={y(v)} y2={y(v)} /><text x={M.i - 4} y={y(v) + 4} textAnchor="end">{fmtY(v)}</text></g>)}
      {xTicks.map((v) => <text key={`x${v}`} x={x(v)} y={H - 6} textAnchor={x(v) > W - M.d - 14 ? "end" : x(v) < M.i + 10 ? "start" : "middle"}>{fmtX(v)}</text>)}
    </g>
  );
}

/** Marcas «redondas» para un eje de tiempo en minutos. */
function marcasTiempo(t0, t1) {
  const min = (t1 - t0) / 60, paso = [1, 2, 5, 10, 15, 30, 60, 120].find((p) => min / p <= 4) || 240;
  const ms = [];
  for (let m = Math.ceil(t0 / 60 / paso) * paso; m <= t1 / 60 + 1e-9; m += paso) ms.push(m * 60);
  return ms;
}

/** Series en el tiempo. series: [{ clave, color, nombre }]; datos: [{ t, ...claves }]. */
export function Serie({ titulo, datos, series, yMin = 0, yMax, unidad, decimales = 0 }) {
  const t0 = datos.length ? datos[0].t : 0, t1 = Math.max(t0 + 60, datos.length ? datos[datos.length - 1].t : 60);
  const vals = datos.flatMap((d) => series.map((s) => d[s.clave])).filter(Number.isFinite);
  const max = yMax ?? Math.max(1, ...vals) * 1.08, min = yMin ?? Math.min(...vals);
  const x = escala(t0, t1, M.i, W - M.d), y = escala(min, max, H - M.b, M.a);
  return (
    <div className="grafica">
      <div className="grafica-titulo">{titulo} <span className="leyenda">{series.length > 1 && series.map((s) => <span key={s.clave}><i style={{ background: s.color }} />{s.nombre}</span>)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <Ejes x={x} y={y} yTicks={[min, (min + max) / 2, max]} xTicks={marcasTiempo(t0, t1)} fmtY={(v) => `${num(v, decimales)}${unidad}`} fmtX={(v) => `${num(v / 60)} min`} />
        {series.map((s) => (
          <polyline key={s.clave} fill="none" stroke={s.color} strokeWidth="1.8"
            points={datos.filter((d) => Number.isFinite(d[s.clave])).map((d) => `${x(d.t).toFixed(1)},${y(Math.max(min, Math.min(max, d[s.clave]))).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
    </div>
  );
}

const T_CURVAS = [500, 600, 700, 800];
const COLOR_CURVA = { 500: "#a3311a", 600: "#d0541f", 700: "#f08a3c", 800: "#f7c35a" };

/** Mapa del hollín: por debajo de cada curva, el equilibrio a esa temperatura forma grafito. */
export function MapaHollin({ sc, o2c, T_C, scMin }) {
  const SCMAX = 3, x = escala(0, 1, M.i, W - M.d), y = escala(0, SCMAX, H - M.b, M.a);
  const curva = (k) => MAPA.o2c.map((o, i) => `${x(o).toFixed(1)},${y(Math.min(SCMAX, MAPA.sc_min[k][i])).toFixed(1)}`).join(" ");
  // zona con hollín a la temperatura actual: interpola entre las dos filas del mapa
  const Ts = MAPA.T_C, it = Math.min(Ts.length - 2, Math.max(0, Math.floor((T_C - Ts[0]) / (Ts[1] - Ts[0])))), v = Math.min(1, Math.max(0, (T_C - Ts[it]) / (Ts[1] - Ts[0])));
  const frontera = MAPA.o2c.map((o, i) => [o, (1 - v) * MAPA.sc_min[it][i] + v * MAPA.sc_min[it + 1][i]]);
  const zona = `M${x(0)} ${y(0)} ` + frontera.map(([o, s]) => `L${x(o).toFixed(1)} ${y(Math.min(SCMAX, s)).toFixed(1)}`).join(" ") + ` L${x(1)} ${y(0)} Z`;
  return (
    <div className="grafica">
      <div className="grafica-titulo">Hollín en equilibrio <span className="leyenda">{T_CURVAS.map((t) => <span key={t}><i style={{ background: COLOR_CURVA[t] }} />{t}</span>)} °C</span></div>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <Ejes x={x} y={y} yTicks={[0, 1, 2, 3]} xTicks={[0, 0.25, 0.5, 0.75, 1]} fmtY={(v) => num(v)} fmtX={(v) => num(v, 2)} />
        <path d={zona} fill="#000" opacity=".35" />
        <text x={x(0.03)} y={y(0.12)} className="ejes-t">hollín a {num(T_C)} °C</text>
        {T_CURVAS.map((t) => <polyline key={t} fill="none" stroke={COLOR_CURVA[t]} strokeWidth="1.6" points={curva(MAPA.T_C.indexOf(t))} />)}
        <circle cx={x(Math.min(1, o2c))} cy={y(Math.min(SCMAX, sc))} r="5" fill={sc < scMin ? "#111" : "#fff"} stroke="#f59e0b" strokeWidth="2.2" />
      </svg>
      <div className="grafica-pie">vertical: vapor/carbono · horizontal: oxígeno/carbono · ○ el reformador ahora</div>
    </div>
  );
}
