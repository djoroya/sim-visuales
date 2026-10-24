# Reformador de diésel: equilibrio y dinámica

Una pila de combustible de óxido sólido no se alimenta con diésel: antes, un **reformador** lo convierte
en un gas rico en hidrógeno y monóxido de carbono. Este directorio lo modela de dos maneras: el
**equilibrio químico** que alcanza el gas a la salida y un **modelo dinámico** con las reacciones y la
temperatura del catalizador.

| Archivo | Qué hace |
|---|---|
| `python/termo.py` | Termodinámica de los gases: polinomios de Shomate (NIST) |
| `python/equilibrio.py` | Equilibrio químico por minimización de Gibbs: CH₄, CO, CO₂, H₂, H₂O, N₂, Ar y grafito (hollín) con conservación de átomos |
| `python/valida_literatura.py` | Valida el equilibrio con fuentes públicas: tablas JANAF y umbrales de hollín publicados |
| `python/dinamica.py` | Reformador autotérmico dinámico: caja bien mezclada, cinco reacciones globales y temperatura del catalizador |
| `python/prueba_dinamica.py` | Límite de reacciones rápidas = equilibrio, conservación de átomos y balance de energía |

## Equilibrio

El diésel se trata como «CHₓ» por átomo de carbono (84,4 % de C y 15,6 % de H en masa: x = 2,20). Entre
todas las mezclas de gases y grafito que conservan los átomos que entran, el equilibrio es la de energía
de Gibbs mínima. El hollín aparece solo cuando toca, sin decidirlo a mano.

Validación (`python python/valida_literatura.py`):

- **Termodinámica.** Las constantes de equilibrio del reformado del metano y del desplazamiento del agua
  calculadas con Shomate coinciden con las de las tablas NIST-JANAF entre 700 y 1200 K: 0,03 % de
  diferencia como máximo.
- **Hollín.** La mínima relación vapor/carbono (S/C) sin hollín en reformado con vapor no pasa de 1,8
  entre 400 y 800 °C: con S/C ≈ 2, como recomienda Parmar et al. (2009), no se forma. En autotérmico a
  750 °C, la frontera queda por debajo de los valores seguros publicados (S/C > 1,25 con O₂/C 0,125–0,25;
  1,8 con 0,25 y 1,5 con 0,5 según Ahmed y Föger, recogidos en la misma revisión). Los valores de la literatura llevan margen sobre la
  frontera termodinámica, que es un límite inferior.

## Dinámica

`dinamica.py`: moles de cada especie en el volumen de gas y temperatura del catalizador. Reacciones
globales como en Creaser et al. (2011): oxidación del combustible, reformado del combustible, reformado
del metano y desplazamiento del agua (reversibles, con la Eₐ de Xu y Froment 1989 y las K del mismo modelo
de equilibrio), más la oxidación del H₂. La oxidación calienta y el reformado enfría: la temperatura de un
reformador autotérmico sale del balance de energía. Los factores preexponenciales son supuestos
razonables, no ajustados a un reactor concreto.

Comprobaciones (`python python/prueba_dinamica.py`):

- Con reacciones mil veces más rápidas y temperatura fija, el estacionario coincide con el equilibrio:
  diferencias de milésimas de punto porcentual.
- Átomos de C, H, O, N y Ar conservados en transitorios con escalones: desequilibrio de 10⁻¹⁴.
- Estacionario adiabático (≈ 727 °C con las entradas de ejemplo): la entalpía que entra es la que sale
  más las pérdidas, con 10⁻¹³ de diferencia.

## Fuentes

- D. Creaser et al. (2011), *Modeling study of 5 kWe-scale autothermal diesel fuel reformer*, Applied
  Catalysis A 404, 129–140, doi:10.1016/j.apcata.2011.07.023.
- J. Xu, G. F. Froment (1989), *Methane steam reforming, methanation and water-gas shift: I. Intrinsic
  kinetics*, AIChE Journal 35, 88–96.
- S. Parmar et al. (2009), *Hydrogen generation from diesel*, Journal of Power Sources 194, 1007–1020.
- NIST Chemistry WebBook (Shomate) y tablas NIST-JANAF, 4.ª ed. (1998): C-002, C-067, C-093, C-095, H-064.
