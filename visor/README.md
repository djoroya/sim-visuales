# Visor del nanohilo

Visor WebGL de la trayectoria de dinámica molecular de
[`md/nanohilo-cu`](../md/nanohilo-cu): dibuja los átomos con three.js,
interpola entre los fotogramas del binario `.nw` y lo acompaña de ejes,
leyenda, barra de tiempo y la curva tensión-deformación sincronizada.

Nada de código de terceros salvo three.js y Plotly, ambos empaquetados y
autoalojados (sin CDN).

## Los módulos

| Fichero | Qué es |
|---|---|
| `src/carga.js` | lo único que incluye la página: menos de 1 KB, carga el resto solo cuando hace falta |
| `src/nanohilo.js` | ensambla todo y expone `montaVisor()` |
| `src/formato.js` | lee el binario `.nw`; **no depende de three**, para poder probarlo en Node |
| `src/escena.js` | la escena three.js y el reloj de la animación |
| `src/adornos.js` | triedro de ejes, barra de escala en nm y leyenda, en SVG |
| `src/controles.js` | barra de tiempo con reproducir/pausar y lectura de ps y ε |
| `src/grafica.js` | curva tensión-deformación con Plotly |
| `src/estilos.js` | el CSS, inyectado desde JS para que el componente sea autónomo |

La escena no sabe nada de interfaz: lleva el reloj y avisa a quien se
suscriba del instante actual. La barra de tiempo y la gráfica son dos
suscriptores más, y por eso van en sincronía sin conocerse entre sí.

## Cómo se comporta

- **Instanciado**: un solo `InstancedMesh` con un icosaedro de 20 caras por
  átomo. Cada fotograma se escriben a mano las matrices de instancia (solo
  traslación y escala) y el color, sin crear objetos.
- **Color por estructura** (CNA): fcc en gris claro, fallas de apilamiento y
  maclas en el azul de la marca `#14519b`, superficie libre y desorden en gris
  azulado. La leyenda lo explica con esos nombres.
- **Ejes y escala**: el triedro usa la misma proyección que la escena y gira
  con ella (los ejes que apuntan hacia atrás se atenúan); la barra de escala
  elige una longitud redonda —0,5, 1, 2, 5… nm— que ocupe ~18 % del ancho.
- **Barra de tiempo**: reproducir/pausar, arrastrar a cualquier instante y
  lectura del tiempo simulado (ps) y la deformación (%). Al soltar, sigue
  donde estaba si estaba reproduciendo.
- **Gráfica**: curva completa en gris, tramo recorrido en azul y un punto en
  el instante actual, con la deformación interpolada entre fotogramas para
  que el punto no vaya a saltos. Se redibuja como mucho 20 veces por segundo.
- **Fondo transparente**: el lienzo no pinta fondo, toma el color de la página.
- **Bucle sin corte**: los átomos encogen al final del ciclo y crecen al
  principio. Nada de transparencias, que en instanciado dan problemas de orden.
- **Ligero**: `devicePixelRatio` limitado, pausa al salir de pantalla
  (`IntersectionObserver`), y con `prefers-reduced-motion` no arranca sola:
  muestra un fotograma fijo y deja los controles por si se quiere mirar.
- **Sin WebGL**: `montaVisor` lo detecta y pone el póster.
- **Dos columnas** cuando el contenedor pasa de 860 px; por debajo, la gráfica
  cae bajo el visor.

## Peso

Medido con `npm run build` (gzip):

| | Crudo | gzip |
|---|---:|---:|
| `carga.js` (va en el HTML) | 0,6 K | **0,4 K** |
| `nanohilo.js` (three + visor + interfaz) | 779,6 K | **166,5 K** |
| `grafica.js` | 2,2 K | 1,2 K |
| `plotly-basic.min.js` | 1755,8 K | **436,3 K** |

**Plotly cuesta 436 KiB, dos veces y media lo que three.** Va en su propio
trozo y se pide el último, cuando la animación ya está en marcha, así que no
retrasa nada; pero si el objetivo es que la portada sea lo más ligera
posible, dibujar esta curva a mano en SVG serían unos 2 KiB. Se puede
desactivar con `{ grafica: false }`.

El bundle parcial (`plotly.js/lib/core` + `scatter`) se midió y **no mejora**:
438 KiB gzip frente a 436. No merece la pena complicar el build.

## Uso

```js
import { cargaVisor } from './src/carga.js'

cargaVisor(document.querySelector('#hilo'), {
  datos: '/nanohilo-cu.nw',
  meta: '/nanohilo-cu-meta.json',   // tiempo, ε y curva: sin esto no hay gráfica
  poster: '/nanohilo-cu-poster.png',
})
```

El contenedor solo necesita un ancho; la proporción del lienzo se ajusta con
`--nw-proporcion` (por defecto `16 / 7`) y el acento con `--nw-acento`.

Opciones: `duracion` (segundos por pasada), `pausaFinal`, `entrada`, `salida`,
`radio` del átomo en Å, `giro` en vueltas por segundo, `margen` del encuadre,
`dprMax`, `anchoDosColumnas`, y los interruptores `adornos`, `controles` y
`grafica`.

## Desarrollo

```bash
npm install
npm run dev       # demo en http://localhost:5173
npm run build     # dist/, con un trozo por dependencia diferida
npm test          # formato del binario, respaldo sin WebGL e interfaz
```

Los tests corren en Node, sin navegador: comprueban que el parser reconstruye
los mismos números que escribió Python, que sin WebGL queda el póster, y que
ejes, escala, leyenda y barra de tiempo se montan, reaccionan y se desmontan.
Lo que no se puede comprobar así es el dibujo WebGL en sí.
