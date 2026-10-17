#!/usr/bin/env python3
"""Hoja de contacto de lo que va a dibujar el visor.

Lee el binario .nw con la misma reconstruccion que hace el visor (posicion
inicial a 16 bits mas incrementos) y pinta unos cuantos fotogramas con su
misma camara: ortografica, hilo horizontal y giro alrededor del eje. Sirve
para revisar la animacion sin navegador.
"""

from __future__ import annotations

import argparse
import math
import os
import struct
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parents[1] / "datos" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

PALETA = {0: "#aab8c6", 1: "#ccd6e0", 2: "#14519b",
          3: "#4a7fbf", 4: "#4a7fbf", 5: "#aab8c6"}


def lee_nw(ruta: Path):
    """La misma reconstruccion que src/nanohilo.js."""
    b = ruta.read_bytes()
    assert b[:6] == b"NWIRE2", "no es un fichero NWIRE2"
    nat, nfr, _ver = struct.unpack_from("<IHH", b, 8)
    x0, y0, z0, paso = struct.unpack_from("<4f", b, 16)
    origen = np.array([x0, y0, z0])
    p = 40
    eps = np.frombuffer(b, "<f4", nfr, p).copy()
    p += 4 * nfr

    q = np.empty((nat, 3), dtype=np.int32)
    for c in range(3):
        alto = np.frombuffer(b, np.uint8, nat, p)
        bajo = np.frombuffer(b, np.uint8, nat, p + nat)
        q[:, c] = alto.astype(np.int32) * 256 + bajo
        p += 2 * nat

    pos = np.empty((nfr, nat, 3))
    pos[0] = origen + q * paso
    for f in range(1, nfr):
        for c in range(3):
            q[:, c] += np.frombuffer(b, np.int8, nat, p)
            p += nat
        pos[f] = origen + q * paso

    tipos = np.frombuffer(b, np.uint8, nfr * nat, p).reshape(nfr, nat)
    return pos, tipos, eps


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--nw", default=str(raiz / "salida" / "nanohilo-cu.nw"))
    ap.add_argument("--salida", default=str(raiz / "tmp" / "vista-previa.png"))
    ap.add_argument("--filas", type=int, default=6)
    ap.add_argument("--giro", type=float, default=0.08,
                    help="vueltas por segundo, como en el visor")
    ap.add_argument("--duracion", type=float, default=9.0)
    args = ap.parse_args()

    pos, tipos, eps = lee_nw(Path(args.nw))
    nfr, nat, _ = pos.shape
    print(f"{nfr} fotogramas, {nat} atomos, eps de {eps[0]:.3f} a {eps[-1]:.3f}")

    # encuadre comun, igual que el visor
    mn = pos.reshape(-1, 3).min(axis=0)
    mx = pos.reshape(-1, 3).max(axis=0)
    tam = mx - mn
    vista_x = tam[0] * 1.06
    semi_y = math.hypot(tam[1], tam[2]) * 1.06 / 2

    idx = np.linspace(0, nfr - 1, args.filas).round().astype(int)
    fig, ejes = plt.subplots(args.filas, 1, figsize=(11, 1.05 * args.filas * 1.6))
    for eje, f in zip(np.atleast_1d(ejes), idx):
        # giro: el mismo angulo que tendria el visor en ese instante
        th = 2 * math.pi * args.giro * (f / (nfr - 1)) * args.duracion
        y = pos[f, :, 1]
        z = pos[f, :, 2]
        prof = y * math.cos(th) - z * math.sin(th)
        v = y * math.sin(th) + z * math.cos(th)
        u = pos[f, :, 0]

        orden = np.argsort(prof)
        luz = (prof - prof.min()) / max(np.ptp(prof), 1e-9)
        col = np.array([matplotlib.colors.to_rgb(PALETA.get(int(t), "#aab8c6"))
                        for t in tipos[f]])
        col = np.clip(col * (0.62 + 0.38 * luz)[:, None], 0, 1)

        eje.scatter(u[orden], v[orden], s=9, c=col[orden], linewidths=0)
        eje.set_xlim(-vista_x / 2, vista_x / 2)
        eje.set_ylim(-semi_y, semi_y)
        eje.set_aspect("equal")
        eje.axis("off")
        eje.text(-vista_x / 2, semi_y * 0.75, f"  {f}   ε = {eps[f] * 100:.0f} %",
                 fontsize=8, color="#5b6b7b", va="top")

    fig.patch.set_facecolor("white")
    fig.tight_layout(h_pad=0.2)
    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destino, dpi=110, facecolor="white")
    print(f"vista previa en {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
