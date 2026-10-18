# La escalera de pruebas

Generado por `python/informe.py` a partir de los JSON de `salida/`. Cada peldaño comprueba una cosa; ninguno se salta.

## 0. El paso del integrador no decide el resultado

Mismo control (arbitrario pero fijo) sobre 30 ovejas y 3 perros, horizonte 200 en 80 intervalos, integrado con pasos cada vez más finos. La referencia es el paso más fino.

| subpasos por intervalo | h | `\|z(T) − z_ref\|∞` | segundos |
|---|---:|---:|---:|
| 1 | 2,500 | 5.14e+230 | 0,01 |
| 2 | 1,250 | 3.56e+251 | 0,01 |
| 5 | 0,500 | 4.64e-01 | 0,02 |
| 10 | 0,250 | 6.25e-05 | 0,03 |
| 20 | 0,125 | 2.25e-06 | 0,06 |
| 40 | 0,062 | 0 (referencia) | 0,17 |

Con `h = 2,5` y `h = 1,25` la integración **diverge**: el modelo tiene una escala de tiempo rápida, la del perro (`1/ν_p = 0,2`), y RK4 no la aguanta con pasos largos. A partir de `h = 0,25` el estado final se mueve menos de 10⁻⁴, así que es el paso que se usa en todo lo demás.

## 0b. La dinámica es la misma que la validada en LAMMPS

Mismo estado inicial (30 ovejas, un perro quieto que solo repele), 60 unidades de tiempo. A la izquierda, RK4 en CasADi con la fuerza regularizada; a la derecha, `particulas/pastoreo/` (tabla para `g_oo`, velocity-Verlet con `dt = 0,01`).

| t | centro del rebaño (CasADi) | centro (LAMMPS) | error | dispersión (CasADi / LAMMPS) |
|---:|---|---|---:|---|
| 0 | (-169,71, 110,90) | (-169,71, 110,90) | 0.0000 | 1 010,2 / 1 010,2 |
| 7 | (-165,29, 108,18) | (-165,29, 108,17) | 0.0056 | 792,8 / 792,9 |
| 14 | (-161,34, 105,74) | (-161,33, 105,73) | 0.0050 | 668,4 / 669,0 |
| 21 | (-158,68, 104,09) | (-158,67, 104,08) | 0.0054 | 613,8 / 614,8 |
| 28 | (-156,60, 102,79) | (-156,59, 102,79) | 0.0066 | 583,3 / 584,5 |
| 35 | (-154,84, 101,69) | (-154,83, 101,69) | 0.0078 | 563,1 / 564,6 |
| 42 | (-153,30, 100,73) | (-153,29, 100,73) | 0.0090 | 548,3 / 549,8 |
| 49 | (-151,92, 99,87) | (-151,91, 99,87) | 0.0100 | 536,7 / 538,3 |
| 56 | (-150,67, 99,09) | (-150,67, 99,08) | 0.0109 | 527,4 / 529,0 |

Error máximo del centro del rebaño: **0.0114** sobre un recorrido de 23,2, es decir 0.05 %. La diferencia que queda es la esperable: la tabla de LAMMPS interpola `g_oo` con un error relativo de 1,8·10⁻³ y aquí la fuerza lleva la regularización `r → √(r² + ε²)` con ε = 1.

## 1. El gradiente por diferenciación automática es correcto

40 controles (4 ovejas, 2 perros), gradiente adjunto de CasADi contra diferencias finitas centradas.

| paso de la diferencia finita | error relativo máximo |
|---:|---:|
| 1e-04 | 4.53e-10 |
| 1e-05 | 1.47e-09 |
| 1e-06 | 2.05e-08 |
| 1e-07 | 3.23e-07 |

El mínimo, **4.5e-10**, es el error de truncamiento propio de las diferencias finitas, no del gradiente. Y cuesta 1.6 ms frente a 29 ms (18 veces más) con solo 40 variables; en el caso grande son 960 y la ventaja del adjunto crece con ellas.

## 2. Un perro y una oveja: sale la estrategia de Escobedo et al.

El modelo con un solo perseguidor y un solo perseguido es el de Escobedo, Ibáñez y Zuazua (2016). Lo que describen allí: el perro se coloca **detrás** de la oveja, en la prolongación de la línea objetivo-oveja, y la empuja manteniendo una distancia estable.

| caso | arranque | J inicial | J final | distancia final | llega en | cos(alineación) | distancia perro-oveja | iteraciones |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| detras | frio | 0,931 | 0,087 | 0,6 | t = 37 | 0,999 | 42,1 | 57 |
| detras | caliente | 0,756 | 0,087 | 0,6 | t = 37 | 0,999 | 42,1 | 64 |
| delante | frio | 2,443 | 1,599 | 186,1 | no llega | -0,994 | 193,0 | 27 |
| delante | caliente | 0,856 | 0,139 | 0,3 | t = 74 | 0,398 | 56,1 | 172 |

