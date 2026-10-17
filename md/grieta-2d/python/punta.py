#!/usr/bin/env python3
"""Localiza la punta de la grieta en cada volcado y mide su velocidad.

La grieta es una banda horizontal sin atomos. Para cada fotograma se mira la
franja central, se hace un histograma en x y se avanza desde la izquierda
mientras las celdas esten vacias: donde deja de estarlo esta la punta. Es mas
robusto que buscarla dentro de LAMMPS, donde hay que distinguirla de las
superficies libres del contorno.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np


def lee_volcados(ruta: Path):
    texto = ruta.read_text()
    bloques = texto.split("ITEM: TIMESTEP\n")[1:]
    for b in bloques:
        lineas = b.splitlines()
        paso = int(lineas[0])
        i = next(k for k, l in enumerate(lineas) if l.startswith("ITEM: ATOMS"))
        datos = np.array([l.split() for l in lineas[i + 1:] if l.strip()],
                         dtype=np.float64)
        yield paso, datos[np.argsort(datos[:, 0])]


def punta(xy, ymed, media_banda=0.75, celda=1.2, vacio=0.25):
    """x de la punta: fin del tramo vacio que empieza en el borde izquierdo."""
    banda = np.abs(xy[:, 1] - ymed) < media_banda
    x = xy[banda, 0]
    if x.size == 0:
        return np.nan
    xmin, xmax = xy[:, 0].min(), xy[:, 0].max()
    nb = max(8, int((xmax - xmin) / celda))
    hist, bordes = np.histogram(x, bins=nb, range=(xmin, xmax))
    lleno = hist.max() if hist.max() else 1
    # se avanza mientras la celda este practicamente vacia
    i = 0
    while i < nb and hist[i] < vacio * lleno:
        i += 1
    return float(bordes[i])


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--volcado", default=str(raiz / "datos" / "grieta.lammpstrj"))
    ap.add_argument("--salida", default=str(raiz / "datos" / "punta.txt"))
    ap.add_argument("--dt", type=float, default=0.004)
    ap.add_argument("--cR", type=float, default=4.8402)
    args = ap.parse_args()

    filas = []
    ymed = None
    for paso, datos in lee_volcados(Path(args.volcado)):
        xy = datos[:, 1:3]
        if ymed is None:
            ymed = 0.5 * (xy[:, 1].min() + xy[:, 1].max())
        filas.append((paso * args.dt, punta(xy, ymed)))

    t, x = np.array(filas).T
    Path(args.salida).write_text(
        "# t x_punta\n" + "\n".join(f"{a:.4f} {b:.4f}" for a, b in filas) + "\n")

    # velocidad en el tramo de propagacion franca: entre el 20 % y el 80 % del
    # recorrido total, para no coger ni el arranque ni el frenazo del final
    rec = x - x[0]
    total = rec.max()
    m = (rec > 0.2 * total) & (rec < 0.8 * total)
    v = np.polyfit(t[m], x[m], 1)[0] if m.sum() > 3 else float("nan")
    print(f"punta de {x[0]:.1f} a {x[-1]:.1f} en t = {t[-1]:.0f}")
    print(f"velocidad en el tramo franco: {v:.3f}  "
          f"= {v / args.cR:.3f} c_R   (c_R = {args.cR})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
