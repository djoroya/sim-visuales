# Una pila SOFC por dentro

Una pila de combustible de óxido sólido (SOFC) contada como piezas: un ánodo y un cátodo que se
llenan y se vacían de gas, la electroquímica que los conecta y las pérdidas que separan la tensión
ideal de la que se mide. La idea viene del modelo de pila que hice en el proyecto **AGRO-SOFC**
(Universidad de Deusto, 2020–2023), donde una SOFC alimentada con combustible reformado iba a dar
electricidad y calor a un invernadero de tomate. Este repositorio lo reescribe desde las ecuaciones,
con **datos públicos**: los del proyecto son del consorcio y no se publican.

**Estado: los 4 pasos**: celda comprobada con medidas, pila dinámica con combustible mixto, núcleo
en JavaScript y visor interactivo (`app/`). Plan completo:
`personalpage/plans/PLAN_PILA_SOFC.md`.

| Archivo | Qué hace |
|---|---|
| `python/termo.py` | Entalpía, entropía y energía de Gibbs de H₂, O₂, H₂O, CO, CH₄ y CO₂ (Shomate, NIST); `python python/termo.py` comprueba E₀ |
| `python/celda.py` | Celda en régimen permanente: Nernst en la interfaz del ánodo, pérdidas de concentración, óhmica y de activación |
| `python/datos_delzotto.py` | Curvas tensión–corriente de Del Zotto et al. (2021) a `datos/delzotto-iv.json` |
| `python/ajuste.py` | Ajuste con 750 y 800 °C y predicción de 700 °C; escribe `datos/celda-ajuste.json` |
| `python/dinamica.py` | Pila dinámica (traslación de `SOFC_meca` de AGRO-SOFC): ánodo y cátodo con 7 especies, válvulas, combustible mixto H₂/CO/CH₄, Nernst de la mezcla, tensión termoneutra y calor; tensión «original» (N₀E − rI) o «calibrada» (pérdidas del paso 1) |
| `python/prueba_dinamica.py` | Solución exacta de primer orden, conservación de átomos y coherencia con la celda del paso 1 |
| `python/referencia.py` | Pila del visor (`datos/pila-visor.json`) y trayectorias de referencia para el JavaScript |
| `app/src/modelo/` | Núcleo en JavaScript: `termo.js`, `celda.js`, `pila.js` (Runge–Kutta 4) |
| `app/prueba/compara.mjs` | JavaScript frente a Python (`cd app && npm run prueba`) |
| `app/src/` | Visor (React): esquema vivo de la celda, cifras, de dónde sale la tensión, series y curva de polarización (`npm run dev`, `npm run build`) |

## Comprobaciones

- **Termodinámica**: ΔG de H₂ + ½O₂ → H₂O(g) a 1000 K = −192,59 kJ/mol (tablas: −192,6); E₀ = 0,998 V.
- **Tensión en vacío**: el combustible del ensayo es H₂ seco, así que Nernst necesita saber cuánta agua
  hay en el ánodo. Despejándola de las 24 tensiones medidas sale **~2 %** y casi constante con
  x_H2 ≤ 0,5 en las tres temperaturas: una pequeña fuga. Con 75–90 % de H₂ la tensión medida queda
  12–32 mV por debajo de Nernst, algo que una fuga constante no explica; se deja como discrepancia.
- **Curvas tensión–corriente**: ajustadas con las 16 de 750 y 800 °C, predicen las 8 de **700 °C sin
  haberlas visto** con **14 mV de error medio** (36 mV como máximo). En el entrenamiento, 17 mV.
- **Qué no determinan los datos**: las curvas I–V no separan la pérdida óhmica de la de activación
  (ajustada libre, la resistencia óhmica se va a 0,001 Ω; harían falta medidas de impedancia). Se fija
  un valor típico de electrolito de YSZ (0,15 Ω·cm² a 750 °C, 80 kJ/mol) y se ajustan la activación
  y la difusión. Con todo libre el error baja a 10–12 mV, pero con parámetros sin sentido físico.

Pila dinámica (`python python/prueba_dinamica.py`):

- **Solución exacta**: con un escalón de corriente, cada presión parcial es una exponencial de primer
  orden con τ = V/(K_v R T); la integración la reproduce con error 2·10⁻⁹ del salto.
