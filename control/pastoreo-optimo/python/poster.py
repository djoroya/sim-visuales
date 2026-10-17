#!/usr/bin/env python3
"""Imagen de respaldo del visor: lee el `.herd2` igual que el visor y dibuja
los dos paneles (heuristica y optimo) en el mismo instante, con las curvas de
distancia, dispersion y esfuerzo debajo. Sirve de poster cuando no hay canvas
y de figura para el articulo.
"""

from __future__ import annotations

import argparse
import json
import os
import struct
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR",
                      str(Path(__file__).resolve().parents[1] / "tmp" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OVEJA = "#9aa8b8"
OVEJA_BORDE = "#7d8c9e"
LINEA = "#d8e0e9"
SUAVE = "#5b6b7b"
PERROS = ["#14519b", "#c8791a", "#2f7d62"]
RAIZ = Path(__file__).resolve().parents[1]


def lee_herd2(ruta: Path):
    b = ruta.read_bytes()
    assert b[:5] == b"HERD2", "no es un fichero HERD2"
    npart, nfr, nesc, _ = struct.unpack_from("<IHBB", b, 8)
    x0, y0, sx, sy = struct.unpack_from("<4f", b, 16)
    xt, yt = struct.unpack_from("<2f", b, 32)
    p = 40
    tipos = np.frombuffer(b, np.uint8, npart, p).copy()
    p += npart
    origen, tam = np.array([x0, y0]), np.array([sx, sy])
    escenas = []
    for _ in range(nesc):
        pos = np.empty((nfr, npart, 2))
        for f in range(nfr):
            for c in range(2):
                alto = np.frombuffer(b, np.uint8, npart, p)
                bajo = np.frombuffer(b, np.uint8, npart, p + npart)
                p += 2 * npart
                pos[f, :, c] = origen[c] + (alto * 256.0 + bajo) * tam[c] / 65535.0
        escenas.append(pos)
    return escenas, tipos, origen, tam, np.array([xt, yt])


def panel(ax, pos, tipos, objetivo, origen, tam, f, estela, titulo, r_oveja, r_perro):
    ax.set_xlim(origen[0], origen[0] + tam[0])
    ax.set_ylim(origen[1], origen[1] + tam[1])
    ax.set_aspect("equal")
    for lado in ("top", "right", "bottom", "left"):
        ax.spines[lado].set_color("#e7ecf1")
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_title(titulo, fontsize=10, color=SUAVE, pad=6)

    ax.add_patch(plt.Circle(objetivo, 25, fill=False, ls=(0, (4, 4)),
                            ec=LINEA, lw=1.4))
    ax.plot(*objetivo, "o", ms=3.5, color=SUAVE)

    perros = np.flatnonzero(tipos == 1)
    for k, ip in enumerate(perros):
        desde = max(0, f - estela)
        ax.plot(pos[desde:f + 1, ip, 0], pos[desde:f + 1, ip, 1],
                color=PERROS[k % len(PERROS)], lw=1.3, alpha=0.35)
    ovejas = np.flatnonzero(tipos == 0)
    ax.scatter(pos[f, ovejas, 0], pos[f, ovejas, 1], s=r_oveja ** 2 * 0.9,
               c=OVEJA, edgecolors=OVEJA_BORDE, linewidths=0.6, zorder=3)
    for k, ip in enumerate(perros):
        ax.plot(pos[f, ip, 0], pos[f, ip, 1], "o", ms=r_perro,
                color=PERROS[k % len(PERROS)], mec="white", mew=1.6, zorder=4)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--herd", default=str(RAIZ / "salida" / "pastoreo-optimo.herd2"))
    ap.add_argument("--meta", default=str(RAIZ / "salida" / "pastoreo-optimo-meta.json"))
    ap.add_argument("--salida", default=str(RAIZ / "salida" / "pastoreo-optimo-poster.png"))
    ap.add_argument("--avance", type=float, default=0.5)
    ap.add_argument("--estela", type=int, default=60)
    ap.add_argument("--ancho", type=int, default=1200)
    ap.add_argument("--radio-oveja", type=float, default=4.0)
    ap.add_argument("--radio-perro", type=float, default=6.0)
    args = ap.parse_args()

    escenas, tipos, origen, tam, objetivo = lee_herd2(Path(args.herd))
    meta = json.loads(Path(args.meta).read_text())
    nfr = escenas[0].shape[0]
    f = int(round(args.avance * (nfr - 1)))
    t = np.asarray(meta["t"])

    dpi = 110
    ancho = args.ancho / dpi
    fig = plt.figure(figsize=(ancho, ancho * 0.58), dpi=dpi, facecolor="white")
    rejilla = fig.add_gridspec(2, 3, height_ratios=[2.1, 1], hspace=0.30,
                               wspace=0.22, left=0.04, right=0.97,
                               top=0.92, bottom=0.10)

    for e, pos in enumerate(escenas[:2]):
        ax = fig.add_subplot(rejilla[0, e])
        panel(ax, pos, tipos, objetivo, origen, tam, f, args.estela,
              meta["escenas"][e]["titulo"], args.radio_oveja, args.radio_perro)

    # tercer hueco de la fila de arriba: el marcador
    ax = fig.add_subplot(rejilla[0, 2])
    ax.axis("off")
    r = [s["resumen"] for s in meta["escenas"]]
    lineas = [("", "heurística", "óptimo"),
              ("distancia", f"{r[0]['dist_final']:.0f}", f"{r[1]['dist_final']:.0f}"),
              ("dispersión", f"{r[0]['disp_final']:.0f}", f"{r[1]['disp_final']:.0f}"),
              ("esfuerzo", f"{r[0]['esfuerzo_int'] / 1000:.0f} k",
               f"{r[1]['esfuerzo_int'] / 1000:.0f} k"),
              ("coste J", f"{r[0]['coste']['J']:.3f}", f"{r[1]['coste']['J']:.3f}")]
    for i, (a, b, c) in enumerate(lineas):
        peso = "bold" if i == 0 else "normal"
        y = 0.80 - i * 0.13
        ax.text(0.0, y, a, fontsize=9.5, color=SUAVE, weight=peso)
        ax.text(0.68, y, b, fontsize=9.5, color=SUAVE, ha="right", weight=peso)
        ax.text(1.0, y, c, fontsize=9.5, color="#1d2a36", ha="right", weight=peso)
    ax.text(0.0, 0.93, f"al final del horizonte (t = {t[-1]:.0f})",
            fontsize=8.5, color=SUAVE)

    curvas = [("distancia al objetivo", "distancia"),
              ("dispersión (radio de giro²)", "dispersion"),
              ("esfuerzo acumulado", "esfuerzo")]
    for i, (titulo, clave) in enumerate(curvas):
        ax = fig.add_subplot(rejilla[1, i])
        for e, s in enumerate(meta["escenas"][:2]):
            ax.plot(t, s[clave], lw=1.6, color=PERROS[0] if e else SUAVE,
                    ls="-" if e else (0, (3, 2)),
                    label="óptimo" if e else "heurística")
        ax.set_title(titulo, fontsize=9, color=SUAVE, pad=4)
        ax.tick_params(labelsize=8, colors=SUAVE)
        for lado in ("top", "right"):
            ax.spines[lado].set_visible(False)
        for lado in ("bottom", "left"):
            ax.spines[lado].set_color("#d8e0e9")
        ax.set_xlabel("t", fontsize=8, color=SUAVE)
        if i == 0:
            ax.legend(fontsize=8, frameon=False, labelcolor=SUAVE)

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destino, dpi=dpi)
    print(f"{destino}  ({destino.stat().st_size / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
