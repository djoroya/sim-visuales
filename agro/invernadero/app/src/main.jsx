import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./estilos.css";

createRoot(document.getElementById("raiz")).render(<App />);

// El artículo adapta el iframe al contenido, también al cambiar controles o ancho.
if (new URLSearchParams(location.search).has("incrustado")) {
  let ultimaAltura = 0;
  const observer = new ResizeObserver(() => {
    const app = document.querySelector('.app');
    if (!app) return;
    const altura = Math.ceil(app.getBoundingClientRect().height);
    if (altura === ultimaAltura) return;
    ultimaAltura = altura;
    parent.postMessage({ tipo: 'altura-invernadero', altura }, location.origin);
  });
  observer.observe(document.getElementById('raiz'));
}
