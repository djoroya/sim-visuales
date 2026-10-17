# Una grieta atravesando un cristal

Propagación de una grieta en un cristal bidimensional de Lennard-Jones,
coloreada por la tensión que soporta cada átomo. 43.500 átomos, dinámica
molecular con LAMMPS.

Lo que hace interesante este sistema es que **todo se puede comprobar contra
un número**: en 2D y con el radio de corte justo, el cristal triangular tiene
constantes elásticas analíticas exactas, y de ellas sale la velocidad de las
ondas de Rayleigh, que es el límite que una grieta no puede superar.

## El cristal

Red triangular con potencial de Lennard-Jones, `units lj`, radio de corte
**1,5 σ**. Esa elección no es casual: deja dentro los seis primeros vecinos
(a 1,122 σ) y fuera los segundos (a 1,943 σ). Con solo primeros vecinos el
equilibrio exige `φ'(a) = 0`, o sea `a = 2^(1/6) σ`, y la fórmula de Born
para potenciales de pares se puede escribir en cerrado:

```
C11 = (3√3/4) φ''(a)      C12 = C66 = (√3/4) φ''(a)      φ''(a) = 72 ε / (2^(1/3) σ²)
```

De ahí salen, sin ajustar nada:

- **ν = C12/C11 = 1/3** exacto,
- isotropía elástica, que se comprueba con `C66 = (C11 − C12)/2`,
- `E_2D = (C11² − C12²)/C11`,
- las velocidades de onda `c_l = √(C11/ρ)`, `c_s = √(C66/ρ)` y la de Rayleigh
  `c_R ≈ c_s (0,862 + 1,14ν)/(1 + ν)`.

### Validación

`lammps/in.elastico` lo mide todo en LAMMPS y `python/valida.py` lo compara:

| Magnitud | LAMMPS | Analítico | Error |
|---|---:|---:|---:|
| `a` (σ) | 1,12246205 | 1,12246205 | ~1e-12 |
| `E_coh` (ε) | −2,0389902 | −2,0389902 | ~1e-8 |
| `C11` (ε/σ²) | 74,2354008 | 74,2354008 | ~1e-8 |
| `C12` (ε/σ²) | 24,7451335 | 24,7451335 | ~1e-8 |
| `C66` (ε/σ²) | 24,7451335 | 24,7451335 | ~1e-8 |
| `γ` superficie (ε/σ) | 0,6055112 | 0,6055113 | 2,4e-8 |
| isotropía `|C66 − (C11−C12)/2| / C66` | — | 0 | 8,0e-9 |

Que la energía de superficie salga **exacta** tiene su gracia: con solo
primeros vecinos y `φ'(a) = 0`, cada enlace está ya en su mínimo, así que al
cortar el cristal los átomos del borde no sienten fuerza neta y la superficie
**no se relaja**. El valor es justo el de los enlaces rotos, `|φ(a)|/a` por
cara. En un cristal con más vecinos esto no pasaría y habría que medirla.

Dos cosas me costaron tiempo y están en el código comentadas: en `units lj`
el argumento de `lattice` es la **densidad reducida**, no el espaciado (con el
espaciado la red sale comprimida un 10 %); y al medir constantes elásticas
hay que guardar `lx0` como **instantánea numérica**, porque si se deja como
variable dinámica la "restauración" de la caja restaura al valor ya deformado
y sale justo la mitad de `C11`.

## El ensayo

| | |
|---|---|
| Lámina | 300 × 72 celdas, **43.519 átomos** (≈ 337 × 140 σ) |
| Entalla | fila de átomos eliminada desde el borde izquierdo, 18 % de la longitud |
| Carga | modo I: deformación `ε_yy = 0,040` aplicada de golpe de forma afín |
| Contorno | 3 filas congeladas arriba y abajo (desplazamiento impuesto) |
| Temperatura | 0,02 ε/k_B, termostato de Langevin |
| Paso | 0,004 τ, hasta t = 240 τ |

El protocolo es el clásico de fractura en MD: se carga de golpe por encima de
la crítica y **se deja correr sin seguir cargando**. La grieta avanza con la
energía elástica ya almacenada, lo que da una velocidad estacionaria limpia
en vez de una que crece mientras se tira.

La deformación crítica de Griffith para esta entalla,
`σ_c = √(2γE/(π c · 1,12²))`, sale `ε_c ≈ 0,0078`. Se carga a 0,040, es decir
**5,1 veces** la crítica: por debajo de ~0,02 la grieta no arranca (la red
"atrapa" la punta, un efecto de red bien conocido que la teoría continua no
recoge).

### Resultados

| | |
|---|---:|
| Velocidad de la punta | **1,443 σ/τ** |
| Velocidad de Rayleigh | 4,840 σ/τ |
| **v / c_R** | **0,298** |

