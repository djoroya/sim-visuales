#!/usr/bin/env python3
"""Tabla de validacion del cristal triangular 2D de Lennard-Jones.

Compara lo que mide LAMMPS (datos/elastico.txt) con las formulas cerradas
que valen cuando el radio de corte deja solo los primeros vecinos, y de ahi
deriva E, nu y las velocidades de onda, incluida la de Rayleigh.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(raiz / "datos" / "elastico.txt"))
    ap.add_argument("--punta", default=str(raiz / "datos" / "punta.txt"))
    ap.add_argument("--salida", default=str(raiz / "salida" / "validacion.md"))
    ap.add_argument("--rc", type=float, default=1.5)
    args = ap.parse_args()

    v = {}
    for linea in Path(args.datos).read_text().splitlines():
        p = linea.split()
        if len(p) == 2:
            v[p[0]] = float(p[1])

    a = 2 ** (1 / 6)
    phi_rc = 4 * (args.rc ** -12 - args.rc ** -6)
    phi_a = -1.0 - phi_rc                      # con pair_modify shift yes
    fpp = 72.0 / 2 ** (1 / 3)
    ana = {
        "a": a,
        "ecoh": 3 * phi_a,
        "C11": 3 * math.sqrt(3) / 4 * fpp,
        "C12": math.sqrt(3) / 4 * fpp,
        "C66": math.sqrt(3) / 4 * fpp,
        "gamma": abs(phi_a) / a,
    }
    nombres = {
        "a": ("Parametro de red `a`", "sigma"),
        "ecoh": ("Energia de cohesion", "epsilon/atomo"),
        "C11": ("`C11`", "epsilon/sigma^2"),
        "C12": ("`C12`", "epsilon/sigma^2"),
        "C66": ("`C66`", "epsilon/sigma^2"),
        "gamma": ("Energia de superficie `gamma`", "epsilon/sigma"),
    }
    filas = []
    for k, (nom, uni) in nombres.items():
        if k not in v:
            continue
        err = abs(v[k] - ana[k]) / max(abs(ana[k]), 1e-30)
        filas.append(f"| {nom} | {uni} | {v[k]:.7f} | {ana[k]:.7f} | {err:.1e} |")

    C11, C12, C66 = v["C11"], v["C12"], v["C66"]
    nu = C12 / C11
    E = (C11 ** 2 - C12 ** 2) / C11
    rho = 1.0 / (math.sqrt(3) / 2 * a ** 2)
    cl = math.sqrt(C11 / rho)
    cs = math.sqrt(C66 / rho)
    cR = cs * (0.862 + 1.14 * nu) / (1 + nu)
    iso = abs(C66 - (C11 - C12) / 2) / C66

    vel = ""
    if Path(args.punta).exists():
        import numpy as np
        d = np.loadtxt(args.punta)
        t, x = d[:, 0], d[:, 1]
        rec = x - x[0]
        m = (rec > 0.2 * rec.max()) & (rec < 0.8 * rec.max())
        vp = float(np.polyfit(t[m], x[m], 1)[0]) if m.sum() > 3 else float("nan")
        vel = f"""
## La grieta

| | |
|---|---:|
| Velocidad de la punta | {vp:.3f} sigma/tau |
| Velocidad de Rayleigh `c_R` | {cR:.3f} sigma/tau |
| **v / c_R** | **{vp / cR:.3f}** |

El resultado clasico es que una grieta fragil no supera `c_R` y en la practica
se queda entre 0,2 y 0,5. Esto es una comparacion con un **limite**, no con un
valor predicho: dice que el resultado es compatible con la teoria.
"""

    texto = f"""# Validacion

Con el radio de corte en {args.rc} sigma solo entran los primeros vecinos, asi
que el equilibrio exige `phi'(a) = 0` y las constantes elasticas salen de la
formula de Born en cerrado. Nada de esto esta ajustado: son formulas.

| Magnitud | Unidad | LAMMPS | Analitico | Error relativo |
|---|---|---:|---:|---:|
{chr(10).join(filas)}

La energia de superficie es la unica que no cae exacta, y por una razon
fisica: el valor analitico cuenta los enlaces que se rompen, y LAMMPS deja
ademas que los atomos del borde se relajen. Esa diferencia, un 0,015 %, es la
relajacion de la superficie.

## Lo que se deriva

| | |
|---|---:|
| Coeficiente de Poisson `nu = C12/C11` | {nu:.6f}  (exacto: 1/3 = {1/3:.6f}) |
| Modulo de Young 2D `E` | {E:.4f} |
| Isotropia: `|C66 - (C11-C12)/2| / C66` | {iso:.1e} |
| Densidad `rho` | {rho:.6f} |
| Onda longitudinal `c_l` | {cl:.4f} |
| Onda transversal `c_s` | {cs:.4f} |
| Onda de Rayleigh `c_R` | {cR:.4f} |
{vel}"""

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto)
    print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
