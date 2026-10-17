---
name: trayectoria-web
description: Llevar una trayectoria atómica (o cualquier animación de muchas partículas) a la web como binario compacto de menos de 1 MB más un visor three.js ligero que la dibuja en vivo. Úsala cuando haya que enseñar una simulación en una página en lugar de exportarla a vídeo.
---

# Trayectoria de simulación → web

En `scripts/` está todo lo reutilizable, listo para copiar: `exporta_nw.py`
empaqueta los fotogramas; `formato.js` lee el binario (**sin depender de
three**, para poder probarlo en Node); `escena.js` dibuja y lleva el reloj;
`adornos.js`, `controles.js` y `grafica.js` son la interfaz; `visor.js` lo
ensambla y `carga.js` lo difiere. Cifras reales de una trayectoria de **5780
átomos y 80 fotogramas**.

## El formato: incrementos, no posiciones

Lo que decide el tamaño no es la cuantización, es **guardar incrementos entre
fotogramas en lugar de posiciones absolutas**. Entre dos fotogramas un átomo
se mueve décimas de angstrom: son números pequeños y muy repetidos, que es de
lo que vive gzip. Medido sobre los mismos datos:

| Codificación | gzip |
|---|---:|
| posiciones absolutas uint16, planos de byte alto/bajo | 2357 KiB |
| **primer fotograma uint16 + incrementos int8** | **793 KiB** |

Estructura (`NWIRE2` en el script): cabecera con nº de átomos, nº de
fotogramas, origen, paso de cuantización y la magnitud por fotograma; el
primer fotograma en uint16 **con el byte alto y el bajo en planos separados**
(los altos son casi constantes y se comprimen solos); el resto en int8; y al
final un byte por átomo y fotograma con el tipo de estructura (CNA: 1 fcc,
2 hcp, 3 bcc, 4 ico, 5 desconocido), que comprime muy bien porque casi todo
es 1 y 5.

**Calcula el incremento contra la posición que reconstruirá el visor**, no
contra la exacta, y el error deja de acumularse.

### El paso de cuantización

Tiene que ser lo bastante grande para que ningún incremento sature el int8
(±127) y lo bastante pequeño para que no se vea. Medido:

| paso | fotogramas | gzip | error máx | saturados |
|---|---|---:|---:|---:|
| 0,035 Å | 80 | 992 KiB | 1986 mÅ | 7 |
| 0,05 Å | 80 | 891 KiB | 56 mÅ | 1 |
| **0,07 Å** | **80** | **793 KiB** | **35 mÅ** | **0** |
| 0,07 Å | 64 | 651 KiB | 35 mÅ | 0 |

0,07 Å es 1/36 del radio atómico: invisible. **Un solo incremento saturado
dispara el error máximo a varios angstroms**, así que imprime siempre el
recuento de saturados y el error de reconstrucción, y sube el paso hasta que
los saturados sean 0.

### Un JSON pequeño al lado del binario

Todo lo que necesita la **interfaz** —tiempo simulado y magnitud de cada
fotograma, y la curva que se dibuje al lado— va en un JSON aparte, no dentro
del binario: son cuatro cifras por fotograma (2 KiB con gzip para 80) y así
el formato binario no cambia de versión cada vez que la interfaz pide un dato
más. Remuestrea la curva a ~300 puntos y recórtala al tramo que se anima,
para que el punto que la recorre llegue justo al final.

### Dos trampas de la caja periódica

- **Deswrapea las trayectorias** antes de calcular incrementos: un átomo que
  sale por un extremo y entra por el otro tiene un incremento de media caja
  que satura y deja un rastro arrastrándose por la pantalla. Se sigue en
  coordenadas fraccionarias acumulando `-round(s - s_anterior)`.
- **Centra lo interesante** (el cuello, la rotura) con un desplazamiento
  cíclico fraccionario **constante para todos los fotogramas**: así no
  introduces saltos nuevos. Localízalo en el último fotograma con el mínimo
  del histograma de posiciones a lo largo del eje.

## El visor

`scripts/visor.js` (`montaVisor(contenedor, opciones)`), probado con
three r0.180:

- Un `InstancedMesh` con `IcosahedronGeometry(radio, 0)` (20 caras) y
  `MeshLambertMaterial({flatShading: true})`. Las matrices de instancia se
  escriben **a mano sobre `malla.instanceMatrix.array`** (solo traslación y
  escala: posiciones 12, 13, 14 y diagonal 0, 5, 10), sin crear objetos por
  fotograma. El color por instancia va en un `InstancedBufferAttribute`
  asignado a `malla.instanceColor`, interpolando también entre fotogramas.
