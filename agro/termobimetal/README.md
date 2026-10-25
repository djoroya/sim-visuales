# Un invernadero que se ventila solo: hojas de termobimetal

¿Puede un invernadero ventilarse sin motores ni electricidad, con hojas de termobimetal en el tejado que
se curvan al calentarse, como la piel del pabellón Bloom de Doris Kim Sung? Este estudio junta tres
piezas: la hoja en **CalculiX** (cuánto se curva de verdad y qué le hace el viento), su temperatura bajo
el sol y el viento, y el **invernadero por piezas** (`../invernadero`, modelo GES) con el tiempo real de
HortiMED.

| Archivo | Qué hace |
|---|---|
| `python/fem.py` | Lámina bicapa en CalculiX: malla de hexaedros C3D8I, entrada, ejecución y lectura |
| `python/hoja.py termica\|viento [s]` | La hoja de 150 × 50 × s mm: curvatura frente a la fórmula y viento → `datos/` |
| `js/lamina.js` | Temperatura de la hoja (sol, cielo, aire de fuera y de dentro) y apertura |
| `js/experimento.mjs` | El invernadero con cada estrategia de ventanas, 16 feb – 9 ago 2018 |
| `js/barrido.mjs [procesos]` | Barrido en paralelo de estrategias y diseños → `tmp/barrido.json` |
| `js/serie.mjs`, `python/figuras.py` | Series de las estrategias principales y figuras → `tmp/fig_*.png` |
| `js/prueba.mjs` | Comprobaciones: semejanza del cambio de forma y viento frente a CalculiX |

CalculiX 2.23 de conda-forge, en local: `conda create -p ../../.conda-ccx -c conda-forge calculix`.

## El material

Termobimetal **Kanthal 230** (36Ni / NiMn-acero): curvatura específica k = 43·10⁻⁶ K⁻¹ (DIN 1715,
20–130 °C), E = 135 GPa, tensión de flexión admisible ≈ 190 MPa a temperatura ambiente (manual de
Kanthal). En CalculiX, dos capas del mismo espesor y módulo con Δα = 2k/3, que da la misma k.

## Resultados

**1. CalculiX frente a la fórmula del fabricante.** Una tira estrecha (100 × 2 × 0,5 mm) coincide con el
arco de curvatura k·ΔT/s con un 0,6 % de diferencia, con grandes giros incluidos.

**2. La anchura cuenta.** Una hoja ancha empieza combándose como un casquete (sigue la fórmula) y, a
partir de cierto calentamiento, pasa a curvarse como un cilindro y sube **un 20 % más** (límite teórico
1 + ν = 1,3). El cambio depende de ΔT·(b/s)²: en la hoja de 0,2 mm ocurre hacia 5 K, en la de 0,4 mm
hacia 20 K, y la tabla de una reescalada da la otra (0,3 mm de diferencia en la punta).

**3. El viento la abre.** La succión de 8 m/s levanta 25 mm la hoja cerrada de 0,2 mm (placa empotrada:
24,6 mm; CalculiX: 24,7 mm), tanto como 9 K de calor. Para una hoja que abra un 20 % con 10 K, el
viento de 8 m/s la levanta 1,5 veces más que el calor, **sea cual sea su tamaño**: la relación solo
depende del material, E·k³. Abierta y con presión del viento encima, la hoja de 0,2 mm cede de golpe
hacia 30 Pa (≈ 7 m/s); el cálculo estático encuentra ahí un punto límite (pendiente de confirmar con un
cálculo dinámico). Con **0,4 mm**: 3 mm de subida a 8 m/s, 38 MPa a 14 m/s y el punto límite hacia
87 Pa (≈ 12 m/s; en los datos, 2 horas en seis meses).

**4. El invernadero.** GES con el tiempo de HortiMED (16 feb – 9 ago 2018), 71 estrategias:

| Ventanas | Horas > 30 °C | Horas < 10 °C | Fruto (g/m² de carbohidrato) |
|---|---|---|---|
| Cerradas (solo rendijas) | 228 | 662 | 1965 |
| Motor, mejor consigna (22–26 °C) | 12 | 670 | 2372 |
| Abridor de cera, mejor (desde 20 °C) | 12 | 678 | 2380 |
| **Termobimetal 0,4 mm, blanco, plano a 15 °C, doble de área** | 19 | 681 | **2386** |
| Termobimetal 0,2 mm (el viento lo abre) | 15 | 698 | 2356 |
| Termobimetal negro | 12 | 709 | 2296 |

- Las hojas **no sienten el aire de dentro**: el viento las enfría mucho más que el aire interior. Siguen
  al sol y al aire de fuera, que es lo que calienta el invernadero; la pintura es la ganancia sobre el
  sol. Negras, abren en días fríos y soleados (más horas de frío).
- En verano abren como mucho un 25 % (el motor llega al 100 %) y el invernadero queda ~2 °C más
  caliente a mediodía. En primavera ventilan poco y constante, y reponen el CO₂ que gastan las plantas:
  por eso el fruto total no queda por debajo del motor.
- **Cerrar con mal tiempo es barato.** Cerrar con viento > 8 m/s no cambia nada; cerrar además con
  humedad exterior > 90 % (cota de la lluvia, que los datos no traen) baja el fruto un 0,6 %.
- **El viento sin tope sí cuesta** (hoja de 0,2 mm: 23 horas más de frío y −1,6 % de fruto). La salida
  es una hoja más rígida (0,4 mm) y más área de hojas, o un tope mecánico.

## Lo que se supone

- GES ventila con un caudal proporcional a la apertura (30 renovaciones/h a tope), sin depender del
  viento ni del tiro; «área de hojas = r × área de ventanas del motor».
- Temperatura de la hoja en estacionario (constante de tiempo ~30 s), h_e = 5,7 + 3,8 u (McAdams),
  h_i = 4 W/(m² K), ε = 0,9; la hoja, en el tejado SE inclinado 25°.
- Apertura = subida de la punta / largo (en una fila de hojas iguales, los lados no abren).
- Viento sobre la hoja con Cp = 1; cera: rampa de 11 K y 15 min de retraso (datos de fabricantes).
- El tiempo de HortiMED no trae lluvia; la latitud (43° N) es supuesta.

## Fuentes

- Kanthal, *Thermostatic Bimetal Handbook* (k, E, tensión admisible del Kanthal 230; fórmulas [1]–[8]).
- ASTM B388 / DIN 1715: termobimetal y su curvatura específica.
- D. K. Sung (DOSU Studio): Bloom (2011) e InVert; fachadas de termobimetal.
- Invernadero: modelo GES (EECi, Cambridge, MIT) y tiempo de HortiMED (Zenodo 10.5281/zenodo.6697044).
