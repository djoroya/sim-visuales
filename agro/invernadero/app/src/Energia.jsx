// Consumo desde el inicio de la simulación: el calor que pide el invernadero (del modelo) y la
// energía final que cuesta producirlo, térmica (gas) y eléctrica, según el equipo elegido.
import { EQUIPOS } from "./simulacion.js";

const A_SUELO = 250;
const kwh = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MWh` : `${v.toFixed(v < 0.1 ? 3 : v < 1 ? 2 : 1)} kWh`);

export function Energia({ energia, dias, equipo }) {
  if (!energia) return null;
  const { calor, gas, electrica, co2 } = energia, total = gas + electrica;
  const filas = [
    ["Calor útil (al aire)", calor, "#f59e0b"],
    ...(gas > 0 || equipo === "caldera" ? [["Térmica (gas)", gas, "#ef7d3c"]] : []),
    ["Eléctrica", electrica, "#4f9be8"],
  ];
  return (
    <div className="energia">
      <h4>Energía en {dias < 1 ? "menos de un día" : `${dias.toFixed(0)} días`} <span className="suave">· {EQUIPOS[equipo]}</span></h4>
      {total > 0 && (
        <div className="reparto" title="Energía final: térmica y eléctrica">
          <div style={{ width: `${(100 * gas) / total}%`, background: "#ef7d3c" }} />
          <div style={{ width: `${(100 * electrica) / total}%`, background: "#4f9be8" }} />
        </div>
      )}
      <table><tbody>
        {filas.map(([n, v, c]) => (
          <tr key={n}><td><i style={{ background: c }} />{n}</td><td className="num">{kwh(v)}</td><td className="num suave">{(v / A_SUELO).toFixed(1)} kWh/m²</td></tr>
        ))}
        <tr className="total"><td>Total final</td><td className="num">{kwh(total)}</td><td className="num suave">{(total / A_SUELO).toFixed(1)} kWh/m²</td></tr>
        {co2 > 0 && <tr><td><i style={{ background: "#3fb27f" }} />CO₂ inyectado</td><td className="num">{co2.toFixed(0)} kg</td><td className="num suave">{(co2 / A_SUELO).toFixed(2)} kg/m²</td></tr>}
      </tbody></table>
      {calor === 0 && <p className="suave">El calor útil puede ser cero. La electricidad incluye los motores y arranques configurados en el visor; no incluye riego, luces ni ventiladores.</p>}
    </div>
  );
}
