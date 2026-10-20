#!/usr/bin/env python3
"""Bucle de la portada: tres perros llevan 200 ovejas al objetivo (control
optimo, la escena «optimo» de control/pastoreo-optimo).

Lee el mismo `.herd2` que el visor del tutorial, asi que lo que se ve es la
trayectoria optima de verdad, no una animacion hecha a mano.

Que tramo y por que: el optimo resuelve casi todo en los primeros ~110 s del
horizonte (el rebano llega y despues solo se mantiene), asi que el bucle es
ese tramo a velocidad real (interpolado entre fotogramas exportados para que
el movimiento sea suave a 24 fps), un rato con el rebano ya en el objetivo y
un fundido al principio. No hay forma de que un traslado de A a B cierre sin
volver; el fundido lo hace sin corte, con el rebano ya quieto.

Encuadre: camara fija, con toda la accion (rebano, perros y estelas) en el
36 % derecho de la banda y el objetivo arriba a la derecha. A la izquierda solo
queda fondo azul marino, que es donde va el texto.
"""

from __future__ import annotations

import argparse
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parent / "tmp" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

import comun

PASTOREO = comun.SIM / "control" / "pastoreo-optimo"
sys.path.insert(0, str(PASTOREO / "python"))
from poster import lee_herd2  # noqa: E402

NOMBRE = "pastoreo"
OVEJA = "#9fb4cc"            # gris azulado claro: el rebano se lee como masa
OVEJA_BORDE = "#c9d6e6"
RADIO_OVEJA = 1.35           # unidades del modelo
RADIO_PERRO = 4.2
ESTELA = 26                  # fotogramas de datos que dura la estela


def interpola(pos: np.ndarray, t: float) -> np.ndarray:
    """Posiciones en un instante fraccionario del indice de fotograma."""
    i = int(np.floor(t))
    i = min(max(i, 0), pos.shape[0] - 2)
    a = t - i
    return pos[i] * (1 - a) + pos[i + 1] * a


