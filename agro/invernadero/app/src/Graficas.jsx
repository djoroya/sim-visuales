// Gráficas de los últimos días: líneas en SVG, sin librerías.
const C = { ext: "#8fa3bd", int: "#f59e0b", veg: "#3fb27f", hr: "#4f9be8", co2: "#3fb27f", fruto: "#e8604f", sol: "#c9c23a" };

function Grafica({ titulo, series, min, max, unidad, lineas = [] }) {
  const W = 300, H = 96, pad = 4;
  const n = Math.max(...series.map((s) => s.datos.length), 2);
  const X = (i) => pad + (i / (n - 1)) * (W - 2 * pad), Y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  return (
    <div className="grafica">
      <div className="grafica-titulo">{titulo} <span className="leyenda-mini">{series.map((s) => <span key={s.nombre} style={{ color: s.color }}>{s.nombre} </span>)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {lineas.map((v) => <line key={v} x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke="#2d4466" strokeDasharray="3 4" />)}
        {series.map((s) => (
          <polyline key={s.nombre} fill="none" stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke"
            points={s.datos.map((v, i) => `${X(i).toFixed(1)},${Y(Math.min(Math.max(v, min), max)).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
      <div className="grafica-ejes"><span>{min}{unidad}</span><span>{max}{unidad}</span></div>
    </div>
  );
}

export function Graficas({ historial, ajustes }) {
  const col = (k) => historial.map((h) => h[k]);
  const temps = [...col("T_ext"), ...col("T_int")];
  const tmin = Math.floor(Math.min(0, ...temps) / 5) * 5, tmax = Math.ceil(Math.max(30, ...temps) / 5) * 5;
  const cmax = Math.ceil(Math.max(500, ...col("CO2")) / 100) * 100;
  const fmax = Math.max(1, ...col("fruto"));
  return (
    <div className="graficas">
      <Grafica titulo="Temperatura (últimos días)" min={tmin} max={tmax} unidad=" °C" lineas={[ajustes.ventilacion, ...(ajustes.calefaccion ? [ajustes.consignaCalef] : [])]}
        series={[{ nombre: "fuera", color: C.ext, datos: col("T_ext") }, { nombre: "aire", color: C.int, datos: col("T_int") }, { nombre: "hojas", color: C.veg, datos: col("T_veg") }]} />
      <Grafica titulo="Humedad relativa" min={0} max={100} unidad=" %" series={[{ nombre: "fuera", color: C.ext, datos: col("HR_ext") }, { nombre: "dentro", color: C.hr, datos: col("HR_int") }]} />
      <Grafica titulo="CO₂ y sol" min={0} max={cmax} unidad=" ppm" lineas={[400]}
        series={[{ nombre: "CO₂ dentro", color: C.co2, datos: col("CO2") }, { nombre: "sol (escalado)", color: C.sol, datos: col("sol").map((v) => (v / 800) * cmax) }]} />
      <Grafica titulo="Carbono en el fruto" min={0} max={Math.ceil(fmax / 5) * 5} unidad=" g/m²" series={[{ nombre: "fruto", color: C.fruto, datos: col("fruto") }]} />
    </div>
  );
}
