// Gráficas en SVG, sin librerías: los últimos días (clima y control) y los últimos meses (cultivo).
const C = { ext: "#8fa3bd", int: "#f59e0b", veg: "#3fb27f", hr: "#4f9be8", co2: "#3fb27f", fruto: "#e8604f", sol: "#c9c23a",
  hojas: "#3fb27f", tallo: "#a3864f", vent: "#4f9be8", calef: "#ef4444", iny: "#3fb27f" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// tope «redondo» del eje y por encima de v
const techo = (v) => { const m = marcas(0, v), paso = m[1] - m[0] || 1; return Math.ceil(v / paso) * paso; };
// marcas del eje y: un paso «redondo» que deje unas 4 líneas
function marcas(min, max) {
  const bruto = (max - min) / 4, pot = 10 ** Math.floor(Math.log10(bruto || 1));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * pot).find((k) => k >= bruto) || bruto;
  const v = []; for (let x = Math.ceil(min / paso) * paso; x <= max + 1e-9; x += paso) v.push(+x.toFixed(6));
  return v;
}

/**
 * series: [{ nombre, color, datos: [{t, v}], ancho? }]; x en tiempo entre [t0, t1].
 * guias: valores de referencia (consignas) en discontinua; ejeX: [[t, texto]].
 */
