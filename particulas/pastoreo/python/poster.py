#!/usr/bin/env python3
"""Imagen de respaldo del visor: lee el .herd igual que el visor y dibuja un
fotograma con la misma estetica (perro azul con estela, ovejas grises,
objetivo marcado). Sirve de poster cuando no hay canvas o cuando el visitante
ha pedido menos movimiento.
"""

from __future__ import annotations

import argparse
import os
import struct
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parents[1] / "tmp" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

AZUL = "#14519b"
OVEJA = "#9aa8b8"
OVEJA_BORDE = "#7d8c9e"
LINEA = "#d8e0e9"
SUAVE = "#5b6b7b"


def lee_herd(ruta: Path):
    b = ruta.read_bytes()
    assert b[:5] == b"HERD1", "no es un fichero HERD1"
    npart, nfr, _ = struct.unpack_from("<IHH", b, 8)
    x0, y0, sx, sy = struct.unpack_from("<4f", b, 16)
    xt, yt = struct.unpack_from("<2f", b, 32)
    p = 40
    tipos = np.frombuffer(b, np.uint8, npart, p).copy()
    p += npart
    pos = np.empty((nfr, npart, 2))
    origen, tam = np.array([x0, y0]), np.array([sx, sy])
    for f in range(nfr):
        for c in range(2):
            alto = np.frombuffer(b, np.uint8, npart, p)
            bajo = np.frombuffer(b, np.uint8, npart, p + npart)
            p += 2 * npart
            pos[f, :, c] = origen[c] + (alto * 256.0 + bajo) * tam[c] / 65535.0
    return pos, tipos, origen, tam, np.array([xt, yt])


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--herd", default=str(raiz / "salida" / "pastoreo.herd"))
    ap.add_argument("--salida", default=str(raiz / "salida" / "pastoreo-poster.png"))
    ap.add_argument("--avance", type=float, default=0.55,
                    help="instante, de 0 a 1")
    ap.add_argument("--estela", type=int, default=90)
    ap.add_argument("--ancho", type=int, default=1000)
    ap.add_argument("--radio-oveja", type=float, default=7.0)
    ap.add_argument("--radio-perro", type=float, default=9.0)
    args = ap.parse_args()

    pos, tipos, origen, tam, obj = lee_herd(Path(args.herd))
    nfr = pos.shape[0]
    f = int(round(args.avance * (nfr - 1)))
    perro = int(np.argmax(tipos == 1))

    alto = int(args.ancho * tam[1] / tam[0])
    fig, ax = plt.subplots(figsize=(args.ancho / 100, alto / 100), dpi=100)
    ax.set_xlim(origen[0], origen[0] + tam[0])
    ax.set_ylim(origen[1], origen[1] + tam[1])
    ax.set_aspect("equal")
    ax.axis("off")
    fig.patch.set_alpha(0.0)

    # objetivo
    ax.add_patch(plt.Circle(obj, 26, fill=False, ls=(0, (4, 4)),
                            ec=LINEA, lw=1.5))
    ax.plot(*obj, "o", ms=3, color=SUAVE)

    # estela del perro
    desde = max(0, f - args.estela)
    ax.plot(pos[desde:f + 1, perro, 0], pos[desde:f + 1, perro, 1],
            color=AZUL, lw=2, alpha=0.22, solid_capstyle="round")

    # individuos
    for i in range(pos.shape[1]):
        x, y = pos[f, i]
        if tipos[i] == 1:
            ax.add_patch(plt.Circle((x, y), args.radio_perro, fc=AZUL,
                                    ec="white", lw=2, zorder=3))
        else:
            ax.add_patch(plt.Circle((x, y), args.radio_oveja, fc=OVEJA,
                                    ec=OVEJA_BORDE, lw=1, zorder=2))

    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destino, dpi=100, transparent=True)
    plt.close(fig)

    try:
        from PIL import Image
        img = Image.open(destino).convert("RGBA")
        img.quantize(colors=64, method=Image.FASTOCTREE).save(destino, optimize=True)
    except Exception:
        pass

    print(f"{destino}  fotograma {f} de {nfr}  "
          f"({destino.stat().st_size / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
