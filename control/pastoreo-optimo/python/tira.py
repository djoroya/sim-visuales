#!/usr/bin/env python3
"""Tira de fotogramas de una escena del `.herd2`, para mirar la animacion sin
navegador: seis instantes repartidos por el horizonte, en fila.

    python/tira.py --herd salida/pastoreo-espectacular.herd2 --escena 1
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR",
                      str(Path(__file__).resolve().parents[1] / "tmp" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from poster import LINEA, OVEJA, OVEJA_BORDE, PERROS, SUAVE, lee_herd2

RAIZ = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--herd", default=str(RAIZ / "salida" / "pastoreo-optimo.herd2"))
    ap.add_argument("--meta", default=str(RAIZ / "salida" / "pastoreo-optimo-meta.json"))
    ap.add_argument("--salida", default=str(RAIZ / "tmp" / "tira.png"))
    ap.add_argument("--escena", type=int, default=1)
    ap.add_argument("--cuadros", type=int, default=6)
    ap.add_argument("--estela", type=int, default=18)
    ap.add_argument("--radio-oveja", type=float, default=2.6)
    args = ap.parse_args()

    escenas, tipos, origen, tam, objetivo = lee_herd2(Path(args.herd))
    meta = json.loads(Path(args.meta).read_text())
    pos = escenas[args.escena]
    nfr = pos.shape[0]
    idx = np.linspace(0, nfr - 1, args.cuadros).round().astype(int)
    t = np.asarray(meta["t"])
    s = meta["escenas"][args.escena]

    fig, ejes = plt.subplots(1, args.cuadros, figsize=(2.6 * args.cuadros, 3.1),
                             dpi=110, facecolor="white")
    perros = np.flatnonzero(tipos == 1)
    ovejas = np.flatnonzero(tipos == 0)
    for ax, f in zip(ejes, idx):
        ax.set_xlim(origen[0], origen[0] + tam[0])
        ax.set_ylim(origen[1], origen[1] + tam[1])
        ax.set_aspect("equal")
        ax.set_xticks([])
        ax.set_yticks([])
        for lado in ("top", "right", "bottom", "left"):
            ax.spines[lado].set_color("#e7ecf1")
        ax.add_patch(plt.Circle(objetivo, 25, fill=False, ls=(0, (4, 4)),
                                ec=LINEA, lw=1.2))
        for k, ip in enumerate(perros):
            desde = max(0, f - args.estela)
            ax.plot(pos[desde:f + 1, ip, 0], pos[desde:f + 1, ip, 1],
                    color=PERROS[k % len(PERROS)], lw=1.1, alpha=0.35)
        ax.scatter(pos[f, ovejas, 0], pos[f, ovejas, 1],
                   s=args.radio_oveja ** 2 * 0.9, c=OVEJA,
                   edgecolors=OVEJA_BORDE, linewidths=0.4, zorder=3)
        for k, ip in enumerate(perros):
            ax.plot(pos[f, ip, 0], pos[f, ip, 1], "o", ms=5.5,
                    color=PERROS[k % len(PERROS)], mec="white", mew=1.2, zorder=4)
        ax.set_title(f"t = {t[f]:.0f}   d {s['distancia'][f]:.0f}"
                     f"   disp {s['dispersion'][f]:.0f}",
                     fontsize=8, color=SUAVE, pad=4)
    fig.suptitle(s["titulo"], fontsize=10, color=SUAVE, y=0.99)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    fig.savefig(args.salida)
    print(args.salida)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
