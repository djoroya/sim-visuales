# La escalera de pruebas

Generado por `python/informe.py` a partir de los JSON de `salida/`. Cada peldaño comprueba una cosa.

## 0. La base de senos es el laplaciano de 5 puntos, y CasADi es numpy

Malla 14×14, 20 pasos, control aleatorio y partícula moviéndose (fuerza aleatoria). Diferencia máxima en todo el recorrido:

| comparación | y | z |
|---|---:|---:|
| base de senos frente a matriz de 5 puntos + `splu` | 3.33e-16 | 1.80e-16 |
| CasADi (`mapaccum`) frente a numpy | 2.83e-13 | 4.68e-14 |

con `max |y|` = 0.91: coinciden a precisión de máquina.

## 1. Integrador frente a la solución exacta de modos de Fourier

Sin control, dato inicial `y₀ = 1·sin(1πx)sin(1πy) + 0.5·sin(3πx)sin(2πy) + 0.25·sin(2πx)sin(5πy)`, `z₀ = 0`, T = 1, ν = 0.05. Cada modo es un sistema 2×2 lineal con solución exacta (exponencial de la matriz). Error en norma L² discreta en t = T.

**Espacio** (semidiscreta exacta en el tiempo frente a la continua):

| n | h | sin memoria: err y | orden | con memoria: err y | err z | orden |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 0.0909 | 1.26e-03 | nan | 1.77e-03 | 2.05e-03 | nan |
| 20 | 0.0476 | 3.45e-04 | 2.00 | 4.80e-04 | 5.46e-04 | 2.02 |
| 40 | 0.0244 | 9.05e-05 | 2.00 | 1.25e-04 | 1.42e-04 | 2.00 |
| 80 | 0.0123 | 2.32e-05 | 2.00 | 3.21e-05 | 3.64e-05 | 2.00 |
| 160 | 0.0062 | 5.87e-06 | 2.00 | 8.13e-06 | 9.20e-06 | 2.00 |

**Tiempo** (Euler implícito frente a la semidiscreta exacta, n = 40):

| pasos | dt | sin memoria: err y | orden | con memoria: err y | err z | orden |
|---:|---:|---:|---:|---:|---:|---:|
| 25 | 0.0400 | 3.59e-03 | nan | 4.21e-03 | 5.51e-03 | nan |
| 50 | 0.0200 | 1.81e-03 | 0.99 | 2.11e-03 | 2.78e-03 | 1.00 |
| 100 | 0.0100 | 9.08e-04 | 0.99 | 1.06e-03 | 1.40e-03 | 1.00 |
| 200 | 0.0050 | 4.55e-04 | 1.00 | 5.29e-04 | 7.00e-04 | 1.00 |
| 400 | 0.0025 | 2.28e-04 | 1.00 | 2.65e-04 | 3.50e-04 | 1.00 |
| 800 | 0.0013 | 1.14e-04 | 1.00 | 1.32e-04 | 1.75e-04 | 1.00 |

Órdenes 2 en espacio y 1 en tiempo, los teóricos. En la malla de producción (40×40, 100 pasos) el error relativo total con memoria es 1,03 % en y y 0,46 % en z, dominado por el paso de tiempo.

## 2. Gradiente por diferenciación automática frente a diferencias finitas

Malla 12×12, 16 pasos, controles aleatorios. Componentes al azar (y, en el caso móvil, varias de la fuerza sobre la partícula), diferencias centradas.

| paso | (b) err. rel. por componente | (c) err. rel. por componente |
|---:|---:|---:|
| 1e-03 | 7.90e-10 | 1.10e-02 |
| 1e-04 | 2.48e-09 | 1.10e-04 |
| 1e-05 | 7.20e-08 | 1.10e-06 |
| 1e-06 | 9.77e-07 | 6.87e-07 |
| 1e-07 | 6.40e-06 | 1.23e-05 |

Derivada direccional en una dirección aleatoria: error relativo 4.80e-12 en (b) y 1.78e-08 en (c). Lo que queda es el error de truncamiento y redondeo de las diferencias finitas.

## 3. IPOPT encuentra el mínimo (casos cuadráticos)

