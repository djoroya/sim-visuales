# Cómo llevarlo a la portada (Astro)

Nada de esto toca `personalpage`: es lo que habría que añadir allí cuando se
decida. La idea es que la portada pese lo mismo que ahora si el visitante no
llega a ver el hilo.

## 1. Los ficheros

Copiar a `personalpage`:

| De aquí | A la web |
|---|---|
| `md/nanohilo-cu/salida/nanohilo-cu.nw` | `public/md/nanohilo-cu.nw` |
| `md/nanohilo-cu/salida/nanohilo-cu-poster.png` | `public/md/nanohilo-cu-poster.png` |
| `visor/src/nanohilo.js` y `visor/src/carga.js` | `src/visores/` |

Y `npm i three` en la web. (O publicar este visor como paquete y depender de
él; para un solo consumidor, copiar los dos ficheros es más simple.)

## 2. La isla

```astro
---
// src/components/NanohiloCu.astro
const { alto = '16 / 7' } = Astro.props
---

<figure class="hilo">
  <div id="nanohilo" style={`aspect-ratio: ${alto}`}>
    <img
      src="/md/nanohilo-cu-poster.png"
      alt="Nanohilo de cobre estirado hasta romperse, simulado con dinámica molecular"
      width="1280" height="720" decoding="async"
    />
  </div>
  <figcaption>
    Ensayo de tracción de un nanohilo de cobre (5780 átomos, 300 K) con
    dinámica molecular. En azul, las fallas de apilamiento.
  </figcaption>
</figure>

<script>
  import { cargaVisor } from '../visores/carga.js'

  const caja = document.getElementById('nanohilo')
  cargaVisor(caja, {
    datos: '/md/nanohilo-cu.nw',
    poster: '/md/nanohilo-cu-poster.png',
    alMontar: () => caja.querySelector('img')?.remove(),
  })
</script>

<style>
  .hilo { margin: 0; }
  #nanohilo { width: 100%; position: relative; }
  #nanohilo img { width: 100%; height: 100%; object-fit: contain; }
  figcaption { color: #5b6b7b; font-size: 0.9rem; margin-top: 0.6rem; }
</style>
```

El `<script>` de Astro se compila e incluye en el bundle de la página, así
que `three` queda empaquetado y autoalojado; no hay CDN en ninguna parte.

## 3. Lo que descarga cada visitante

`carga.js` (menos de 1 KB, va en el HTML) no pide nada hasta que el hilo está
a 300 px de entrar en pantalla, y no pide nada en absoluto si el visitante
tiene `prefers-reduced-motion` o no hay WebGL: en esos casos se queda el
`<img>` del póster, que ya forma parte del HTML.

| | Transferido |
|---|---:|
| Póster PNG (siempre) | 53 KiB |
| `three` + visor, al entrar en pantalla (gzip) | 167 KiB |
| Trayectoria `.nw` (gzip) | 793 KiB |
| **Total si se ve la animación** | **≈ 1,0 MiB** |
| **Total si no se ve (móvil con poco movimiento, sin WebGL, no baja hasta ahí)** | **53 KiB** |

Con brotli en lugar de gzip, el `.nw` baja a unos 650 KiB. Merece la pena
comprobar que el servidor comprime `.nw`: no es una extensión conocida y
algunos nginx solo comprimen una lista cerrada de tipos. En el Coolify de la
web, añadir `application/octet-stream` a `gzip_types`/brotli, o servir el
fichero como `.bin`.

Conviene además cachearlo fuerte (`Cache-Control: public, max-age=31536000,
immutable`) y, si se regenera, cambiarle el nombre.

## 4. Si se quiere aún más ligero

- **Menos fotogramas**: con `NFRAMES=48` el `.nw` baja a unos 500 KiB y la
  animación sigue siendo fluida (el visor interpola).
- **Menos átomos**: una sección de 6 × 6 celdas da unos 3000 átomos y menos
  de la mitad de datos, a costa de que el hilo se vea más fino.
- El peso de `three` (167 KiB) es el suelo de esta vía. Bajar de ahí
  significaría escribir el WebGL a mano, que para una sola escena de esferas
  instanciadas es viable pero deja de ser código mantenible por otros.
