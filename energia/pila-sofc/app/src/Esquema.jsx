// Esquema de una celda, al estilo de los de libro: canal de combustible a la izquierda, ánodo |
// electrolito | cátodo en vertical, canal de aire a la derecha y el circuito exterior arriba.
// Está vivo: el grosor de las flechas sigue a la corriente, los iones O²⁻ y los electrones van más
// deprisa cuanta más corriente, y la composición de los canales sale en números.
const IDX = { H2: 0, O2: 1, H2O: 2, N2: 3, CO: 4, CH4: 5, CO2: 6 };
const NOMBRE = { H2: "H₂", CO: "CO", CH4: "CH₄", H2O: "H₂O", CO2: "CO₂", N2: "N₂", O2: "O₂" };
const C = { comb: "#f08a3c", aire: "#6cc4f0", elec: "#ef4444", ion: "#f2c14e", calor: "#e07a5f", carga: "#f59e0b" };
const pct = (f) => `${(f * 100).toLocaleString("es-ES", { maximumFractionDigits: f < 0.1 ? 1 : 0 })} %`;

/** Flecha de bloque horizontal, de x0 a x1 a la altura y; el grosor dice cuánto pasa. */
function Flecha({ x0, x1, y, g, color, opacidad = 1 }) {
  const d = Math.sign(x1 - x0), p = Math.min(14 + g / 2, Math.abs(x1 - x0) * 0.45), m = g / 2, a = m + 6;
  return <path d={`M${x0} ${y - m}H${x1 - d * p}V${y - a}L${x1} ${y}L${x1 - d * p} ${y + a}V${y + m}H${x0}Z`} fill={color} opacity={opacidad} />;
}

