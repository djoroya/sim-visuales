# Visor del nanohilo

Visor WebGL de la trayectoria de dinámica molecular de
[`md/nanohilo-cu`](../md/nanohilo-cu): dibuja los átomos con three.js y va
interpolando entre los fotogramas del binario `.nw`.

No usa más código de terceros que three.js, que va empaquetado y autoalojado
(sin CDN). Son dos ficheros:

| Fichero | Qué es |
|---|---|
| `src/carga.js` | lo único que incluye la página: menos de 1 KB, carga el resto solo cuando hace falta |
| `src/nanohilo.js` | el visor: lee el `.nw`, monta la escena y anima |

## Cómo se comporta

- **Instanciado**: un solo `InstancedMesh` con un icosaedro de 20 caras por
  átomo. Cada fotograma se escriben a mano las matrices de instancia (solo
  traslación y escala) y el color, sin crear objetos.
- **Color por estructura** (análisis de vecinos comunes, CNA): fcc en gris
  muy claro, fallas de apilamiento en el azul de la marca `#14519b`,
  superficie libre y desorden en gris azulado tenue.
- **Fondo transparente**: el lienzo no pinta fondo, así que toma el color de
  la página.
- **Bucle sin corte**: los átomos encogen al final del ciclo y crecen al
  principio, de modo que el salto del estado roto al inicial no se ve. No se
  recurre a transparencias, que en instanciado dan problemas de orden.
- **Cámara ortográfica**, encuadre fijado a la longitud final del hilo: así
  se aprecia cuánto se estira. El hilo gira despacio sobre su eje y se puede
  arrastrar para girarlo a mano.
- **Ligero**: `devicePixelRatio` limitado, se pausa cuando sale de la
  pantalla (`IntersectionObserver`), y con `prefers-reduced-motion` ni
  siquiera se descarga: se queda el póster del HTML.
- **Sin WebGL**: `montaVisor` detecta que no hay contexto y pone el póster.

## Uso

```js
import { cargaVisor } from './src/carga.js'

cargaVisor(document.querySelector('#hilo'), {
  datos: '/nanohilo-cu.nw',
  poster: '/nanohilo-cu-poster.png',
})
```

El contenedor tiene que tener tamaño propio (por ejemplo `aspect-ratio: 16/7`).

Opciones: `duracion` (segundos por pasada), `pausaFinal`, `entrada`, `salida`,
`radio` (del átomo, en Å), `giro` (vueltas por segundo), `margen` del
encuadre y `dprMax`.

## Desarrollo

```bash
npm install
npm run dev       # demo en http://localhost:5173
npm run build     # dist/nanohilo.js
node test/formato.mjs ../md/nanohilo-cu/salida/nanohilo-cu.nw \
                      ../md/nanohilo-cu/datos/control.json
```

El test comprueba, sin navegador, que el parser del visor reconstruye los
mismos números que escribió el exportador de Python.
