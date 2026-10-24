// Esquema del reformador, al estilo de los de libro: entran diésel, vapor y aire por la izquierda, el
// catalizador (un monolito de canales) en el centro y el gas reformado sale por la derecha. Está vivo:
// el grosor de las flechas sigue a los caudales, el monolito toma el color de su temperatura, y arriba
// se ve el calor que da la oxidación y el que se lleva el reformado.
import { CH4, CHX, CO, CO2, H2, H2O, N2 } from "./modelo/reformador.js";

const C = { comb: "#f08a3c", vapor: "#7dd3fc", aire: "#c7d2fe", calor: "#ef6f45", frio: "#4f9be8", gas: "#e8eef6" };
const NOMBRE = [[H2, "H₂"], [CO, "CO"], [CO2, "CO₂"], [H2O, "H₂O"], [N2, "N₂"], [CH4, "CH₄"], [CHX, "diésel"]];
const num = (v, d = 0) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (f) => `${num(f * 100, f < 0.1 ? 1 : 0)} %`;

/** Color de incandescencia: de rojo oscuro (400 °C) a amarillo (1000 °C). */
export function colorT(T_C) {
  const paradas = [[300, [60, 30, 30]], [450, [110, 32, 20]], [600, [170, 50, 26]], [750, [226, 104, 34]], [900, [250, 170, 60]], [1000, [255, 214, 110]]];
  const t = Math.min(1000, Math.max(300, T_C));
  let k = 0;
  while (k < paradas.length - 2 && t > paradas[k + 1][0]) k++;
  const [t0, c0] = paradas[k], [t1, c1] = paradas[k + 1], u = (t - t0) / (t1 - t0);
  return `rgb(${c0.map((c, i) => Math.round(c + u * (c1[i] - c))).join(",")})`;
}

function Flecha({ x0, x1, y, g, color, opacidad = 1 }) {
  const d = Math.sign(x1 - x0), p = Math.min(12 + g / 2, Math.abs(x1 - x0) * 0.45), m = g / 2, a = m + 6;
  return <path d={`M${x0} ${y - m}H${x1 - d * p}V${y - a}L${x1} ${y}L${x1 - d * p} ${y + a}V${y + m}H${x0}Z`} fill={color} opacity={opacidad} />;
}

