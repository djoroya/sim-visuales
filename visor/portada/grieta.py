#!/usr/bin/env python3
"""Bucle de la portada: la grieta, con la camara siguiendo a la punta.

Mismo encuadre que la imagen fija de hoy (md/grieta-2d, `render.py --frames
150 --ventana 190 63.3 --frac-punta 0.70 --frac-grieta 0.72`), pero de un
tramo de la propagacion estacionaria. Con la camara pegada a la punta la
grieta y su halo se quedan quietos y lo que se mueve es el cristal, que entra
por la derecha y sale abierto por la izquierda: es el sistema de referencia
de la punta, y por eso el bucle cierra sin costura (el campo alrededor de una
grieta que avanza a velocidad constante es estacionario en ese sistema).

Reutiliza el dibujo de md/grieta-2d/python/render.py (`dibuja_campo`) para que
el color y el suavizado sean identicos a los de la imagen fija.
"""

from __future__ import annotations

import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

import comun

GRIETA = comun.SIM / "md" / "grieta-2d"
sys.path.insert(0, str(GRIETA / "python"))
from campo import suaviza  # noqa: E402
from render import A_AT, FONDO_OSCURO, dibuja_campo  # noqa: E402

NOMBRE = "grieta"


def lee(ruta: Path, desde: int, hasta: int):
    """Solo los volcados [desde, hasta): el fichero entero son 300 MB de texto."""
    cuadros = []
    with open(ruta) as fh:
        i = -1
        linea = fh.readline()
        while linea and i < hasta - 1:
            if linea.startswith("ITEM: TIMESTEP"):
                i += 1
                fh.readline()
                fh.readline()
                nat = int(fh.readline())
                for _ in range(5):
                    fh.readline()
                if desde <= i < hasta:
                    bloque = "".join(fh.readline() for _ in range(nat))
                    d = np.fromstring(bloque, sep=" ").reshape(nat, 4)
                    cuadros.append(d[np.argsort(d[:, 0])])
                else:
                    for _ in range(nat):
                        fh.readline()
            linea = fh.readline()
    return cuadros


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=int, default=120)
    ap.add_argument("--n", type=int, default=120, help="fotogramas del bucle")
    ap.add_argument("--fundido", type=int, default=16)
    ap.add_argument("--procesos", type=int, default=4)
    ap.add_argument("--solo-poster", action="store_true")
    args = ap.parse_args()

    cuadros = lee(GRIETA / "datos" / "grieta.lammpstrj", args.desde,
                  args.desde + args.n)
    punta = np.loadtxt(GRIETA / "datos" / "punta.txt")[:, 1]
    print(f"{len(cuadros)} volcados leidos")

    # mismos parametros que la imagen fija (run.sh, paso «imagen fija»)
    w, h = 190.0, 63.3
    frac_punta, frac_grieta = 0.70, 0.72
    smax, suav, celda, sdens = 3.0, 0.95, 0.42, 1.05

    xy0 = cuadros[0][:, 1:3]
    ymed = 0.5 * (xy0[:, 1].min() + xy0[:, 1].max())
    # la punta se suaviza con un ajuste lineal: la medida volcado a volcado
    # salta un atomo adelante y atras, y con la camara pegada a ella el
    # encuadre entero temblaria
    idx = np.arange(args.desde, args.desde + len(cuadros))
    pend, ord0 = np.polyfit(idx, punta[idx], 1)
    xp = pend * idx + ord0
    print(f"la punta avanza {pend:.3f} sigma por volcado")

    crudo = comun.TMP / NOMBRE / "crudo"
    crudo.mkdir(parents=True, exist_ok=True)
    for v in crudo.glob("*.png"):
        v.unlink()
    tareas = []
    for k, d in enumerate(cuadros):
        if args.solo_poster and k:
            break
        xy = d[:, 1:3]
        sig = suaviza(xy, d[:, 3] / A_AT, sigma=suav)
        cx = xp[k] - (frac_punta - 0.5) * w
        cy = ymed + (frac_grieta - 0.5) * h
        vista = (cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2)
        tareas.append((str(crudo / f"f{k:04d}.png"), xy, sig, vista,
                       comun.ANCHO, comun.ALTO, FONDO_OSCURO, smax, celda,
                       suav, sdens))
    with ProcessPoolExecutor(max_workers=args.procesos) as ex:
        for k, _ in enumerate(ex.map(dibuja_campo, tareas)):
            if k % 30 == 0:
                print(f"  {k}/{len(tareas)}", flush=True)

    pesos = comun.poster(crudo / "f0000.png", f"{NOMBRE}-poster")
    if not args.solo_poster:
        bucle = comun.TMP / NOMBRE / "bucle"
        comun.cierra_bucle(crudo, bucle, args.fundido)
        pesos |= comun.codifica(bucle, NOMBRE, crf_webm={2400: 40, 1200: 38},
                                crf_mp4={2400: 30, 1200: 28}, fps=20)
    comun.informe(pesos)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
