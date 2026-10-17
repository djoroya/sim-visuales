# Comprobaciones

## 1. Las fuerzas son las del modelo

Se colocan dos individuos a distancia `r` y se compara la fuerza que aplica
LAMMPS con la formula del TFM, en 60 distancias entre 5 y 195.

| Interaccion | Como se implementa | Error absoluto max. | Error relativo max. |
|---|---|---:|---:|
| oveja-oveja `g_oo` | `pair_style table` | 3.00e-04 | 1.80e-03 |
| perro sobre oveja `g_op` | `fix addforce` | 4.66e-15 | 3.96e-15 |

La repulsion del perro sale exacta a precision de maquina porque se evalua
directamente con `fix addforce`; la de oveja-oveja arrastra el error de
interpolacion de `pair_style table`, que es el precio de poder usar una
fuerza cualquiera. **Ojo con las distancias cortas**: `table linear` espacia
su tabla interna en `r^2`, asi que por debajo de `r ~ 2` la interpolacion se
degrada deprisa. La tabla empieza en `r = 2` y en el ensayo las ovejas nunca
se acercan tanto, pero conviene saberlo: con la tabla arrancando en 0,4 el
error a `r = 1` era del 480 %.

## 2. Un perro y una oveja: un numero cerrado

El modelo de Escobedo, Ibanez y Zuazua (2016) tiene, en modo persecucion
(`kappa = 0`), una solucion asintotica exacta: los dos agentes acaban
viajando en linea recta, separados una distancia constante y a la misma
velocidad. Imponiendo aceleracion nula en sus ecuaciones (3)-(4),

    C_D^E/d (1 - dc^2/d^2) + C_R d1^4/d^3 = nu_d v ,    v = C_E^D/(nu_e d)

y con los valores del articulo (`C_D^E = 3`, `C_E^D = 2`, `C_R = 0,5`,
`dc = d1 = 2`, `nu_d = 1`, `nu_e = 2`) queda **d = sqrt(2)** y
**v = 1/sqrt(2)**. El articulo da los mismos valores (`delta_as = sqrt(2)`,
`v_as ~ 0,71`).

| Magnitud | LAMMPS | Analitico | Error |
|---|---:|---:|---:|
| separacion perro-oveja | 1.414213562 | 1.414213562 | 2.6e-12 |
| velocidad del perro | 0.707106781 | 0.707106781 | 3.9e-12 |
| velocidad de la oveja | 0.707106781 | 0.707106781 | 1.4e-12 |

Es el tipo de comprobacion que mas vale: un numero cerrado, sin ajustar nada,
y con el integrador y las fuerzas de LAMMPS por medio.

## 3. El ensayo completo

Aqui no hay valor de referencia que comparar, solo el comportamiento que
describe el TFM (figura 9): la heuristica lleva el rebano al objetivo pero no
lo deja quieto.

| Magnitud | Valor |
|---|---:|
| distancia inicial al objetivo | 202.2 |
| tiempo en llegar (distancia < 20) | 400 |
| distancia media despues de llegar | 4.0 |
| maxima despues de llegar | 19.5 |
| dispersion inicial (radio de giro al cuadrado) | 1006 |
| dispersion media despues de llegar | 418 |

Dos lecturas: la dispersion **baja** respecto a la inicial, es decir, el perro
agrupa al rebano mientras lo conduce; y despues de llegar la distancia al
objetivo no se queda en cero, sino que oscila. Eso es lo que decia el TFM, y
lo que motivaba alli pasarse al aprendizaje por refuerzo.
