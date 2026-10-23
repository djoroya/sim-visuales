# Una pila SOFC por dentro

Una pila de combustible de óxido sólido (SOFC) contada como piezas: un ánodo y un cátodo que se
llenan y se vacían de gas, la electroquímica que los conecta y las pérdidas que separan la tensión
ideal de la que se mide. La idea viene del modelo de pila que hice en el proyecto **AGRO-SOFC**
(Universidad de Deusto, 2020–2023), donde una SOFC alimentada con combustible reformado iba a dar
electricidad y calor a un invernadero de tomate. Este repositorio lo reescribe desde las ecuaciones,
con **datos públicos**: los del proyecto son del consorcio y no se publican.

**Estado: paso 1 de 4** (celda en régimen permanente, comprobada con medidas). Siguen la dinámica de
ánodo y cátodo con combustible mixto, el núcleo en JavaScript y el visor. Plan completo:
`personalpage/plans/PLAN_PILA_SOFC.md`.

| Archivo | Qué hace |
|---|---|
| `python/termo.py` | Entalpía, entropía y energía de Gibbs de H₂, O₂, H₂O, CO, CH₄ y CO₂ (Shomate, NIST); `python python/termo.py` comprueba E₀ |
| `python/celda.py` | Celda en régimen permanente: Nernst en la interfaz del ánodo, pérdidas de concentración, óhmica y de activación |
| `python/datos_delzotto.py` | Curvas tensión–corriente de Del Zotto et al. (2021) a `datos/delzotto-iv.json` |
| `python/ajuste.py` | Ajuste con 750 y 800 °C y predicción de 700 °C; escribe `datos/celda-ajuste.json` |

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

A 750 °C, 50 % de H₂ y 2 A (0,57 A/cm²), de una tensión de Nernst de 1,010 V se pierden 71 mV por
concentración, 86 por resistencia y 41 por activación: quedan 0,812 V.

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
