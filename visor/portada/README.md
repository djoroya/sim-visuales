# Bucles de la portada

Los fondos animados del carrusel de la portada de djoroya.com
(`personalpage/web/src/components/Hero.astro`). Cada simulación tiene un script que
dibuja sus fotogramas a 2400×800 a partir de los **datos de verdad** de su carpeta
(los mismos que usan los visores de los tutoriales); `comun.py` hace el resto igual
para todas: cierre del bucle, compresión, póster y medida de contraste.

```bash
./run.sh                # pastoreo y nanohilo: renderiza, copia a la web y mide
./run.sh nanohilo       # uno solo
../../.venv/bin/python contraste.py    # solo la medida
```

Salen a `tmp/salida/` y `run.sh` los copia a `web/public/sims/portada/<nombre>/`.
Todo con `nice` y como mucho 4 procesos.

## Qué sale de cada uno

Por diapositiva, `<nombre>.webm` (VP9) y `<nombre>.mp4` (H.264) a 2400×800, los
mismos con `-1200` a 1200×400, y `<nombre>-poster.webp/.png` (y `-1200`), que es el
**primer fotograma exacto** del bucle: el vídeo se pinta sobre el póster y si no
coincidieran se notaría el cambio.

| Diapositiva | Bucle | WebM 2400 | MP4 2400 | WebM 1200 | MP4 1200 | Póster WebP 2400 / 1200 |
|---|---|---:|---:|---:|---:|---:|
| `grieta.py` (no se publica) | 6 s, 20 fps | 599 KiB | 1013 KiB | 347 KiB | 480 KiB | — |
| `pastoreo.py` | 6 s, 24 fps | 189 KiB | 180 KiB | 125 KiB | 107 KiB | 19 / 8 KiB |
| `nanohilo.py` | 6 s, 24 fps | 186 KiB | 191 KiB | 92 KiB | 83 KiB | 25 / 10 KiB |

Contraste del texto claro (`#e8eef6`) en la zona del titular, el peor caso de 1100 a
2560 px de ancho y de todo el bucle (`contraste.py`):

| Diapositiva | Texto claro | Ámbar del antetítulo | Peor caso |
|---|---:|---:|---|
| grieta (imagen fija, la que fijó el velo) | 6,66:1 | 3,62:1 | extremo del zoom, ventana de 1100 px |
| pastoreo | 14,2:1 | 7,7:1 | todo el bucle: la zona de texto es fondo liso |
| nanohilo | 11,8:1 | 6,4:1 | primer fotograma, 1100 px |

El ámbar del antetítulo sobre la grieta (3,6:1 en el peor píxel de toda la zona) ya era
así antes del carrusel: el antetítulo va arriba del bloque, sobre la parte más oscura.

## Reglas para una diapositiva nueva

1. **Encuadre**: fondo azul marino `#0d1f36` en la mitad izquierda, que es donde va el
   texto; lo vistoso entre el 60 y el 80 % del ancho. Acentos ámbar `#f59e0b` y azul
   `#14519b`/`#3f8fc4`. Si hay algo que cruza la zona del texto, una niebla
   horizontal hacia el fondo, pintada en el render (ver `nanohilo.py`).
2. **El velo no se toca**: está medido sobre la grieta. `contraste.py` tiene que dar
   ≥ 6,7:1; si no, se cambia el encuadre del render.
3. **Bucle de 4-6 s que cierre**: o la escena es estacionaria (la grieta vista desde
   la punta), o se funden los últimos fotogramas con los primeros (`cierra_bucle`).
   La web reinicia el vídeo al entrar la diapositiva y la cambia a los 7 s, así que el
   cierre se ve como mucho una vez.
4. **Peso**: 150-300 KiB a 2400. Lo caro no es el tamaño sino el **ruido que cambia
   en cada fotograma** (vibración térmica, parpadeo de colores): hay que quitarlo en
   el render, no subiendo el CRF, que es lo que dejaba borroso el primer vídeo.
5. Añadir la entrada a `DIAPOSITIVAS` en `Hero.astro` (título, herramienta, tutorial,
   póster, vídeo, foco y texto alternativo) y la línea en `contraste.py`.

## Decisiones

**Por qué se renderiza a 2400 y la de 1200 sale reescalando.** Lanczos sobre un
fotograma nítido da bordes más limpios que volver a dibujar a la mitad (los discos de
3-4 px de matplotlib salen facetados) y es la mitad de trabajo.

**La grieta no tiene vídeo.** `grieta.py` hace el único bucle posible de una grieta
que avanza: la cámara pegada a la punta, con el mismo encuadre que la imagen fija.
Pero en ese sistema la grieta y su halo están quietos y lo único que cambia es el
ruido térmico del campo: a la vista es casi la imagen fija y pesa 600 KiB (WebM) y 1
MiB (MP4). Se queda la imagen fija con el zoom por CSS. El script se deja por si se
quiere retomar (por ejemplo, promediando el campo en el tiempo).

**Pastoreo.** Trayectoria óptima de `control/pastoreo-optimo` (escena 1 del
`.herd2`). El óptimo lleva el rebaño al objetivo en los primeros ~110 s del
horizonte y luego solo lo mantiene, así que el bucle es ese traslado (interpolado
entre fotogramas exportados para ir suave a 24 fps), un rato con el rebaño ya
quieto en el objetivo y el fundido al principio. Cámara fija, todo en el 40 %
derecho.

**Nanohilo.** Volcados de `md/nanohilo-cu/datos/frames`, desde que aparecen las
fallas de apilamiento ya formadas (volcado 94) hasta poco después de la rotura (166),
a medio volcado por fotograma.
El hilo es periódico en x, así que se dibujan las copias vecinas y cruza la banda;
el cuello se clava en el 72 % y hacia la izquierda se funde con el fondo. Las fallas
(HCP) en ámbar: la plasticidad es lo que se enciende. El primer render, átomo a
átomo tal cual, pesaba **2,3 MiB**: la vibración térmica y el parpadeo del tipo CNA
son ruido imposible de predecir para el códec. Ahora posiciones y colores se
promedian con una gaussiana en el tiempo (σ = 2 volcados) antes de dibujar (1,5 MiB),
los átomos van sin brillo especular y algo más grandes para tapar las capas de detrás,
cuyo muaré cambia en cada fotograma (y quedaba en ~500 KiB), y el tramo se reproduce a
medio volcado por fotograma, que reduce el movimiento entre fotogramas: 186 KiB.
