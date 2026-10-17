# Validacion del potencial

Potencial: **EAM de Cu de Mishin et al.**, `Cu_mishin1.eam.alloy`
(Y. Mishin, M. J. Mehl, D. A. Papaconstantopoulos, A. F. Voter y J. D. Kress,
*Structural stability and lattice defects in copper: ab initio, tight-binding
and embedded-atom calculations*, Phys. Rev. B **63**, 224106, 2001).

Todo se calcula a 0 K con el mismo potencial y la misma instalacion de LAMMPS
que la simulacion del nanohilo (`lammps/in.validacion` y `lammps/in.falla`).

| Magnitud | Unidad | Calculado | Referencia | Error | Fuente de la referencia |
|---|---|---:|---:|---:|---|
| Parametro de red $a_0$ | A | 3.615 | 3.615 | -0.00 % | Cu fcc a 298 K (exp.); dato de ajuste del potencial |
| Energia cohesiva $E_{coh}$ | eV/atomo | 3.54 | 3.54 | +0.01 % | exp. (Kittel, *Solid State Physics*) |
| $C_{11}$ | GPa | 169.9 | 168.4 | +0.90 % | Cu monocristalino a 300 K (Simmons y Wang) |
| $C_{12}$ | GPa | 122.6 | 121.4 | +1.01 % | Cu monocristalino a 300 K (Simmons y Wang) |
| $C_{44}$ | GPa | 76.21 | 75.4 | +1.07 % | Cu monocristalino a 300 K (Simmons y Wang) |
| Modulo de Young $E_{[100]}$ (de los $C_{ij}$) | GPa | 67.12 | 66.7 | +0.62 % | de los $C_{ij}$ experimentales de la misma fuente |
| Modulo de Young $E_{[100]}$ (traccion directa) | GPa | 67.11 | 66.7 | +0.62 % | de los $C_{ij}$ experimentales de la misma fuente |
| Energia de falla de apilamiento $\gamma_{isf}$ | mJ/m$^2$ | 44.38 | 45 | -1.38 % | exp.; 44,4 mJ/m$^2$ en el articulo de Mishin |

Las cuatro primeras magnitudes forman parte del conjunto al que se ajusto el
potencial, asi que un acuerdo tan bueno **no mide la capacidad predictiva del
potencial**: comprueba que la cadena (potencial, LAMMPS, celdas, deformaciones
y conversion de unidades) esta bien montada. La energia de falla de
apilamiento es mas interesante: gobierna la disociacion de dislocaciones en
parciales de Shockley, que es justo el mecanismo que se ve en la animacion.

Las dos medidas de $E_{[100]}$ se obtienen por caminos distintos --- de las
constantes elasticas y estirando la celda mientras se deja relajar la seccion
a tension transversal nula --- y coinciden en 4 cifras, que es la comprobacion
interna de que la deformacion aplicada y la tension medida son coherentes.
