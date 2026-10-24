import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { COLORES, NOMBRE, PASOS, creaEscena } from "./escena.js";
import "./estilos.css";

const TEXTOS = [
  ["Una instalación",
    "Una pila SOFC no va sola. El biogás pasa antes por un reformador, que con vapor y calor lo convierte en un gas rico en hidrógeno. Ese gas entra en una caja caliente, aislada y a unos 750 °C, donde hay varios stacks. Vamos a mirar uno."],
  ["Un stack",
    "Treinta celdas apiladas entre dos placas terminales: unos 10 × 10 cm de planta y 10 de alto. El combustible entra por una cara y sale por la opuesta; el aire cruza en perpendicular (flujo cruzado). Las cajas transparentes son los colectores que reparten el gas entre las 30 celdas."],
  ["Despiece de una celda",
    "La pieza que se repite. Entre dos interconectores de acero hay tres capas cerámicas: el ánodo, que da la resistencia mecánica, el electrolito, más fino que un pelo, y el cátodo. Los nervios del interconector forman los canales: por arriba, combustible; por abajo, aire."],
  ["El combustible",
    "El gas reformado avanza por los canales que tocan el ánodo. Por el camino, el H₂ se convierte en H₂O y el CO y el CH₄ en CO₂ (simplificado: el CH₄ se reforma antes dentro de la celda). A 30 A se usa el 52 %: el resto sale y se quema después para dar calor."],
  ["Aire, iones y electrones",
    "El aire cruza en perpendicular. En el cátodo, el O₂ coge electrones y se convierte en ion O²⁻ (naranja), que atraviesa el electrolito y oxida el combustible en el ánodo. Los electrones (cian) no pueden cruzar el electrolito: bajan por el interconector hasta el cátodo de la celda de abajo."],
  ["Todas en serie",
    "Cada interconector une el ánodo de una celda con el cátodo de la siguiente: las 30 celdas están en serie. La misma corriente las cruza todas y sus tensiones se suman: 30 × 0,85 V ≈ 25 V a 30 A. Es lo que calcula el visor de la pila."],
];

function App() {
  const lienzo = useRef(null), escena = useRef(null);
  const q = new URLSearchParams(location.search);
  const [paso, setPaso] = useState(Math.min(PASOS.length - 1, Math.max(0, (+q.get("paso") || 1) - 1)));
  const [giro, setGiro] = useState(false);
  const tour = q.has("tour");

  const incrustado = document.documentElement.classList.contains("incrustado");
  useEffect(() => { escena.current = creaEscena(lienzo.current, { incrustado }); return () => escena.current.destruye(); }, []);
  useEffect(() => { escena.current?.ponPaso(paso); }, [paso]);
  useEffect(() => { escena.current?.ponGiro(giro); }, [giro]);
  useEffect(() => {
    if (!tour) return undefined;
    const id = setInterval(() => setPaso((p) => (p + 1) % PASOS.length), 9000);
    return () => clearInterval(id);
  }, [tour]);
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === "ArrowRight") setPaso((p) => Math.min(PASOS.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPaso((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const [titulo, texto] = TEXTOS[paso];
  const especies = paso === 3 ? ["H2", "CO", "CH4", "H2O", "CO2"] : paso === 4 ? ["O2", "N2"] : null;
  return (
    <div className="geo">
      <div className="lienzo" ref={lienzo} />
      <div className={`panel-paso ${tour ? "tour" : ""}`}>
        <div className="paso-cab"><span className="num">{paso + 1}/{PASOS.length}</span><h2>{titulo}</h2></div>
        <p>{texto}</p>
        {especies && <div className="leyenda-geo">{especies.map((e) => <span key={e}><i style={{ background: COLORES[e] }} />{NOMBRE[e]}</span>)}
          {paso === 4 && <><span><i style={{ background: "#ff7b25" }} />O²⁻</span><span><i style={{ background: "#7df9ff" }} />e⁻</span></>}</div>}
        {!tour && <div className="paso-nav">
          <button onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>←</button>
          {PASOS.map((_, k) => <button key={k} className={`punto ${k === paso ? "activo" : ""}`} onClick={() => setPaso(k)} aria-label={`Paso ${k + 1}`} />)}
          <button onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))} disabled={paso === PASOS.length - 1}>→</button>
          <label className="giro"><input type="checkbox" checked={giro} onChange={(e) => setGiro(e.target.checked)} /> girar</label>
        </div>}
      </div>
      {!tour && <p className="ayuda">{incrustado ? "Arrastra para girar · en el móvil, con dos dedos" : "Arrastra para girar · rueda o pellizco para acercar"}</p>}
    </div>
  );
}

createRoot(document.getElementById("raiz")).render(<App />);
