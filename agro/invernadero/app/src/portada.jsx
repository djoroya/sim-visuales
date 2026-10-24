// Bucle del invernadero para el carrusel de djoroya.com: diez semanas de campaña en 6 s, vistas
// entre las filas a mediodía, para ver crecer las plantas y madurar los racimos. La graba
// sim-visuales/visor/portada/fotogramas.mjs con window.__portada.fotograma(t).
// ?pos=x,y,z&obj=x,y,z&fov=50: para probar encuadres sin recompilar.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Vista3D } from "./Vista3D.jsx";
import { fotosCampana } from "./simulacion.js";
import "./estilos.css";

const q = new URLSearchParams(location.search);
const v3 = (k, def) => (q.get(k) ? q.get(k).split(",").map(Number) : def);
const PORTADA = { pos: v3("pos", [-9, 1.4, -0.3]), obj: v3("obj", [-5.5, 0.35, 1.6]), fov: +(q.get("fov") || 40), desplaza: +(q.get("desplaza") || 0), nubes: 0.25 };
const DIAS = +(q.get("dias") || 72), INICIO = +(q.get("inicio") || 105);

function Portada() {
  const [datos, setDatos] = useState(null), [i, setI] = useState(0);
  const listo = useRef(null);
  useEffect(() => { fotosCampana({ inicio: INICIO, dias: DIAS }).then(setDatos); }, []);
  useEffect(() => {
    if (!datos) return;
    let actual = 0;
    window.__portada = {
      dias: datos.fotos.length,
      racimos: () => datos.fotos.map((f) => f.racimos.length),
      fotograma: (t, { periodo = 6 } = {}) => new Promise((res) => {
        const k = Math.min(datos.fotos.length - 1, Math.floor((t / periodo) * datos.fotos.length));
        if (k === actual) return res(k);
        actual = k; listo.current = () => res(k); setI(k);
      }),
    };
  }, [datos]);
  if (!datos) return null;
  return <div style={{ width: "100%", height: "100%" }}>
    <Vista3D vista={datos.fotos[i]} latitud={datos.latitud} portada={PORTADA} onDibujado={() => listo.current?.()} />
  </div>;
}

createRoot(document.getElementById("raiz")).render(<Portada />);
