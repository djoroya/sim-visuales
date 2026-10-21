// Dónde estamos en el año: un disco de estaciones que gira con la fecha (el día actual siempre
// arriba, bajo la marca) y una barra con el periodo de datos de tiempo, que se puede pulsar para
// saltar a otro día.
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const INICIO_MES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];   // día del año (año no bisiesto)
// estaciones astronómicas del hemisferio norte: [nombre, día de inicio, color, icono]
const ESTACIONES = [["invierno", 355, "#5b8def", "❄️"], ["primavera", 79, "#4fb36b", "🌱"], ["verano", 172, "#e5b53a", "☀️"], ["otoño", 266, "#d9733f", "🍂"]];

export function estacion(dia) {
  let e = ESTACIONES[0];
  for (const x of ESTACIONES.slice(1)) if (dia >= x[1] && dia < 355) e = x;
  return e;
}

const ang = (dia) => (dia / 365) * 2 * Math.PI;                 // 0 = 1 de enero

function Disco({ dia, horaFrac }) {
  const R = 48, r = 27, c = 50;
  const giro = -((dia - 1 + horaFrac) / 365) * 360;             // el día actual queda arriba
  const punto = (d, rad) => [c + rad * Math.sin(ang(d)), c - rad * Math.cos(ang(d))];
  const sector = (d0, d1, color) => {
    const fin = d1 < d0 ? d1 + 365 : d1, grande = fin - d0 > 182.5 ? 1 : 0;
    const [x0, y0] = punto(d0, R), [x1, y1] = punto(fin, R), [x2, y2] = punto(fin, r), [x3, y3] = punto(d0, r);
    return <path key={d0} d={`M${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${grande} 0 ${x3},${y3} Z`} fill={color} opacity="0.85" />;
  };
  const est = estacion(dia);
  return (
    <svg className="disco" viewBox="0 0 100 100" aria-label={`Estación: ${est[0]}`}>
      <g style={{ transform: `rotate(${giro}deg)`, transformOrigin: "50px 50px", transition: "transform 0.25s linear" }}>
        {ESTACIONES.map((e, i) => sector(e[1], ESTACIONES[(i + 1) % 4][1], e[2]))}
        {INICIO_MES.map((d, i) => {
          const [x0, y0] = punto(d, r), [x1, y1] = punto(d, R), [tx, ty] = punto(d + 15, (R + r) / 2);
          return (
            <g key={i}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#0d1f36" strokeWidth="0.8" />
              <text x={tx} y={ty} fontSize="8" fontWeight="600" fill="#0d1f36" textAnchor="middle" dominantBaseline="central"
                transform={`rotate(${(d + 15) / 365 * 360} ${tx} ${ty})`}>{MESES[i]}</text>
            </g>
          );
        })}
      </g>
      <path d="M50,1 L46,-0 L50,8 L54,-0 Z" fill="#fff" />
      <text x="50" y="44" fontSize="17" textAnchor="middle" dominantBaseline="central">{est[3]}</text>
      <text x="50" y="62" fontSize="8.5" fill="#e8eef6" textAnchor="middle" fontWeight="600">{est[0]}</text>
    </svg>
  );
}

function Barra({ t, rango, anio, saltar }) {
  const d0 = rango.ini / 86400, d1 = rango.fin / 86400, dia = t / 86400;
  const x = (d) => ((d - d0) / (d1 - d0)) * 100;
  const meses = INICIO_MES.map((d, i) => [d, i]).filter(([d]) => d >= d0 && x(d) < 93);
  const pulsa = (e) => {
    const b = e.currentTarget.getBoundingClientRect(), f = (e.clientX - b.left) / b.width;
    saltar(Math.max(Math.ceil(d0 + f * (d1 - d0)), Math.ceil(d0) + 1));
  };
  return (
    <div className="barra-cal" onClick={pulsa} title="Pulsa para empezar ese día">
      {ESTACIONES.map((e, i) => {                               // franjas de estación
        const a = Math.max(e[1], d0), b = Math.min(i === 3 ? 355 : ESTACIONES[(i + 1) % 4][1], d1);
        const tramos = e[0] === "invierno" ? [[d0, Math.min(79, d1)], [Math.max(355, d0), d1]] : [[a, b]];
        return tramos.filter(([p, q]) => q > p).map(([p, q]) => [
          <div key={e[0] + p} className="franja" style={{ left: `${x(p)}%`, width: `${x(q) - x(p)}%`, background: e[2] }} />,
          x(q) - x(p) > 6 && <span key={"i" + e[0] + p} className="icono-estacion" style={{ left: `${(x(p) + x(q)) / 2}%` }} title={e[0]}>{e[3]}</span>,
        ]);
      })}
      {meses.map(([d, i]) => <span key={i} className="mes" style={{ left: `${x(d)}%` }}>{MESES[i]}</span>)}
      <div className="hecho" style={{ width: `${Math.min(Math.max(x(dia), 0), 100)}%` }} />
      <div className="cursor" style={{ left: `${Math.min(Math.max(x(dia), 0), 100)}%` }} />
      <span className="anio">{anio}</span>
    </div>
  );
}

export function Calendario({ t, rango, anio, saltar }) {
  if (!rango) return null;
  const dia = Math.ceil(t / 86400) || 1;
  return (
    <div className="calendario">
      <Disco dia={dia} horaFrac={(t % 86400) / 86400} />
      <Barra t={t} rango={rango} anio={anio} saltar={saltar} />
    </div>
  );
}