Con el perro ya detrás, da igual de dónde se arranque: se llega al mismo óptimo, con la oveja alineada (cos = 0,999) y el perro a unas 42 unidades, del orden del alcance de la repulsión (σ = 50).

Con el perro **delante** la cosa cambia, y es el resultado más instructivo de la escalera: arrancando de control nulo, el optimizador converge —con todas las de la ley, `Solve_Succeeded`— a un punto estacionario inútil, el del *abandono*: el perro se aleja hasta que su repulsión es despreciable, el gradiente se anula y ahí se queda. Arrancando de la heurística, que sabe rodear, el mismo optimizador encuentra la solución buena. El arranque en caliente no es un adorno.

## 3. Veinte ovejas y un perro

El optimizador arranca de la heurística y da 300 iteraciones en 100 s (Maximum_Iterations_Exceeded).

| | heurística | óptimo |
|---|---:|---:|
| coste J | 0,374 | 0,161 |
| distancia final | 5,0 | 8,6 |
| cuándo llega a menos de 20 | t = 368 | t = 390 |
| distancia mínima | 5,0 | 1,3 |
| dispersión final | 673 | 164 |
| esfuerzo ∫Σ\|a\|² dt | 2 059 | 49 956 |
| (dispersión de partida) | 603 | 603 |

## 4. 200 ovejas y 3 perros

Horizonte 400 en 160 intervalos de control (960 incógnitas), 10 subpasos de RK4 por intervalo (`h = 0,250`), `|a| ≤ 25` por componente, pesos λ = 0,20, β = 0,20, γ = 0,50.

| | |
|---|---:|
| construir el grafo | 0,5 s |
| simular la heurística | 2,3 s |
| optimizar | 105,2 min, 200 iteraciones |
| estado de IPOPT | Maximum_Iterations_Exceeded |
| infactibilidad dual final | 3.59e-04 |

| | heurística | óptimo |
|---|---:|---:|
| coste J | 0,639 | 0,130 |
| distancia final | 86,9 | 2,0 |
| cuándo llega a menos de 20 | nunca | t = 60 |
| distancia mínima | 86,9 | 0,5 |
| dispersión final | 524 | 503 |
| esfuerzo ∫Σ\|a\|² dt | 428 300 | 39 982 |
| (dispersión de partida) | 1 017 | 1 017 |

## 5. Qué cambia si se cambia el coste

Todas con 200 ovejas, 3 perros, mismo horizonte y misma cota; lo único que cambia son los pesos o el punto de partida. La fila de la heurística está para comparar.

| variante | | distancia final | dispersión final | esfuerzo | tiempo |
|---|---|---:|---:|---:|---:|
| *heurística* | la política del TFM | 86,9 | 524 | 428 300 | 2 s |
| el del enunciado | λ = 0,2, β = 0,2, γ = 0,5, arranque en caliente | 2,0 | 503 | 39 982 | 105 min |
| arranque frío | el mismo coste, pero partiendo de control nulo | 2,2 | 503 | 37 420 | 105 min |
| sin seguimiento | γ = 0: el coste solo mira el instante final | 3,1 | 514 | 120 377 | 126 min |
| más peso a agrupar | λ = 0,5 | 1,7 | 333 | 57 601 | 117 min |
| compacto todo el camino | λ_t = 0,3: la dispersión cuenta en cada instante | 1,4 | 369 | 68 956 | 116 min |

## 6. El rebaño que no es un disco

200 ovejas repartidas en una banda curva con dos grumos (dispersión inicial ≈ 13 700, 255 de distancia al objetivo), los tres perros repartidos —uno dentro del grumo grande— y la cohesión entre ovejas escalada por `k_oo`. Horizonte 600 en 240 intervalos (1440 incógnitas). La dispersión del coste se mide contra el rebaño en reposo (`disp_ref` = 550), no contra la inicial.

| | distancia final | dispersión final | esfuerzo | iteraciones | tiempo |
|---|---:|---:|---:|---:|---:|
| *heurística* | 264,5 | 541 | 414 692 | — | 3 s |
| k_oo = 0,20, λ_t = 0,18 | 12,5 | 282 | 88 918 | 300 | 210 min |
| k_oo = 0,25, λ_t = 0,25 | 5,4 | 199 | 105 525 | 300 | 204 min |

La heurística no mueve este rebaño: los perros orbitan y la distancia al objetivo se queda donde estaba. El óptimo reúne los dos grumos, los conduce y los deja dentro del objetivo gastando una cuarta parte del esfuerzo. Entre las dos versiones, la de cohesión más débil conserva la forma irregular más tiempo (en t = 100 la dispersión todavía es 838 frente a 430) y gasta menos, a cambio de acabar un poco más lejos.