- **Cámara ortográfica** con el encuadre fijado a la extensión final: así se
  ve cuánto crece. Reserva la **diagonal** de la sección (`Math.hypot`) si el
  objeto gira sobre su eje, o lo recortarás al girar.
- **Bucle sin corte**: los átomos encogen al final del ciclo y crecen al
  principio (factor de escala en la matriz). Evita las transparencias, que en
  instanciado dan problemas de orden de dibujo.
- **Fondo transparente** (`alpha: true` + `setClearAlpha(0)`) para que tome el
  color de la página.
- **Salto periódico**: al interpolar, si `|x_b − x_a| > caja/2`, no
  interpoles; salta al valor nuevo.

### Interfaz: que la escena no sepa nada de ella

La escena lleva el reloj y **avisa a quien se suscriba** del instante actual
(`suscribe(fn)` → `{avance, indice}`). La barra de tiempo y la gráfica son dos
suscriptores más: van en sincronía sin conocerse, y añadir otro no toca el
render. Detalles que importan:

- **Triedro y barra de escala en SVG**, no en una segunda escena de three:
  son cuatro líneas, salen nítidas a cualquier densidad y no cuestan nada.
  El triedro usa la misma proyección que la escena (giro + inclinación) y
  atenúa los ejes que apuntan hacia atrás; la barra elige una longitud
  redonda (0,5, 1, 2, 5…) que ocupe ~18 % del ancho, a partir de las unidades
  por píxel que publica la escena.
- **Interpola la magnitud entre fotogramas** para el punto que recorre la
  curva. Con el índice redondeado avanzaría a saltos tan frecuentes como
  fotogramas por segundo (9 en una pasada de 9 s con 80 fotogramas), y se nota.
- **Limita el redibujado de la gráfica a ~20 por segundo.** A 60 fps no se
  gana nada y `Plotly.restyle` con cientos de puntos sí cuesta.
- Inyecta el CSS desde JS una sola vez: el componente queda autónomo y quien
  lo use no tiene que acordarse de importar una hoja aparte.

### Plotly: mídelo antes de decidir

Para una curva de 363 puntos, **`plotly.js-basic-dist-min` cuesta 436 KiB
gzip**: dos veces y media lo que three.js entero (167 KiB). El build parcial
(`plotly.js/lib/core` + `scatter`) se midió y **no mejora**: 438 KiB. Si el
encargo dice «ligero», di el número y ofrece la alternativa (la misma curva a
mano en SVG son ~2 KiB) antes de darlo por bueno; y en cualquier caso déjalo
detrás de un interruptor y de un `import()` propio.

### Carga diferida y accesibilidad

`scripts/carga.js` es lo único que incluye la página (< 1 KB): un
`IntersectionObserver` con `rootMargin: '300px'` que hace `import()` dinámico
de three y el visor solo cuando el bloque va a entrar en pantalla, y **no
carga nada** si hay `prefers-reduced-motion` o no hay WebGL. En esos casos se
queda el `<img>` del póster que ya venía en el HTML. El visor además se pausa
al salir de pantalla y limita `devicePixelRatio` a ~1,75.

### Peso del paquete

787 KB sin comprimir, **167 KiB gzip**, y eso es casi todo three.js: es el
suelo de esta vía. **Minificar con terser lo empeora** (1021 KB / 187 KiB):
deja el esbuild que trae Vite por defecto. Mídelo con `npx vite build`
(imprime el tamaño gzip) y repórtalo junto al de los datos.

**En modo `lib`, `rollupOptions.output.inlineDynamicImports` lo arruina
todo**: mete las dependencias diferidas dentro del trozo principal, así que
un `import()` deja de diferir nada y la página carga three y Plotly de golpe.
Se ve en el build: un solo fichero de 2,6 MB en vez de cuatro. Declara varias
entradas (`lib.entry: {carga: ..., visor: ...}`) y deja que Rollup parta.

## Verificar sin navegador

En un sandbox sin navegador (la descarga de Chrome para puppeteer está
bloqueada por el proxy) todavía se puede comprobar casi todo:

1. **El parser contra el exportador.** Mantén el parser en un módulo propio
   sin dependencias; si vive dentro del visor, el test arrastra three y solo
   se puede ejecutar donde esté instalado. El exportador escribe un
   `control.json` con muestras ya reconstruidas; `scripts/test-formato.mjs`
   las compara con lo que lee el parser real del visor en Node. Detecta
   fotogramas desordenados, desbordes y errores de endianness.
