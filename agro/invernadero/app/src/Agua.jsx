import { I, AGUA } from './modelo/agua.js';
const litros = (v) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} L`;
export function Agua({ vista }) {
  const y = vista.y, f = vista.flujos;
  const filas = [
    ['Riego aportado', y[I.riego]], ['Transpiración', y[I.transpiracion]],
    ['Evaporación neta del sustrato', y[I.evaporacion]], ['Drenaje sin recuperar', y[I.drenaje]],
    ['Agua retirada con la poda', y[I.poda]],
  ];
  return <section className="agua" aria-label="Balance de agua">
    <div>
      <h3>Agua desde el inicio</h3>
      <p>Riego: <strong>{(f.agua_riego * 3600).toFixed(1)} L/h</strong> · absorción: {(f.agua_absorcion * 3600).toFixed(1)} L/h</p>
      <label>Agua disponible en el sustrato <strong>{litros(y[I.sustrato])}</strong>
        <meter min="0" max={AGUA.capacidad} value={y[I.sustrato]} />
      </label>
      <label>Agua contenida en las plantas <strong>{litros(y[I.plantas])}</strong>
        <meter min="0" max={Math.max(f.agua_objetivo, y[I.plantas])} value={y[I.plantas]} />
      </label>
      <p>Hidratación respecto al objetivo: {(100 * y[I.plantas] / f.agua_objetivo).toFixed(0)} % · {f.factor_hidrico < 0.99 ? 'estrés hídrico' : 'sin estrés hídrico'}</p>
      <p className="suave">Reservas iniciales incluidas. Modelo hídrico didáctico sin calibrar; el drenaje no se reutiliza. El gasto se expresa en volumen de agua.</p>
    </div>
    <div><table><caption>Acumulados · invernadero de 250 m²</caption><thead><tr><th>Flujo</th><th>Total</th><th>Por superficie</th></tr></thead><tbody>
      {filas.map(([n, v]) => <tr key={n}><td>{n}</td><td className="num">{litros(v)}</td><td className="num">{(v / AGUA.area).toFixed(2)} L/m²</td></tr>)}
    </tbody></table><p className="suave">Riego = variación de las reservas + transpiración + evaporación neta + drenaje + poda. Una evaporación neta negativa indica condensación sobre el sustrato.</p></div>
  </section>;
}
