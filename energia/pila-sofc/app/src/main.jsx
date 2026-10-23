import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./estilos.css";

createRoot(document.getElementById("raiz")).render(<App />);

// Incrustado en el artículo: comunica la altura para que el iframe se ajuste al contenido.
if (document.documentElement.classList.contains("incrustado") && parent !== window) {
  const observer = new ResizeObserver(() => {
    const altura = Math.ceil(document.getElementById("raiz").getBoundingClientRect().height);
    parent.postMessage({ tipo: "altura-sofc", altura }, location.origin);
  });
  observer.observe(document.getElementById("raiz"));
}
