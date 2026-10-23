import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./estilos.css";

createRoot(document.getElementById("raiz")).render(<App />);

// El artículo adapta el iframe al contenido, también al cambiar controles o ancho.
if (new URLSearchParams(location.search).has("incrustado")) {
  const observer = new ResizeObserver(() => {
    const app = document.querySelector('.app');
    if (app) parent.postMessage({ tipo: 'altura-invernadero', altura: Math.ceil(app.getBoundingClientRect().height) }, location.origin);
  });
  observer.observe(document.getElementById('raiz'));
}
