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
| `python/animacion.py`, `js/anim-dia.mjs` | Datos de la animación: la hoja de CalculiX grado a grado y un día de julio → `tmp/` |
| `anim/escena.html`, `anim/grabar.mjs` | La animación (three.js): de la malla de CalculiX al tejado; se graba con Playwright y ffmpeg |

CalculiX 2.23 de conda-forge, en local: `conda create -p ../../.conda-ccx -c conda-forge calculix`.

Animación: `python python/animacion.py 0.2 && node js/anim-dia.mjs 189`, servir `sim-visuales` en
`http://127.0.0.1:4397/` (`python3 -m http.server 4397`) y `node anim/grabar.mjs tmp/fotogramas 24 1600 900`
(Playwright con Chromium y SwiftShader); luego ffmpeg.

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

**4. El invernadero.** GES con el tiempo de HortiMED (16 feb – 9 ago 2018), 75 estrategias, con los
límites de crecimiento del tomate y la ventilación natural de Vanthoor (2011):

| Ventanas | Horas > 30 °C | Horas de día > 32 °C | Horas < 10 °C | Fruto (g/m² de carbohidrato) |
|---|---|---|---|---|
| Cerradas (solo rendijas) | 237 | 116 | 625 | 1563 |
| Motor, mejor consigna (22–26 °C) | 12 | 5 | 635 | 2042 |
| Abridor de cera, mejor (desde 22 °C) | 12 | 5 | 635 | 2047 |
| **Termobimetal 0,4 mm, blanco, plano a 18 °C, 4 × el área de ventanas** | 12 | 5 | 650 | **2014** |
| Termobimetal 0,2 mm (el viento lo abre), 2 × área | 12 | 5 | 682 | 1963 |
| Termobimetal negro, 4 × área | 12 | 5 | 682 | 1865 |

- **El termobimetal se queda a un 1,5 % del motor y de la cera, sin energía**, pero necesita cuatro veces
  el área de ventanas cubierta de hojas: cada hoja abre como mucho un 10–15 %. En las tardes de julio el
  invernadero queda menos de 1 °C más caliente que con motor, con un tercio del área abierta.
- Su defecto son los días fríos y ventosos: el viento levanta las hojas y, además, el caudal crece con el
  viento; el invernadero ventila de más (15 horas más por debajo de 10 °C).
- Las hojas **no sienten el aire de dentro**: el viento las enfría mucho más que el aire interior. Siguen
  al sol y al aire de fuera, que es lo que calienta el invernadero; la pintura es la ganancia sobre el
  sol. Negras, abren en días fríos y soleados.
- **Cerrar con mal tiempo es barato.** Cerrar con viento > 8 m/s no cambia nada; cerrar además con
  humedad exterior > 90 % (cota de la lluvia, que los datos no traen) baja el fruto un 0,6 %
  (calculado con el caudal fijo de GES).
- **El viento sin tope sí cuesta**: la hoja de 0,2 mm pierde un 2,5 % más de fruto. La salida es una hoja
  más rígida (0,4 mm) y más área, o un tope mecánico.

**Ventilación.** GES ventila con un caudal fijo (30 renovaciones/h a tope); aquí se usa la ecuación 8.65
de Vanthoor (2011), tal como la implementa GreenLight (BSD-3): caudal = U·A·C_d/(2·A_suelo)·
√(g·h·ΔT/(2·T_media) + C_w·u²), con las ventanas del 10 % del suelo, C_d = 0,75, C_w = 0,09 y h = 0,68 m
(tabla 8.2, Países Bajos). Para las hojas, A = r × área de ventanas y h = lo que sube la punta. El tiro
pesa poco frente al viento: dar a las ventanas una altura proporcional a la apertura no cambia el motor
ni la cera. Con el caudal fijo de GES, el bimetal con 4 × área daba 2037 g/m².

**5. Calor y CO₂ en el fruto.** Ventilar sube el fruto por dos razones: enfría y repone el CO₂ que las
plantas agotan (un invernadero cerrado baja a ~250 ppm de día). GES relaja los límites de crecimiento
de Vanthoor (40 °C instantáneos y 27 °C de media diaria, en lugar de 34 y 24,5 °C; también los de frío:
6 y 12 °C en lugar de 10 y 15) y castiga poco el calor, por eso este estudio usa los de Vanthoor
(`../invernadero/app/src/modelo/ges.js` los admite como ajustes; por defecto siguen los de GES).

| Fruto (g/m²) | Límites de GES | Límites de Vanthoor | Vanthoor, CO₂ fijado al de fuera |
|---|---|---|---|
| Cerradas | 1965 | 1563 | 1843 |
| Motor 22 °C | 2372 | 2045 | 2073 |

Con Vanthoor, cerrar cuesta un 24 % del fruto; con el CO₂ fijado al de fuera, un 11 %: más o menos la
mitad es calor y la mitad CO₂. Lo que más cambia de GES a Vanthoor es el límite de frío (sin
calefacción, la media diaria de marzo a mayo cae por debajo de 15 °C), igual para todas las
estrategias. Ninguno de los dos modelos tiene el **cuaje**: por encima de ~32 °C de día el tomate pierde
polen viable y deja de cuajar (Sato, Peet y Thomas, 2000), así que el calor real cuesta más de lo que
dicen estas cifras; de ahí el indicador de horas de día por encima de 32 °C.

## Lo que se supone

- Ventilación de Vanthoor (2011) con los parámetros de su tabla 8.2 (Países Bajos) y la infiltración por
  rendijas de GES; «área de hojas = r × área de ventanas del motor».
- Temperatura de la hoja en estacionario (constante de tiempo ~30 s), h_e = 5,7 + 3,8 u (McAdams),
  h_i = 4 W/(m² K), ε = 0,9; la hoja, en el tejado SE inclinado 25°.
- Apertura = subida de la punta / largo (en una fila de hojas iguales, los lados no abren).
- Viento sobre la hoja con Cp = 1; cera: rampa de 11 K y 15 min de retraso (datos de fabricantes).
- El tiempo de HortiMED no trae lluvia; la latitud (43° N) es supuesta.
- Crecimiento del tomate: el de GES (Vanthoor, 2011) con los límites de temperatura de Vanthoor. Sin
  modelo de cuaje: solo el indicador de horas de día por encima de 32 °C.

## Fuentes

- Kanthal, *Thermostatic Bimetal Handbook* (k, E, tensión admisible del Kanthal 230; fórmulas [1]–[8]).
- ASTM B388 / DIN 1715: termobimetal y su curvatura específica.
- D. K. Sung (DOSU Studio): Bloom (2011) e InVert; fachadas de termobimetal.
- Invernadero: modelo GES (EECi, Cambridge, MIT) y tiempo de HortiMED (Zenodo 10.5281/zenodo.6697044).
- B. H. E. Vanthoor et al. (2011), *A methodology for model-based greenhouse design: Part 2*, Biosystems
  Engineering 110, 378–395; límites tal como los implementa Greenhouses-Library (queraltab, TomatoYieldModel.mo).
- S. Sato, M. M. Peet, J. F. Thomas (2000), cuaje del tomate con calor moderado y crónico (32/26 °C).
- D. Katzin et al. (2020), GreenLight, Biosystems Engineering 194, 61–81 (código abierto, BSD-3): la
  ventilación de Vanthoor (`greenhouse_vanthoor_2011_chapter_8.json`).
- C. Kittas et al. (1995, 1997): ventilación natural por tejado y por tejado y laterales.
