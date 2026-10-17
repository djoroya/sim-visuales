#!/usr/bin/env python3
"""Comprobaciones del ejemplo de pastoreo. Escribe salida/verificacion.md.

Tres niveles, del mas exigente al mas cualitativo:

1. las fuerzas que aplica LAMMPS frente a las g(r) del TFM;
2. el caso de un perro y una oveja del modelo de Escobedo, Ibanez y Zuazua
   (2016), que tiene solucion asintotica analitica;
3. el ensayo completo: si el rebano llega al objetivo y si se mantiene junto.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(raiz / "datos"))
    ap.add_argument("--salida", default=str(raiz / "salida" / "verificacion.md"))
    ap.add_argument("--rmino", type=float, default=30.0)
    ap.add_argument("--sigma", type=float, default=50.0)
    ap.add_argument("--fm", type=float, default=5.0)
    ap.add_argument("--objetivo", type=float, default=20.0)
    args = ap.parse_args()
    d = Path(args.datos)

    # --- 1) fuerzas ---------------------------------------------------------
    filas1 = []
    for nombre, fichero, ana, como in (
        ("oveja-oveja `g_oo`", "fuerza_oo.txt",
         lambda r: 1.0 / r - 1.0 / args.rmino, "`pair_style table`"),
        ("perro sobre oveja `g_op`", "fuerza_op.txt",
         lambda r: args.fm * np.exp(-r ** 2 / args.sigma ** 2), "`fix addforce`"),
    ):
        datos = np.loadtxt(d / fichero)
        r, fx = datos[:, 0], datos[:, 1]
        err = np.abs(fx - ana(r))
        filas1.append(f"| {nombre} | {como} | {err.max():.2e} | "
                      f"{(err / np.abs(ana(r))).max():.2e} |")

    # --- 2) pareja con solucion analitica -----------------------------------
    par = np.loadtxt(d / "pareja_k0.txt")
    dfin, vdfin, vefin = par[-1, 3], par[-1, 4], par[-1, 5]
    r2, vref = math.sqrt(2.0), 1.0 / math.sqrt(2.0)
    filas2 = [
        f"| separacion perro-oveja | {dfin:.9f} | {r2:.9f} | {abs(dfin - r2):.1e} |",
        f"| velocidad del perro | {vdfin:.9f} | {vref:.9f} | {abs(vdfin - vref):.1e} |",
        f"| velocidad de la oveja | {vefin:.9f} | {vref:.9f} | {abs(vefin - vref):.1e} |",
    ]

    # --- 3) ensayo completo -------------------------------------------------
    med = np.loadtxt(d / "pastoreo-medidas.txt")
    t, dist, disp = med[:, 0], med[:, 1], med[:, 2]
    llega = np.where(dist < args.objetivo)[0]
    t_ll = t[llega[0]] if llega.size else None
    tras = t > (t_ll if t_ll is not None else t[-1])
    filas3 = [
        f"| distancia inicial al objetivo | {dist[0]:.1f} |",
        "| tiempo en llegar (distancia < "
        + f"{args.objetivo:g}) | " + (f"{t_ll:.0f}" if t_ll is not None else "no llega") + " |",
        f"| distancia media despues de llegar | {dist[tras].mean():.1f} |",
        f"| maxima despues de llegar | {dist[tras].max():.1f} |",
        f"| dispersion inicial (radio de giro al cuadrado) | {disp[0]:.0f} |",
        f"| dispersion media despues de llegar | {disp[tras].mean():.0f} |",
    ]

    texto = f"""# Comprobaciones

## 1. Las fuerzas son las del modelo

Se colocan dos individuos a distancia `r` y se compara la fuerza que aplica
LAMMPS con la formula del TFM, en 60 distancias entre 5 y 195.

| Interaccion | Como se implementa | Error absoluto max. | Error relativo max. |
|---|---|---:|---:|
{chr(10).join(filas1)}

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
{chr(10).join(filas2)}

Es el tipo de comprobacion que mas vale: un numero cerrado, sin ajustar nada,
y con el integrador y las fuerzas de LAMMPS por medio.

## 3. El ensayo completo

Aqui no hay valor de referencia que comparar, solo el comportamiento que
describe el TFM (figura 9): la heuristica lleva el rebano al objetivo pero no
lo deja quieto.

| Magnitud | Valor |
|---|---:|
{chr(10).join(filas3)}

Dos lecturas: la dispersion **baja** respecto a la inicial, es decir, el perro
agrupa al rebano mientras lo conduce; y despues de llegar la distancia al
objetivo no se queda en cero, sino que oscila. Eso es lo que decia el TFM, y
lo que motivaba alli pasarse al aprendizaje por refuerzo.
"""

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto)
    print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
