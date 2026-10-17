# Validacion

Con el radio de corte en 1.5 sigma solo entran los primeros vecinos, asi
que el equilibrio exige `phi'(a) = 0` y las constantes elasticas salen de la
formula de Born en cerrado. Nada de esto esta ajustado: son formulas.

| Magnitud | Unidad | LAMMPS | Analitico | Error relativo |
|---|---|---:|---:|---:|
| Parametro de red `a` | sigma | 1.1224620 | 1.1224620 | 2.8e-15 |
| Energia de cohesion | epsilon/atomo | -2.0389902 | -2.0389902 | 2.3e-14 |
| `C11` | epsilon/sigma^2 | 74.2354008 | 74.2354004 | 5.5e-09 |
| `C12` | epsilon/sigma^2 | 24.7451335 | 24.7451335 | 5.9e-10 |
| `C66` | epsilon/sigma^2 | 24.7451335 | 24.7451335 | 5.4e-11 |
| Energia de superficie `gamma` | epsilon/sigma | 0.6055112 | 0.6055113 | 2.4e-08 |

La energia de superficie es la unica que no cae exacta, y por una razon
fisica: el valor analitico cuenta los enlaces que se rompen, y LAMMPS deja
ademas que los atomos del borde se relajen. Esa diferencia, un 0,015 %, es la
relajacion de la superficie.

## Lo que se deriva

| | |
|---|---:|
| Coeficiente de Poisson `nu = C12/C11` | 0.333333  (exacto: 1/3 = 0.333333) |
| Modulo de Young 2D `E` | 65.9870 |
| Isotropia: `|C66 - (C11-C12)/2| / C66` | 8.0e-09 |
| Densidad `rho` | 0.916486 |
| Onda longitudinal `c_l` | 9.0000 |
| Onda transversal `c_s` | 5.1962 |
| Onda de Rayleigh `c_R` | 4.8402 |

## La grieta

| | |
|---|---:|
| Velocidad de la punta | 1.443 sigma/tau |
| Velocidad de Rayleigh `c_R` | 4.840 sigma/tau |
| **v / c_R** | **0.298** |

El resultado clasico es que una grieta fragil no supera `c_R` y en la practica
se queda entre 0,2 y 0,5. Esto es una comparacion con un **limite**, no con un
valor predicho: dice que el resultado es compatible con la teoria.