def dibuja(tarea):
    destino, pos, tipos, objetivo, t, vista = tarea
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

    # objetivo: el anillo discontinuo del visor, en azul claro y discreto
    ax.add_patch(plt.Circle(objetivo, 25, fill=False, ls=(0, (5, 5)),
                            ec=comun.AZUL_CLARO, lw=2.2, alpha=0.75))
    ax.add_patch(plt.Circle(objetivo, 1.8, color=comun.AZUL_CLARO, alpha=0.9))

    perros = np.flatnonzero(tipos == 1)
    ovejas = np.flatnonzero(tipos == 0)
    p = interpola(pos, t)

    # estelas de los perros: segmentos con opacidad que se apaga hacia atras
    pasos = np.linspace(max(0.0, t - ESTELA), t, 60)
    for ip in perros:
        cam = np.array([interpola(pos, s)[ip] for s in pasos])
        for k in range(len(cam) - 1):
            a = 0.55 * (k + 1) / len(cam)
            ax.plot(cam[k:k + 2, 0], cam[k:k + 2, 1], color=comun.WARM,
                    lw=2.6, alpha=a, solid_capstyle="butt")

    ax.scatter(p[ovejas, 0], p[ovejas, 1], s=(2 * RADIO_OVEJA * pt_por_u) ** 2,
               c=OVEJA, edgecolors=OVEJA_BORDE, linewidths=0.8, zorder=3)
    for ip in perros:
        # halo y perro: el unico acento calido de la escena
        for r, a in ((3.0, 0.10), (2.0, 0.18)):
            ax.add_patch(plt.Circle(p[ip], RADIO_PERRO * r, color=comun.WARM,
                                    alpha=a, lw=0, zorder=4))
        ax.add_patch(plt.Circle(p[ip], RADIO_PERRO, color=comun.WARM,
                                ec="#fde68a", lw=2.0, zorder=5))
    fig.savefig(destino, dpi=dpi, facecolor=comun.NAVY)
    plt.close(fig)
    return destino


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--herd", default=str(comun.WEB / "public" / "sims" /
                                          "pastoreo-optimo" / "pastoreo-optimo.herd2"))
    ap.add_argument("--escena", type=int, default=1, help="1 = control optimo")
    ap.add_argument("--hasta", type=float, default=44.0,
                    help="fotograma de datos donde acaba el traslado")
    ap.add_argument("--reposo", type=float, default=70.0,
                    help="fotograma de datos al final del rato en el objetivo")
    ap.add_argument("--segundos", type=float, default=6.0)
    ap.add_argument("--traslado", type=float, default=4.6,
                    help="segundos que dura el traslado dentro del bucle")
    ap.add_argument("--fundido", type=int, default=18)
    ap.add_argument("--procesos", type=int, default=4)
    ap.add_argument("--solo-poster", action="store_true")
    args = ap.parse_args()

    escenas, tipos, _, _, objetivo = lee_herd2(Path(args.herd))
    pos = escenas[args.escena].copy()
    # Reflejo vertical: el modelo es isotropo, asi que la trayectoria reflejada es
    # igual de optima. Sin reflejar, el rebano acaba abajo a la derecha, justo
    # donde va la etiqueta de la diapositiva; reflejado, el objetivo queda arriba
    # a la derecha y los perros arrancan abajo, lejos del titular.
    pos[..., 1] *= -1
    objetivo = objetivo * np.array([1.0, -1.0])

    # caja de toda la accion que sale en el bucle, con margen para los discos
    tramo = pos[: int(np.ceil(args.reposo)) + 1].reshape(-1, 2)
    mn = np.minimum(tramo.min(0), objetivo - 25) - 12
    mx = np.maximum(tramo.max(0), objetivo + 25) + 12
    # escala: la caja cabe en el 36 % derecho
    W, H = comun.ANCHO, comun.ALTO
    # (solo el 78 % del alto: en ventanas muy anchas la banda recorta arriba y abajo)
    k = min(0.36 * W / (mx[0] - mn[0]), 0.78 * H / (mx[1] - mn[1]))
    ancho_u, alto_u = W / k, H / k
    # se centra la caja en el 78 % del ancho: el borde izquierdo queda al 60 %, lejos del final del titular y a media altura
    cx = 0.5 * (mn[0] + mx[0]) - (0.78 - 0.5) * ancho_u
    cy = 0.5 * (mn[1] + mx[1])
    vista = (cx - ancho_u / 2, cx + ancho_u / 2, cy - alto_u / 2, cy + alto_u / 2)
    print(f"escala {k:.2f} px/unidad; caja {mn.round(0)} - {mx.round(0)}")

    n = int(round(args.segundos * comun.FPS))
    n_tras = int(round(args.traslado * comun.FPS))
    # tiempo de datos de cada fotograma: el traslado a velocidad constante y el
    # reposo mas despacio, para que el rebano «se asiente» antes del fundido
    ts = np.r_[np.linspace(0, args.hasta, n_tras, endpoint=False),
               np.linspace(args.hasta, args.reposo, n - n_tras)]
    if args.solo_poster:
        ts = ts[:1]

    crudo = comun.TMP / NOMBRE / "crudo"
    crudo.mkdir(parents=True, exist_ok=True)
    for v in crudo.glob("*.png"):
        v.unlink()
    tareas = [(str(crudo / f"f{i:04d}.png"), pos, tipos, objetivo, t, vista)
              for i, t in enumerate(ts)]
    with ProcessPoolExecutor(max_workers=args.procesos) as ex:
        for i, _ in enumerate(ex.map(dibuja, tareas, chunksize=4)):
            if i % 40 == 0:
                print(f"  {i}/{len(tareas)}", flush=True)

    pesos = comun.poster(crudo / "f0000.png", f"{NOMBRE}-poster")
    if not args.solo_poster:
        bucle = comun.TMP / NOMBRE / "bucle"
        comun.cierra_bucle(crudo, bucle, args.fundido)
        pesos |= comun.codifica(bucle, NOMBRE, crf_webm={2400: 40, 1200: 38},
                                crf_mp4={2400: 28, 1200: 26})
    comun.informe(pesos)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
