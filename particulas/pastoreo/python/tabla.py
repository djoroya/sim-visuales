#!/usr/bin/env python3
"""Tabla de la fuerza oveja-oveja del TFM para pair_style table de LAMMPS.

TFM, ec. (5.4):   g_oo(r) = -(1/r - 1/rmin_o)

La aceleracion sobre la oveja i es  g_oo(r) (u_k - u_i)/r  (Cuadro 2), es
decir: g_oo > 0 atrae hacia la otra oveja y g_oo < 0 la repele. LAMMPS usa el
convenio contrario (F > 0 = repulsiva), asi que la tabla lleva

    F(r) = -g_oo(r) = 1/r - 1/rmin_o        E(r) = -ln(r) + r/rmin_o + C

con C elegido para que E(rc) = 0. La fuerza se escala por 1/(No-1), como en
el codigo original de Jesus (DeustoTech/GuidanceByRepulsion), para que el
rebano no se comporte distinto solo por cambiar el numero de ovejas.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rmin", type=float, default=30.0, help="rmin_o del TFM")
    ap.add_argument("--rc", type=float, default=200.0, help="radio de corte")
    ap.add_argument("--r0", type=float, default=0.4, help="primer punto de la tabla")
    ap.add_argument("--n", type=int, default=4000)
    ap.add_argument("--escala", type=float, default=1.0, help="1/(No-1)")
    ap.add_argument("--salida", default="datos/oveja-oveja.table")
    args = ap.parse_args()

    k = args.escala
    # E(rc) = 0  =>  C = ln(rc) - rc/rmin
    C = math.log(args.rc) - args.rc / args.rmin

    lineas = [
        "# Fuerza oveja-oveja del TFM de J. Oroya (2020), ec. (5.4):",
        f"#   g_oo(r) = -(1/r - 1/{args.rmin:g});  F_lammps = -g_oo, escalada por {k:g}",
        "",
        "OVEJA_OVEJA",
        f"N {args.n} R {args.r0:g} {args.rc:g}",
        "",
    ]
    for i in range(args.n):
        r = args.r0 + (args.rc - args.r0) * i / (args.n - 1)
        e = k * (-math.log(r) + r / args.rmin + C)
        f = k * (1.0 / r - 1.0 / args.rmin)
        lineas.append(f"{i + 1} {r:.10g} {e:.10g} {f:.10g}")

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text("\n".join(lineas) + "\n")
    print(f"{destino}  ({args.n} puntos, r de {args.r0} a {args.rc}, "
          f"equilibrio en r = {args.rmin})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