2. **El respaldo sin WebGL y la interfaz entera, con jsdom.** Su canvas no da
   contexto WebGL, que es justo el caso del respaldo; y para lo demás basta
   una escena de mentira con la misma interfaz (`suscribe`, `irA`, `alterna`,
   `escalaVista`, `angulo`) para comprobar que el triedro se mueve al girar,
   que la barra de escala elige la longitud redonda correcta, que la lectura
   de tiempo sigue al fotograma, que arrastrar mueve la animación y que al
   destruir no quedan oyentes colgando. Caza casi todos los errores de
   ejecución sin navegador.
3. **La animación**, con `scripts/vista_previa.py`: lee el binario con la
   **misma reconstrucción** que el visor y pinta una hoja de contacto con la
   misma cámara. Es lo que de verdad te dice si la secuencia es correcta.
4. **Que el servidor lo sirve**: arranca Vite y pide los ficheros **en el
   mismo comando de shell** (ver abajo).

Lo que no puedes verificar así es el render WebGL en sí: dilo explícitamente
en vez de darlo por bueno.

## Trucos del sandbox que cuestan tiempo

- **La red está aislada por comando.** Un servidor lanzado en un comando no es
  alcanzable desde el siguiente: `fetch` falla y `curl` da 502 aunque uses
  `--noproxy ''`. Arranca y consulta en el mismo comando:
  ```bash
  npx vite --port 5181 --strictPort > tmp/vite.log 2>&1 &
  VPID=$!
  until grep -q "ready in" tmp/vite.log; do sleep 1; done
  node -e "fetch('http://127.0.0.1:5181/datos.nw').then(async r =>
    console.log(r.status, (await r.arrayBuffer()).byteLength))"
  kill $VPID
  ```
  (`curl --noproxy ''` sí vale para la API local del orquestador en :8765.)
- **No encadenes `sleep`**: está bloqueado. Usa `until <condición>; do sleep N; done`.
- **`rm` con variables en la ruta pide permiso.** Usa carpetas temporales de
  ruta fija dentro del repo (`tmp/`, en `.gitignore`) y limpia desde Python.
- **numpy 2.x**: `ndarray.ptp()` ya no existe, usa `np.ptp(a)`.
- **matplotlib**: exporta `MPLCONFIGDIR` a una carpeta escribible o avisa en
  cada ejecución.
- **Póster PNG**: redúcelo a paleta con Pillow —`img.quantize(colors=96,
  method=Image.FASTOCTREE)`, que es el único método válido en RGBA junto a
  libimagequant— y pasa de 267 a 53 KiB sin pérdida visible. Importa porque el
  póster es lo único que se descarga siempre.
- Vite sirve bien los **symlinks** en `public/`, así que puedes enlazar los
  datos desde donde los genera la simulación en vez de duplicarlos.
- **Cuidado con el orden de declaración en los módulos**: si una función que
  se llama durante el montaje (un `ResizeObserver` que dispara al observar,
  por ejemplo) usa un `const` declarado más abajo, salta un
  `ReferenceError: Cannot access before initialization` solo en el navegador.
  jsdom con una escena de mentira no lo caza: revísalo leyendo.

## Cómo usar los scripts

Se copian a `src/` del proyecto web (y `exporta_nw.py` / `vista_previa.py`
junto a la simulación). Dependencias: `three` siempre, `plotly.js-basic-dist-min`
solo si quieres la gráfica, y `jsdom` como dependencia de desarrollo para
`test-interfaz.mjs` y `test-formato.mjs`. Un `npm test` que encadene los tres
tests deja la verificación en un comando.

## Terminado cuando

- [ ] 0 incrementos saturados y error de reconstrucción muy por debajo del
      tamaño de la partícula.
- [ ] El test del parser en Node pasa contra el `control.json` de Python.
- [ ] El respaldo sin WebGL deja el póster y no lanza.
- [ ] La hoja de contacto muestra la secuencia correcta de principio a fin.
- [ ] Has medido y reportado por separado: póster, **cada trozo** de JS en
      gzip (que estén separados de verdad, no inlined), datos gzip, y el total
      de una visita que ve la animación y de una que no.
- [ ] Has avisado de que el servidor debe comprimir la extensión del binario
      (no es un tipo conocido; puede hacer falta añadirlo a `gzip_types` o
      servirlo como `.bin`) y de cachearlo como inmutable.

## Sin verificar

- El render WebGL (luces, `instanceColor`, bucle, arrastre) no se ha visto
  nunca en un navegador: aquí no hay ninguno y `puppeteer browsers install
  chrome` falla por el proxy, igual que compilar `headless-gl` (le faltan las
  cabeceras de X11). Todo lo demás de esta skill sí está comprobado.
- El comportamiento en móvil y el efecto real de `dprMax`.
- Que un nginx o Coolify concretos compriman la extensión `.nw`.
