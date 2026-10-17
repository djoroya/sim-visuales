/**
 * Estilos del visor, inyectados una sola vez desde JS para que el componente
 * sea autónomo: quien lo use no tiene que acordarse de importar un CSS.
 *
 * Todo cuelga de .nw y usa variables, así que se puede retocar desde fuera
 * sin tocar este fichero (por ejemplo --nw-acento).
 */

const CSS = `
.nw {
  --nw-acento: #14519b;
  --nw-texto: #27323d;
  --nw-suave: #5b6b7b;
  --nw-linea: #d8e0e9;
  --nw-fondo: transparent;
  display: grid;
  gap: 0.75rem 1.25rem;
  font: 400 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--nw-texto);
  grid-template-areas: "vista" "controles" "grafica";
}
.nw--ancho {
  grid-template-areas: "vista grafica" "controles grafica";
  grid-template-columns: 1.55fr 1fr;
  grid-template-rows: 1fr auto;
  align-items: start;
}

.nw-vista {
  grid-area: vista;
  position: relative;
  width: 100%;
  aspect-ratio: var(--nw-proporcion, 16 / 7);
  background: var(--nw-fondo);
}
.nw-vista > img { width: 100%; height: 100%; object-fit: contain; }

.nw-ejes { position: absolute; pointer-events: none; }

.nw-escala {
  position: absolute; right: 12px; bottom: 12px;
  display: flex; align-items: center; gap: 0.45rem;
  font-size: 11px; color: var(--nw-suave); pointer-events: none;
}
.nw-escala-barra {
  height: 6px; border: 1px solid var(--nw-suave); border-top: 0;
}

.nw-leyenda {
  position: absolute; left: 12px; top: 10px;
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 0.2rem;
  font-size: 11.5px; color: var(--nw-suave); pointer-events: none;
}
.nw-leyenda li { display: flex; align-items: center; gap: 0.4rem; }
.nw-punto {
  width: 9px; height: 9px; border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
}

.nw-controles {
  grid-area: controles;
  display: flex; align-items: center; gap: 0.75rem;
}
.nw-boton {
  flex: none; width: 34px; height: 34px;
  display: grid; place-items: center;
  border: 1px solid var(--nw-linea); border-radius: 50%;
  background: #fff; color: var(--nw-acento);
  cursor: pointer; transition: border-color .15s, color .15s;
}
.nw-boton:hover { border-color: var(--nw-acento); }
.nw-boton:focus-visible { outline: 2px solid var(--nw-acento); outline-offset: 2px; }

.nw-barra {
  flex: 1 1 auto; min-width: 0; height: 22px;
  appearance: none; background: transparent; cursor: pointer;
}
.nw-barra::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: linear-gradient(to right,
    var(--nw-acento) var(--avance, 0%), var(--nw-linea) var(--avance, 0%));
}
.nw-barra::-moz-range-track {
  height: 4px; border-radius: 2px;
  background: linear-gradient(to right,
    var(--nw-acento) var(--avance, 0%), var(--nw-linea) var(--avance, 0%));
}
.nw-barra::-webkit-slider-thumb {
  appearance: none; width: 14px; height: 14px; margin-top: -5px;
  border-radius: 50%; background: var(--nw-acento);
  border: 2px solid #fff; box-shadow: 0 0 0 1px var(--nw-linea);
}
.nw-barra::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--nw-acento); border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--nw-linea);
}
.nw-barra:focus-visible { outline: 2px solid var(--nw-acento); outline-offset: 4px; }

.nw-lectura {
  flex: none; display: flex; gap: 0.9rem;
  font-variant-numeric: tabular-nums; font-size: 13px; color: var(--nw-suave);
}
.nw-eps { color: var(--nw-acento); font-weight: 500; }

.nw-grafica { grid-area: grafica; width: 100%; min-height: 240px; }
.nw--ancho .nw-grafica { height: 100%; min-height: 280px; }

@media (prefers-reduced-motion: reduce) {
  .nw-boton, .nw-barra { transition: none; }
}
`

let puesto = false

export function ponEstilos() {
  if (puesto || typeof document === 'undefined') return
  puesto = true
  const hoja = document.createElement('style')
  hoja.dataset.nw = 'visor'
  hoja.textContent = CSS
  document.head.appendChild(hoja)
}