- **Conservación**: con biogás reformado (H₂, CO, CH₄, CO₂, H₂O) y escalones de carga, los átomos de H, C,
  O y N que entran son los que salen más los acumulados (desequilibrio ≤ 3·10⁻⁸ de lo que entra).
- **Coherencia con el paso 1**: en régimen permanente, con el ensayo de Del Zotto, da la tensión de la
  celda calibrada con 0,35 mV de diferencia (la presión total del cátodo baja un poco al consumirse O₂;
  la celda usa fracciones molares).
- **Por qué no se compara con OPEM**: su versión 1.4 evalúa el retardo de primer orden en s = 1 en lugar
  de s = 0 en régimen permanente, y en Padulles-II resta el agua producida en lugar de sumarla.
- **Parámetros del original**: con K = 0,005 kmol/(atm·s) la válvula deja salir 5 mol/s a 1 atm, mucho
  para 30 celdas: el ánodo queda casi en vacío (milésimas de atm) y responde en centésimas de segundo; y
  0,5 m³ de volumen es enorme para una pila así. El visor fija K desde el caudal nominal (1 atm) y un
  volumen de pocos litros, que da segundos de respuesta, como en Padullés.

Núcleo en JavaScript (`npm run prueba` en `app/`), frente a Python con la pila del visor y escalones de
carga 0 → 30 → 45 → 20 A: tensión de la pila con 2·10⁻⁵ mV de diferencia máxima y presiones parciales con
3·10⁻¹⁰ de error relativo (paso 0,01 s); 60 s de pila en 50 ms (13 ms con paso 0,05 s, error 10⁻⁴ mV).

La pila del visor (30 celdas de 100 cm², biogás reformado, 70 % de utilización a 40 A, aire λ = 4, 2 L
por compartimento, τ del ánodo ≈ 2 s) enseña lo que pasa al pedir demasiado: a 30 A da 759 W y 360 W de
calor; a 45 A (79 % del combustible) el H₂ del ánodo cae a 0,10 atm, la tensión a 0,53 V por celda y la
potencia **baja** a 712 W mientras el calor sube a 966 W.

El visor deja pedir de 0 a 60 A, pero como la electrónica de una pila real no deja bajar de 0,6 V por
celda (el níquel del ánodo se oxidaría), limita la corriente a la que la pila sostiene con ese combustible y
ese caudal (44,9 A con el biogás nominal) y lo avisa. Se puede cambiar el combustible (biogás reformado,
gas de síntesis, H₂), su caudal y el aire.

A 750 °C, 50 % de H₂ y 2 A (0,57 A/cm²), de una tensión de Nernst de 1,010 V se pierden 71 mV por
concentración, 86 por resistencia y 41 por activación: quedan 0,812 V.

El reformador (equilibrio y dinámica) tiene su propio directorio: `../reformador`.

## Reproducir

```bash
python3 -m venv ../../.venv && ../../.venv/bin/pip install numpy==2.2.6 scipy==1.15.3
mkdir -p tmp/zenodo-delzotto && curl -L -o "tmp/zenodo-delzotto/DATA 2 article Energies 14-02038.xlsx" \
  "https://zenodo.org/records/5763484/files/DATA%202%20article%20Energies%2014-02038.xlsx?download=1"
../../.venv/bin/python python/datos_delzotto.py "tmp/zenodo-delzotto/DATA 2 article Energies 14-02038.xlsx"
../../.venv/bin/python python/ajuste.py
```

## Fuentes

- **Datos de la celda**: L. Del Zotto, A. Monforti Ferrario, A. Hatunoglu, A. Dell'Era (2021),
  doi:[10.5281/zenodo.5763484](https://doi.org/10.5281/zenodo.5763484), CC BY 4.0; artículo en
  *Energies* 14, 2038 (acceso abierto).
- **Termodinámica**: NIST Chemistry WebBook, SRD 69 (coeficientes de Shomate).
- **Modelo dinámico de la pila** (paso 2): J. Padullés, G. W. Ault, J. R. McDonald (2000), *An
  integrated SOFC plant dynamic model for power system simulation*, J. Power Sources 86, 495–500.
- **Sistema con biogás** (para el visor): datos de operación del piloto de Luleå del proyecto
  WEDISTRICT (RISE), doi:[10.5281/zenodo.14163174](https://doi.org/10.5281/zenodo.14163174), CC BY 4.0.