Con el soporte fijo el coste es cuadrático en f, y el mínimo exacto se puede calcular aparte: gradiente conjugado sobre las ecuaciones normales `H f = −g₀`, con `H v` sacado del propio gradiente. Malla 40×40, 100 pasos.

| caso | J (gradiente conjugado) | J (IPOPT) | dif. rel. en J | dif. rel. en f | iter. CG | iter. IPOPT |
|---|---:|---:|---:|---:|---:|---:|
| (a) | 2.02326706e-05 | 2.02326706e-05 | 1.7e-15 | 1.6e-09 | 209 | 344 |
| (b) | 3.34160602e-02 | 3.34160602e-02 | 2.9e-15 | 2.3e-08 | 420 | 1021 |

En (b), además, esto descarta que el residuo de memoria sea culpa del optimizador: es el mínimo de verdad.

## 4. Los tres casos (malla de producción)

`|y(T)|/|y₀|`: temperatura final relativa a la inicial. `|z(T)|/|z_libre(T)|`: memoria final relativa a la del sistema con memoria sin control.

| caso | n | pasos | `|y(T)|/|y₀|` | (sin control) | `|z(T)|/|z_libre|` | esfuerzo `∫∫f²` | iter. | s | estado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| (a) calor sin memoria, control fijo | 40 | 100 | 1.56e-03 | 1.21e-01 | 7.50e-01 | 0.007 | 236 | 37 | Solve_Succeeded |
| (b) con memoria, control fijo | 40 | 100 | 7.79e-02 | 8.27e-02 | 1.58e-01 | 1.413 | 715 | 117 | Solve_Succeeded |
| (c) con memoria, control movil | 40 | 100 | 6.85e-03 | 8.27e-02 | 4.70e-03 | 0.354 | 3000 | 570 | Maximum_Iterations_Exceeded |
| (c desde reposo) con memoria, control movil | 40 | 100 | 9.41e-03 | 8.27e-02 | 4.75e-03 | 0.410 | 3000 | 553 | Maximum_Iterations_Exceeded |

En (a) la memoria no cuenta (no hay memoria que apagar); la columna de z se deja como dato, no como objetivo.

## 5. (b) frente a (c) al refinar

El resultado cualitativo —con soporte fijo queda memoria, con soporte móvil no— no puede depender de la malla, del paso ni del peso del esfuerzo.

| n | pasos | β | (b) `|y(T)|/|y₀|` | (b) `|z(T)|/|z_libre|` | (b) esfuerzo | (c) `|y(T)|/|y₀|` | (c) `|z(T)|/|z_libre|` | (c) esfuerzo | (b)/(c) en z |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 40 | 100 | 1e-05 | 8.23e-02 | 1.49e-01 | 12.900 | 2.89e-03 | 2.31e-03 | 0.613 | 64× |
| 40 | 50 | 0.0001 | 7.80e-02 | 1.60e-01 | 1.464 | 7.15e-03 | 4.73e-03 | 0.368 | 34× |
| 20 | 100 | 0.0001 | 8.66e-02 | 1.67e-01 | 1.679 | 7.25e-03 | 4.61e-03 | 0.349 | 36× |
| 30 | 100 | 0.0001 | 7.98e-02 | 1.61e-01 | 1.432 | 6.97e-03 | 4.84e-03 | 0.358 | 33× |
| 40 | 100 | 0.0001 | 7.79e-02 | 1.58e-01 | 1.413 | 6.85e-03 | 4.70e-03 | 0.354 | 34× |
| 50 | 100 | 0.0001 | 7.70e-02 | 1.57e-01 | 1.400 | 7.03e-03 | 4.62e-03 | 0.366 | 34× |
| 60 | 100 | 0.0001 | 7.65e-02 | 1.57e-01 | 1.394 | 6.99e-03 | 4.65e-03 | 0.358 | 34× |
| 40 | 200 | 0.0001 | 7.79e-02 | 1.58e-01 | 1.382 | 6.90e-03 | 4.72e-03 | 0.355 | 33× |
| 40 | 100 | 0.001 | 6.17e-02 | 1.79e-01 | 0.485 | 1.83e-02 | 1.53e-02 | 0.285 | 12× |