export default function Esquema({ l, I, velocidad }) {
  const W = 600, H = 470;
  const fa = l.fracAnodo, sumaC = l.pc.reduce((a, b) => a + b, 0), fc = l.pc.map((p) => p / sumaC);
  const hay = I > 0.05;
  const gI = 4 + Math.min(16, I / 3);                                 // flechas de reacción: proporcionales a la corriente
  const durIon = hay ? Math.max(0.5, 30 / I) / velocidad : 0;
  const durElec = hay ? Math.max(0.6, 40 / I) / velocidad : 0;
  const iones = hay ? Math.min(12, Math.round(I / 4) + 2) : 0;
  // composición del ánodo: las tres especies que más hay
  const top = ["H2", "H2O", "CO2", "CO", "CH4"].map((e) => [e, fa[IDX[e]] || 0]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const calor = Number.isFinite(l.calor) ? l.calor : 0, gCalor = 1.5 + Math.min(5, calor / 200);

  // geometría: canal de combustible | ánodo | electrolito | cátodo | canal de aire
  const xA = 180, xE = 222, xC = 378, xAi = 420, y0 = 96, y1 = 372, xa = (xA + xE) / 2, xc = (xC + xAi) / 2;
  const circuito = `M${xa} ${y0} V44 H${W / 2 - 26} M${W / 2 + 26} 44 H${xc} V${y0}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="esquema" role="img" aria-label="Esquema de la celda: combustible a la izquierda, ánodo, electrolito y cátodo en el centro, aire a la derecha; los iones de oxígeno cruzan el electrolito y los electrones dan la vuelta por el circuito exterior">
      {/* canales y capas */}
      <rect x={24} y={y0} width={xA - 24} height={y1 - y0} fill={C.comb} opacity=".12" rx="6" />
      <rect x={xAi} y={y0} width={W - 24 - xAi} height={y1 - y0} fill={C.aire} opacity=".12" rx="6" />
      <rect x={xA} y={y0} width={xE - xA} height={y1 - y0} fill="#8a6a4a" />
      <rect x={xE} y={y0} width={xC - xE} height={y1 - y0} fill="#2c5f8a" />
      <rect x={xC} y={y0} width={xAi - xC} height={y1 - y0} fill="#5b8fbf" />
      <text x={xa} y={y1 + 22} textAnchor="middle" className="esq-capa-n">Ánodo</text>
      <text x={(xE + xC) / 2} y={y1 + 22} textAnchor="middle" className="esq-capa-n">Electrolito</text>
      <text x={xc} y={y1 + 22} textAnchor="middle" className="esq-capa-n">Cátodo</text>

      {/* circuito exterior: los electrones salen del ánodo, pasan por la carga y vuelven por el cátodo */}
      <path d={circuito} fill="none" stroke="#9fb3c8" strokeWidth="3" />
      {hay && <path d={circuito} fill="none" stroke={C.elec} strokeWidth="3.5" strokeDasharray="4 14" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="72" to="0" dur={`${durElec}s`} repeatCount="indefinite" />
      </path>}
      <g opacity={l.electrica > 0 ? 1 : 0.4}>
        <circle cx={W / 2} cy={44} r="24" fill="#0d1f36" stroke={C.carga} strokeWidth="3" />
        <path d={`M${W / 2 - 12} 50 q4 -14 8 0 q4 -14 8 0 q4 -14 8 0`} fill="none" stroke={C.carga} strokeWidth="2.5" />
      </g>
      <text x={W / 2} y={14} textAnchor="middle" className="esq-elec">{l.electrica > 0 ? `${l.electrica.toFixed(0)} W de electricidad` : "sin corriente"}</text>
      <text x={xa - 10} y={40} textAnchor="end" className="esq-e">e⁻</text>
      <text x={xc + 10} y={40} className="esq-e">e⁻</text>
      {/* electrones: suben por el ánodo y bajan por el cátodo */}
      {hay && [[xa, y1 - 30, y0 + 22], [xc, y0 + 22, y1 - 30]].map(([x, ya, yb], k) => (
        <g key={k}>
          <line x1={x} x2={x} y1={ya} y2={yb} stroke={C.elec} strokeWidth="3.5" strokeDasharray="4 14" strokeLinecap="round">
            <animate attributeName="stroke-dashoffset" from="72" to="0" dur={`${durElec}s`} repeatCount="indefinite" />
          </line>
          <path d={`M${x - 7} ${yb + (yb < ya ? 11 : -11)} L${x} ${yb} L${x + 7} ${yb + (yb < ya ? 11 : -11)}`} fill="none" stroke={C.elec} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      ))}

      {/* combustible: entra, reacciona en el ánodo y sale lo que no se usa */}
      <text x={6} y={y0 - 8} className="esq-titulo">Combustible</text>
      <Flecha x0={4} x1={92} y={y0 + 24} g={14} color={C.comb} />
      <Flecha x0={xA - 70} x1={xA - 4} y={y0 + 100} g={gI} color={C.comb} opacidad={hay ? 0.95 : 0.25} />
      <text x={xA - 76} y={y0 + 106} textAnchor="end" className="esq-gas">H₂</text>
      <Flecha x0={xA - 4} x1={xA - 70} y={y0 + 160} g={gI} color={C.aire} opacidad={hay ? 0.95 : 0.25} />
      <text x={xA - 76} y={y0 + 166} textAnchor="end" className="esq-gas">H₂O</text>
      <g className="esq-comp">{top.map(([e, f], k) => <text key={e} x={34} y={y0 + 206 + k * 19}>{NOMBRE[e]} {pct(f)}</text>)}</g>
      <Flecha x0={92} x1={4} y={y1 - 22} g={14} color={C.comb} opacidad=".7" />
      <text x={6} y={y1 + 22} className="esq-suave">sale lo no usado</text>

      {/* aire: entra, el O₂ pasa al cátodo y sale el resto */}
      <text x={W - 6} y={y0 - 8} textAnchor="end" className="esq-titulo">Aire</text>
      <Flecha x0={W - 4} x1={W - 92} y={y0 + 24} g={14} color={C.aire} />
      <Flecha x0={xAi + 70} x1={xAi + 4} y={y0 + 130} g={gI} color={C.aire} opacidad={hay ? 0.95 : 0.25} />
      <text x={xAi + 76} y={y0 + 136} className="esq-gas">O₂</text>
      <g className="esq-comp"><text x={W - 34} y={y0 + 206} textAnchor="end">O₂ {pct(fc[IDX.O2])}</text></g>
      <Flecha x0={W - 92} x1={W - 4} y={y1 - 22} g={14} color={C.aire} opacidad=".7" />
      <text x={W - 6} y={y1 + 22} textAnchor="end" className="esq-suave">sale con menos O₂</text>

      {/* iones O²⁻ cruzando el electrolito, del cátodo al ánodo */}
      <text x={(xE + xC) / 2} y={y0 + 36} textAnchor="middle" className="esq-ion">O²⁻ ←</text>
      {Array.from({ length: iones }, (_, k) => (
        <circle key={k} cy={y0 + 64 + ((k * 53) % (y1 - y0 - 90))} r="6" fill={C.ion}>
          <animate attributeName="cx" from={xC - 8} to={xE + 8} dur={`${durIon}s`} begin={`${(k * durIon) / iones}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* calor: lo que no sale como electricidad */}
      <g fill="none" stroke={C.calor} strokeWidth={gCalor} strokeLinecap="round" opacity={calor > 0 ? 0.85 : 0.2}>
        {[-40, 0, 40].map((dx) => <path key={dx} d={`M${(xE + xC) / 2 + dx} ${y1 + 34} q-8 10 0 20 q8 10 0 20`} />)}
      </g>
      <text x={(xE + xC) / 2} y={H - 6} textAnchor="middle" className="esq-calor">{calor > 0 ? `${calor.toFixed(0)} W de calor` : "sin calor"}</text>
    </svg>
  );
}
