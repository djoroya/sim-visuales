// Esquema vivo de una celda: canal de combustible, ánodo | electrolito | cátodo, canal de aire.
// Las barras de los canales son la composición en cada instante; los iones O²⁻ cruzan al ritmo de la
// corriente y las flechas de electricidad y calor tienen el grosor de su potencia.
const COLORES = { H2: "#4f9be8", CO: "#a78bfa", CH4: "#3fb27f", H2O: "#9fb3c8", CO2: "#e07a5f", N2: "#5b6f89", O2: "#f2c14e" };
const NOMBRE = { H2: "H₂", CO: "CO", CH4: "CH₄", H2O: "H₂O", CO2: "CO₂", N2: "N₂", O2: "O₂" };
const ANODO = ["H2", "CO", "CH4", "H2O", "CO2", "N2"], CATODO = ["O2", "N2"];
const IDX = { H2: 0, O2: 1, H2O: 2, N2: 3, CO: 4, CH4: 5, CO2: 6 };

function Barra({ x, y, w, h, fracciones, especies }) {
  let acum = 0;
  return (
    <g>
      {especies.map((e) => {
        const f = fracciones[IDX[e]] || 0, x0 = x + acum * w;
        acum += f;
        return f > 0.002 && (
          <g key={e}>
            <rect x={x0} y={y} width={f * w} height={h} fill={COLORES[e]} />
            {f * w > 34 && <text x={x0 + (f * w) / 2} y={y + h / 2 + 5} textAnchor="middle" className="esq-gas">{NOMBRE[e]}</text>}
          </g>
        );
      })}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#2d4466" />
    </g>
  );
}

export default function Esquema({ l, I, velocidad }) {
  const W = 640, Hh = 420, ox = 70, ow = 500;
  const fracCat = l.pc.map((p) => p / l.pc.reduce((a, b) => a + b, 0));
  const iones = Math.min(14, Math.round(I / 4));                     // cuántos O²⁻ se dibujan
  const durIon = I > 0 ? Math.max(0.5, 30 / I) / velocidad : 0;        // más corriente, más deprisa
  const anchoElec = 2 + Math.min(26, (l.electrica || 0) / 40), anchoCalor = 2 + Math.min(26, (l.calor || 0) / 40);
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="esquema" role="img" aria-label="Esquema de la celda: combustible arriba, aire abajo, iones de oxígeno cruzando el electrolito">
      <defs>
        <marker id="punta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker>
      </defs>
      {/* canal de combustible */}
      <text x={ox + 380} y={34} className="esq-titulo">Combustible → ánodo</text>
      <Barra x={ox} y={46} w={ow} h={34} fracciones={l.fracAnodo} especies={ANODO} />
      <line x1={20} y1={63} x2={ox - 6} y2={63} stroke="#c9d4e3" strokeWidth="2" markerEnd="url(#punta)" color="#c9d4e3" />
      <line x1={ox + ow + 6} y1={63} x2={W - 14} y2={63} stroke="#8fa3bd" strokeWidth="2" markerEnd="url(#punta)" color="#8fa3bd" />
      <text x={W - 14} y={98} textAnchor="end" className="esq-suave">escape</text>
      <g className="esq-leyenda">{ANODO.map((e, k) => <g key={e} transform={`translate(${ox + k * 62}, 18)`}><rect width="10" height="10" y="-9" fill={COLORES[e]} /><text x="14">{NOMBRE[e]}</text></g>)}</g>
      {/* capas */}
      <rect x={ox} y={98} width={ow} height={44} fill="#5b4a3a" />
      <text x={ox + 10} y={125} className="esq-capa">Ánodo (Ni–YSZ): H₂ + O²⁻ → H₂O + 2e⁻</text>
      <rect x={ox} y={142} width={ow} height={58} fill="#e8e1d1" />
      <text x={ox + 10} y={176} className="esq-capa oscuro">Electrolito (YSZ): solo pasan iones O²⁻</text>
      <rect x={ox} y={200} width={ow} height={44} fill="#3a4f6b" />
      <text x={ox + 10} y={227} className="esq-capa">Cátodo (LSM): ½O₂ + 2e⁻ → O²⁻</text>
      {Array.from({ length: iones }, (_, k) => (
        <circle key={k} cx={ox + 250 + ((k * 37) % 230)} r="5" fill="#f2c14e">
          <animate attributeName="cy" from="238" to="104" dur={`${durIon}s`} begin={`${(k * durIon) / iones}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {I > 0 && <text x={ox + ow - 8} y={160} textAnchor="end" className="esq-ion">O²⁻ ↑</text>}
      {/* canal de aire */}
      <Barra x={ox} y={262} w={ow} h={34} fracciones={fracCat} especies={CATODO} />
      <text x={ox + ow} y={318} textAnchor="end" className="esq-titulo">Aire → cátodo</text>
      {/* circuito exterior: electricidad y calor */}
      <path d={`M ${ox + ow} 120 H ${W - 30} V 360 H ${ox + ow - 120}`} fill="none" stroke="#f59e0b" strokeWidth={anchoElec} strokeLinecap="round" opacity={l.electrica > 0 ? 0.9 : 0.25} />
      <text x={W - 30} y={396} textAnchor="end" className="esq-elec">electricidad {l.electrica > 0 ? `${l.electrica.toFixed(0)} W` : "—"}</text>
      <path d={`M ${ox + 120} 250 Q ${ox + 60} 330 ${ox - 30} 360`} fill="none" stroke="#e07a5f" strokeWidth={anchoCalor} strokeLinecap="round" opacity={l.calor > 0 ? 0.85 : 0.2} markerEnd="url(#punta)" color="#e07a5f" />
      <text x={16} y={396} className="esq-calor">calor {Number.isFinite(l.calor) && l.calor > 0 ? `${l.calor.toFixed(0)} W` : "—"}</text>
      <text x={W / 2} y={414} textAnchor="middle" className="esq-suave">una de las {30} celdas · 100 cm² · 750 °C</text>
    </svg>
  );
}