La grieta recorre 190 σ entre t = 40 y t = 210, y luego se frena al agotarse
la energía disponible. **0,30 c_R** es un valor de libro para fractura frágil:
las grietas no superan `c_R` (por encima, el balance de energía no se
sostiene) y en la práctica se quedan entre 0,2 y 0,5, con inestabilidades y
ramificación cuando se acercan a la mitad.

Honestidad sobre lo que es cada cosa: las constantes elásticas y `γ` son
comparaciones **exactas** contra fórmulas cerradas. La velocidad frente a
`c_R` es una comparación con un **límite teórico**, no con un valor concreto
predicho: dice que el resultado es compatible con la teoría, no que acierte un
número. Y el criterio de Griffith aquí solo da el orden de magnitud, porque la
teoría continua ignora el atrapamiento de red.

## El color

Se colorea por **σ_yy** por átomo, que es la componente que abre la grieta en
modo I: `compute stress/atom` da el virial por átomo, que se divide por el
área por átomo (`√3/2 · a²`).

Hay un detalle que decide si la imagen se entiende o no: la tensión de **un
solo átomo** fluctúa muchísimo más que el campo macroscópico. Sin tratar, el
resultado es confeti. Se promedia dos veces:

- **en el tiempo**, con `fix ave/atom` sobre 20 pasos, dentro de LAMMPS;
- **en el espacio**, con una gaussiana de 1,6–2,2 σ en `python/campo.py`,
  hecha con una rejilla (es O(N) y no necesita scipy).

El mapa de color va de azul marino a ámbar pasando por arena, construido
interpolando en espacio Lab con **luminosidad creciente** (`python/paleta.py`),
de modo que también se lee en escala de grises o con daltonismo. Los extremos
son los colores de la marca: `#14519b` y `#f59e0b`.

El rango se satura en σ_yy = 3,2 y no en el máximo: la singularidad de la
punta es tan aguda que, si se usa el máximo, todo lo demás queda plano.

## Lo que sale

| Fichero | Tamaño | Para qué |
|---|---:|---|
| `salida/grieta-portada.webm` | **170 KiB** | fondo de portada, bucle de 6,5 s |
| `salida/grieta-portada.mp4` | 300 KiB | lo mismo, para quien no soporte WebM |
| `salida/grieta-portada-poster.webp` | 8 KiB | primer fotograma, carga instantánea |
| `salida/grieta.crack` | 1,8 MiB (**967 KiB** con gzip) | datos del visor interactivo |
| `salida/grieta-og.png` | 152 KiB | imagen 1200×630 para compartir |
| `salida/grieta-oscuro-*.png` | ~190 KiB | fotogramas clave, fondo oscuro |
| `salida/grieta-claro-propagacion.png` | 155 KiB | el mismo, fondo claro |

**Por qué la portada es un vídeo y el tutorial un canvas.** El visor dibuja
los átomos de verdad, y eso tiene un suelo de tamaño: ~1,5 bytes por átomo y
fotograma después de comprimir. Diez mil átomos y 63 fotogramas son ya ~970
KiB; los 43.500 originales a 240 fotogramas serían 30 MB. Para el fondo de la
portada, donde hace falta ir por debajo de 300 KiB y el detalle atómico
compite con el titular, sale mejor renderizar el **campo continuo** y
comprimirlo como vídeo: el mismo plano pasa de 409 KiB (átomos) a 170 KiB
(campo) con mejor calidad, porque el patrón de discos es ruido de alta
frecuencia y es justo lo que más caro le sale a un códec.

## Reproducir

```bash
./run.sh              # todo: validación, simulación, vídeo e imágenes
./run.sh validacion   # solo las constantes elásticas
./run.sh simulacion   # solo el ensayo de fractura (unos 3 minutos)
./run.sh salidas      # vídeo, imágenes y datos del visor
```

Necesita LAMMPS (sin paquetes especiales), ffmpeg y Python 3 con numpy,
matplotlib y Pillow. El volcado completo son 283 MB y se queda en `datos/`,
fuera de git.

## Ficheros

| | |
|---|---|
| `lammps/in.elastico` | constantes elásticas y energía de superficie |
| `lammps/in.grieta` | el ensayo de fractura |
| `python/valida.py` | tabla de validación contra las fórmulas |
| `python/punta.py` | localiza la punta y mide su velocidad |
| `python/campo.py` | suavizado espacial del campo |
| `python/paleta.py` | el mapa de color |
| `python/render.py` | fotogramas e imágenes fijas |
| `python/video.py` | bucle sin costura y compresión |
| `python/exporta.py` | el binario `.crack` del visor |
| `web/` | visor en canvas 2D, sin dependencias |
