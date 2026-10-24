#!/usr/bin/env python3
"""Bucle de la portada: tres perros con MPC meten 80 ovejas en un corral
(control/pastoreo-mpc, escenario «arriba»: la puerta está en el lado de arriba,
así que tienen que rodear el corral para meterlas).

La partida sale del mismo motor que el visor del artículo, en Node y con semilla
fija:

    cd ../../control/pastoreo-mpc && node web/prueba/portada.mjs arriba 3 tmp/portada-arriba.json

Mismo estilo que pastoreo.py (perros ámbar con halo y estela, rebaño azulado,
fondo azul marino) más las vallas del corral y la puerta discontinua. La partida
entera pasa en 5 s y el rebaño se queda un segundo dentro; el vídeo se ve una vez (sin
fundido final). Toda la acción, en el 40 % derecho de la banda.
"""

from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parent / "tmp" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

import comun

MPC = comun.SIM / "control" / "pastoreo-mpc"
NOMBRE = "corral"
OVEJA = "#9fb4cc"
OVEJA_BORDE = "#c9d6e6"
VALLA = "#c9d6e6"
RADIO_OVEJA = 2.4            # unidades del modelo (80 ovejas en un campo de 580 × 420)
RADIO_PERRO = 5.5
ESTELA = 160                 # subfotogramas de datos que dura la estela (~40 s de partida)


def interpola(pos: np.ndarray, t: float) -> np.ndarray:
    i = min(max(int(np.floor(t)), 0), pos.shape[0] - 2)
    a = t - i
    return pos[i] * (1 - a) + pos[i + 1] * a


def dibuja(tarea):
    destino, X, Y, corral, t, vista = tarea
    x0, x1, y0, y1 = vista
    dpi = 100
    fig = plt.figure(figsize=(comun.ANCHO / dpi, comun.ALTO / dpi), dpi=dpi)
    fig.patch.set_facecolor(comun.NAVY)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_facecolor(comun.NAVY)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.axis("off")
    pt_por_u = (comun.ANCHO / dpi * 72.0) / (x1 - x0)

    for xa, ya, xb, yb in corral["seg"]:
        ax.plot([xa, xb], [ya, yb], color=VALLA, lw=4.2, alpha=0.55, solid_capstyle="round", zorder=2)
    xa, ya, xb, yb = corral["puerta"]
    ax.plot([xa, xb], [ya, yb], color=comun.AZUL_CLARO, lw=2.4, ls=(0, (4, 4)), alpha=0.9, zorder=2)

    pasos = np.linspace(max(0.0, t - ESTELA), t, 60)
    for ip in range(Y.shape[1]):
        cam = np.array([interpola(Y, s)[ip] for s in pasos])
        for k in range(len(cam) - 1):
            ax.plot(cam[k:k + 2, 0], cam[k:k + 2, 1], color=comun.WARM, lw=2.6,
                    alpha=0.55 * (k + 1) / len(cam), solid_capstyle="butt")

    p = interpola(X, t)
    ax.scatter(p[:, 0], p[:, 1], s=(2 * RADIO_OVEJA * pt_por_u) ** 2, c=OVEJA,
               edgecolors=OVEJA_BORDE, linewidths=0.8, zorder=3)
    q = interpola(Y, t)
    for ip in range(Y.shape[1]):
        for r, a in ((3.0, 0.10), (2.0, 0.18)):
            ax.add_patch(plt.Circle(q[ip], RADIO_PERRO * r, color=comun.WARM, alpha=a, lw=0, zorder=4))
        ax.add_patch(plt.Circle(q[ip], RADIO_PERRO, color=comun.WARM, ec="#fde68a", lw=2.0, zorder=5))
    fig.savefig(destino, dpi=dpi, facecolor=comun.NAVY)
    plt.close(fig)
    return destino


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--partida", default=str(MPC / "tmp" / "portada-arriba.json"))
    ap.add_argument("--segundos", type=float, default=6.0)
    ap.add_argument("--partida-seg", type=float, default=5.0, help="segundos que dura la partida en el bucle")
    ap.add_argument("--fundido", type=int, default=0, help="0: una sola pasada (el carrusel cambia al acabar el vídeo)")
    ap.add_argument("--procesos", type=int, default=4)
    args = ap.parse_args()

    d = json.loads(Path(args.partida).read_text())
    F = len(d["fotos"])
    X = np.array([f["X"] for f in d["fotos"]]).reshape(F, -1, 2)
    Y = np.array([f["Y"] for f in d["fotos"]]).reshape(F, -1, 2)
    corral = d["corral"]

    todo = np.concatenate([X.reshape(-1, 2), Y.reshape(-1, 2), np.array(corral["seg"]).reshape(-1, 2)])
    mn, mx = todo.min(0) - 14, todo.max(0) + 14
    W, H = comun.ANCHO, comun.ALTO
    k = min(0.40 * W / (mx[0] - mn[0]), 0.88 * H / (mx[1] - mn[1]))
    ancho_u, alto_u = W / k, H / k
    cx = 0.5 * (mn[0] + mx[0]) - (0.78 - 0.5) * ancho_u
    cy = 0.5 * (mn[1] + mx[1])
    vista = (cx - ancho_u / 2, cx + ancho_u / 2, cy - alto_u / 2, cy + alto_u / 2)
    print(f"{F} subfotogramas; escala {k:.2f} px/unidad")

    n = int(round(args.segundos * comun.FPS))
    n_p = int(round(args.partida_seg * comun.FPS))
    ts = np.r_[np.linspace(0, F - 1, n_p), np.full(n - n_p, F - 1.0)]

    crudo = comun.TMP / NOMBRE / "crudo"
    crudo.mkdir(parents=True, exist_ok=True)
    for v in crudo.glob("*.png"):
        v.unlink()
    tareas = [(str(crudo / f"f{i:04d}.png"), X, Y, corral, t, vista) for i, t in enumerate(ts)]
    with ProcessPoolExecutor(max_workers=args.procesos) as ex:
        list(ex.map(dibuja, tareas, chunksize=4))

    pesos = comun.poster(crudo / "f0000.png", f"{NOMBRE}-poster")
    bucle = comun.TMP / NOMBRE / "bucle"
    comun.cierra_bucle(crudo, bucle, args.fundido)
    pesos |= comun.codifica(bucle, NOMBRE, crf_webm={2400: 40, 1200: 38}, crf_mp4={2400: 28, 1200: 26})
    comun.informe(pesos)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