/** Flecha ondulada vertical (calor), de y0 a y1. */
function Calor({ x, y0, y1, g, color, opacidad }) {
  const d = Math.sign(y1 - y0), n = 3, paso = (y1 - y0 - d * 10) / n;
  let ruta = `M${x} ${y0}`;
  for (let k = 0; k < n; k++) ruta += ` q${k % 2 ? -7 : 7} ${paso / 2} 0 ${paso}`;
  return (
    <g opacity={opacidad}>
      <path d={ruta} fill="none" stroke={color} strokeWidth={g} strokeLinecap="round" />
      <path d={`M${x - 8} ${y1 - d * 10} L${x} ${y1} L${x + 8} ${y1 - d * 10}`} fill="none" stroke={color} strokeWidth={g} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export default function Esquema({ l, e, mandos, velocidad }) {
  const W = 640, H = 400;
  const xR = 190, xR1 = 450, yR = 128, yR1 = 300, yM = (yR + yR1) / 2;      // monolito
  const grosor = (F) => Math.max(2.5, Math.min(24, 1600 * F));
  const Fsale = l.F.reduce((a, b) => a + b, 0);
  // gas por los canales: más deprisa cuanto más caudal (en el reloj del visor, sin pasar de lo que se ve)
  const dur = Math.max(0.35, 0.02 / Math.max(1e-4, Fsale) / Math.sqrt(velocidad));
  const canales = Array.from({ length: 11 }, (_, k) => yR + 10 + k * ((yR1 - yR - 20) / 10));
  const top = NOMBRE.map(([i, n]) => [n, l.y[i]]).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const gOx = 2 + Math.min(7, l.qOxidacion / 150), gRef = 2 + Math.min(7, -l.qReformado / 150);
  const entradas = [
    { y: yM - 60, F: e.combustible, color: C.comb, nombre: "Diésel", dato: `${num(mandos.potencia, 1)} kW` },
    { y: yM, F: e.vapor, color: C.vapor, nombre: "Vapor", dato: `S/C ${num(mandos.sc, 1)}` },
    { y: yM + 60, F: e.aire, color: C.aire, nombre: "Aire", dato: `O₂/C ${num(mandos.o2c, 2)}` },
  ];
  // motas de hollín repartidas sin patrón (secuencia R₂ de Roberts)
  const motas = l.hollin ? Array.from({ length: 26 }, (_, k) => [xR + 14 + (((k * 0.7548777) % 1) * (xR1 - xR - 28)), yR + 12 + (((k * 0.5698403) % 1) * (yR1 - yR - 24))]) : [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="esquema" role="img" aria-label="Esquema del reformador: diésel, vapor y aire entran por la izquierda, atraviesan el catalizador y sale gas rico en hidrógeno por la derecha; arriba, el calor de la oxidación entra en el catalizador y el del reformado sale">
      {/* entradas */}
      {entradas.map((en) => (
        <g key={en.nombre}>
          <text x={6} y={en.y - grosor(en.F) / 2 - 8} className="esq-titulo">{en.nombre} <tspan className="esq-suave">{en.dato}</tspan></text>
          <Flecha x0={4} x1={xR - 30} y={en.y} g={grosor(en.F)} color={en.color} />
        </g>
      ))}

      {/* carcasa y monolito */}
      <rect x={xR - 22} y={yR - 14} width={xR1 - xR + 44} height={yR1 - yR + 28} rx="14" fill="none" stroke="#9fb3c8" strokeWidth="3" />
      <rect x={xR} y={yR} width={xR1 - xR} height={yR1 - yR} rx="4" fill={colorT(l.T_C)} />
      {canales.map((y) => <line key={y} x1={xR + 4} x2={xR1 - 4} y1={y} y2={y} stroke="#000" strokeOpacity=".28" strokeWidth="5" />)}
      {canales.map((y, k) => (
        <line key={`g${y}`} x1={xR + 4} x2={xR1 - 4} y1={y} y2={y} stroke={C.gas} strokeOpacity=".55" strokeWidth="2.2" strokeDasharray="5 22" strokeLinecap="round">
          <animate attributeName="stroke-dashoffset" from="27" to="0" dur={`${dur}s`} begin={`${-(k * dur) / 11}s`} repeatCount="indefinite" />
        </line>
      ))}
      {motas.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="3.2" fill="#111" />)}
      <text x={(xR + xR1) / 2} y={yM + 12} textAnchor="middle" className="esq-T">{num(l.T_C)} °C</text>
      <text x={(xR + xR1) / 2} y={yR1 + 36} textAnchor="middle" className="esq-capa-n">Catalizador</text>
      {l.hollin && <text x={(xR + xR1) / 2} y={yR1 + 56} textAnchor="middle" className="esq-hollin">en equilibrio, a esta temperatura se forma hollín</text>}

      {/* calor: la oxidación calienta el catalizador, el reformado lo enfría */}
      <text x={xR + 50} y={22} textAnchor="middle" className="esq-calor">Oxidación</text>
      <text x={xR + 50} y={40} textAnchor="middle" className="esq-suave">CHₓ + O₂ → CO₂ + H₂O</text>
      <text x={xR + 50} y={58} textAnchor="middle" className="esq-num calor">+{num(Math.max(0, l.qOxidacion))} W</text>
      <Calor x={xR + 50} y0={66} y1={yR - 4} g={gOx} color={C.calor} opacidad={l.qOxidacion > 5 ? 1 : 0.25} />
      <text x={xR1 - 50} y={22} textAnchor="middle" className="esq-frio">Reformado</text>
      <text x={xR1 - 50} y={40} textAnchor="middle" className="esq-suave">CHₓ + H₂O → CO + H₂</text>
      <text x={xR1 - 50} y={58} textAnchor="middle" className="esq-num frio">−{num(Math.max(0, -l.qReformado))} W</text>
      <Calor x={xR1 - 50} y0={yR - 4} y1={66} g={gRef} color={C.frio} opacidad={l.qReformado < -5 ? 1 : 0.25} />

      {/* salida */}
      <Flecha x0={xR1 + 22} x1={W - 112} y={yM} g={grosor(Fsale)} color={colorT(l.T_C)} />
      <text x={W - 104} y={yM - 92} className="esq-titulo">Gas</text>
      <text x={W - 104} y={yM - 72} className="esq-titulo">reformado</text>
      <g className="esq-comp">{top.map(([n, v], k) => <text key={n} x={W - 104} y={yM - 48 + k * 21}>{n} {pct(v)}</text>)}</g>
    </svg>
  );
}