function Grafica({ titulo, series, min, max, unidad, t0, t1, guias = [], ejeX = [], W = 300 }) {
  const H = 104, izq = 26, abajo = 12, arriba = 3, der = 3;
  const X = (t) => izq + ((t - t0) / (t1 - t0 || 1)) * (W - izq - der), Y = (v) => arriba + (1 - (v - min) / (max - min || 1)) * (H - arriba - abajo);
  return (
    <div className="grafica">
      <div className="grafica-titulo">{titulo} <span className="leyenda-mini">{series.map((s) => <span key={s.nombre} style={{ color: s.color }}>{s.nombre} </span>)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`}>
        {marcas(min, max).map((v) => (
          <g key={v}>
            <line x1={izq} x2={W - der} y1={Y(v)} y2={Y(v)} stroke="#2d4466" strokeWidth="0.6" />
            <text x={izq - 3} y={Y(v)} fontSize="8" fill="#8fa3bd" textAnchor="end" dominantBaseline="central">{v}</text>
          </g>
        ))}
        {ejeX.map(([t, txt]) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={arriba} y2={H - abajo} stroke="#22395a" strokeWidth="0.6" />
            <text x={X(t) + 2} y={H - 2} fontSize="8" fill="#8fa3bd">{txt}</text>
          </g>
        ))}
        {guias.map((v) => <line key={`g${v}`} x1={izq} x2={W - der} y1={Y(v)} y2={Y(v)} stroke="#c9d6e6" strokeOpacity="0.55" strokeDasharray="3 3" strokeWidth="0.8" />)}
        {series.map((s) => (
          <polyline key={s.nombre} fill="none" stroke={s.color} strokeWidth={s.ancho || 1.5} strokeLinejoin="round"
            points={s.datos.map((d) => `${X(d.t).toFixed(1)},${Y(Math.min(Math.max(d.v, min), max)).toFixed(1)}`).join(" ")} />
        ))}
        <text x={W - der} y={8} fontSize="8" fill="#8fa3bd" textAnchor="end">{unidad}</text>
      </svg>
    </div>
  );
}

const fechaCorta = (t, anio) => { const d = new Date(Date.UTC(anio, 0, 1) + t * 1000); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };

export function Graficas({ historial, cultivo, inicio, ajustes, anio }) {
  if (!historial.length) return null;
  const serie = (k, lista = historial) => lista.map((h) => ({ t: h.t, v: h[k] }));
  const ahora = historial.at(-1).t, t0 = ahora - 4 * 86400;
  // eje x de los últimos días: una marca por medianoche
  const dias = []; for (let d = Math.ceil(t0 / 86400) * 86400; d <= ahora; d += 86400) dias.push([d, fechaCorta(d, anio)]);
  const temps = historial.flatMap((h) => [h.T_ext, h.T_int, h.T_veg]);
  const tmin = Math.floor(Math.min(0, ...temps) / 5) * 5, tmax = Math.ceil(Math.max(30, ...temps) / 5) * 5;
  const cmax = Math.ceil(Math.max(500, ...historial.map((h) => h.CO2)) / 100) * 100;

  // cultivo: ventana de 4 meses; mientras la simulación es más corta, se llena de izquierda a derecha
  const V = 122 * 86400, c1 = Math.max(ahora, inicio + V), c0 = c1 - V;
  const meses = []; for (let m = 0; m < 12; m++) { const t = Date.UTC(anio, m, 1) / 1000 - Date.UTC(anio, 0, 1) / 1000; if (t >= c0 && t <= c1) meses.push([t, MESES[m]]); }
  const cmaxCultivo = Math.max(50, ...cultivo.flatMap((h) => [h.fruto, h.hojas, h.tallo]));
  const fmax = Math.max(2000, techo(cmaxCultivo * 1.05));          // eje fijo de 0 a 2000 (solo crece si se supera)

  return (
    <div className="graficas">
      <Grafica titulo="Temperatura" unidad="°C" min={tmin} max={tmax} t0={t0} t1={ahora} ejeX={dias}
        guias={[ajustes.ventilacion, ...(ajustes.calefaccion ? [ajustes.consignaCalef] : [])]}
        series={[{ nombre: "fuera", color: C.ext, datos: serie("T_ext") }, { nombre: "aire", color: C.int, datos: serie("T_int") }, { nombre: "hojas", color: C.veg, datos: serie("T_veg"), ancho: 1 }]} />
      <Grafica titulo="Humedad relativa" unidad="%" min={0} max={100} t0={t0} t1={ahora} ejeX={dias}
        series={[{ nombre: "fuera", color: C.ext, datos: serie("HR_ext") }, { nombre: "dentro", color: C.hr, datos: serie("HR_int") }]} />
      <Grafica titulo="CO₂ y sol" unidad="ppm" min={0} max={cmax} t0={t0} t1={ahora} ejeX={dias} guias={[400]}
        series={[{ nombre: "CO₂ dentro", color: C.co2, datos: serie("CO2") }, { nombre: "sol (escalado)", color: C.sol, datos: historial.map((h) => ({ t: h.t, v: (h.sol / 800) * cmax })), ancho: 1 }]} />
      <Grafica titulo="Control (% del máximo)" unidad="%" min={0} max={100} t0={t0} t1={ahora} ejeX={dias}
        series={[
          { nombre: "ventanas (30 renov./h)", color: C.vent, datos: historial.map((h) => ({ t: h.t, v: (h.renov / 30) * 100 })) },
          { nombre: "calefacción (40 kW)", color: C.calef, datos: historial.map((h) => ({ t: h.t, v: (h.calef / 40) * 100 })) },
          { nombre: "CO₂ (10 kg/h)", color: C.iny, datos: historial.map((h) => ({ t: h.t, v: (h.co2iny / 10) * 100 })), ancho: 1 },
        ]} />
      <Grafica titulo="Reservas de agua" unidad="L/m² de suelo" min={0} max={Math.max(10, techo(Math.max(...historial.flatMap((h) => [h.aguaSustrato, h.aguaPlantas]))))} t0={t0} t1={ahora} ejeX={dias}
        series={[{ nombre: "sustrato", color: "#38d5db", datos: serie("aguaSustrato") }, { nombre: "plantas", color: C.veg, datos: serie("aguaPlantas") }]} />
      <Grafica titulo="Riego y transpiración" unidad="L/h" min={0} max={Math.max(10, techo(Math.max(...historial.flatMap((h) => [h.riego, h.transpiracion]))))} t0={t0} t1={ahora} ejeX={dias}
        series={[{ nombre: "riego", color: "#38d5db", datos: serie("riego") }, { nombre: "transpiración", color: C.veg, datos: serie("transpiracion") }]} />
      <Grafica W={window.innerWidth > 760 ? 620 : 300} titulo="Cultivo, últimos 4 meses" unidad="g/m² de carbohidrato" min={0} max={fmax} t0={c0} t1={c1} ejeX={meses}
        series={[{ nombre: "fruto", color: C.fruto, datos: serie("fruto", cultivo), ancho: 2 }, { nombre: "hojas", color: C.hojas, datos: serie("hojas", cultivo), ancho: 1 }, { nombre: "tallo", color: C.tallo, datos: serie("tallo", cultivo), ancho: 1 }]} />
    </div>
  );
}
