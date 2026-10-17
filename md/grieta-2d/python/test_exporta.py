#!/usr/bin/env python3
"""Comprueba que la red exportada al visor es regular.

El submuestreo se queda con una de cada k filas y columnas. Si el indice de
fila se calcula con el espaciado del cristal SIN deformar, el redondeo se
desfasa poco a poco (la lamina esta estirada un 4 %) y cada ~25 filas se
dobla una y falta otra: en el visor se ve como una raya oscura horizontal.

Este test lee el .crack ya escrito, agrupa los atomos en filas y columnas y
exige que las separaciones sean uniformes.
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

import numpy as np


def lee_crack(ruta: Path):
    b = ruta.read_bytes()
    assert b[:6] == b"CRACK1", "no es un fichero CRACK1"
    nat, nfr, _ = struct.unpack_from("<IHH", b, 8)
    x0, y0, sx, sy = struct.unpack_from("<4f", b, 16)
    paso = struct.unpack_from("<f", b, 40)[0]
    p = 44 + 4 * nfr
    pos = np.empty((nat, 2))
    for c in range(2):
        alto = np.frombuffer(b, np.uint8, nat, p)
        bajo = np.frombuffer(b, np.uint8, nat, p + nat)
        p += 2 * nat
        pos[:, c] = (x0 if c == 0 else y0) + (alto * 256.0 + bajo) * paso
    return pos, nat, nfr


def separaciones(v: np.ndarray, salto_min: float = 0.25) -> np.ndarray:
    """Separaciones entre grupos consecutivos de valores casi iguales."""
    vs = np.sort(v)
    d = np.diff(vs)
    grandes = d[d > salto_min]
    if grandes.size == 0:
        return np.array([])
    paso = float(np.median(grandes))
    cortes = np.flatnonzero(d > 0.5 * paso)
    centros = [vs[: cortes[0] + 1].mean()]
    for i in range(len(cortes) - 1):
        centros.append(vs[cortes[i] + 1: cortes[i + 1] + 1].mean())
    centros.append(vs[cortes[-1] + 1:].mean())
    return np.diff(np.array(centros))


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--crack", default=str(raiz / "salida" / "grieta.crack"))
    ap.add_argument("--tolerancia", type=float, default=0.06,
                    help="desviacion relativa admitida en la separacion")
    args = ap.parse_args()

    pos, nat, nfr = lee_crack(Path(args.crack))
    print(f"{Path(args.crack).name}: {nat} atomos, {nfr} fotogramas")

    fallos = 0
    for eje, nombre in ((1, "filas"), (0, "columnas")):
        sep = separaciones(pos[:, eje])
        if sep.size < 3:
            print(f"FALLA  no se distinguen {nombre}")
            fallos += 1
            continue
        med = float(np.median(sep))
        peor = float(np.max(np.abs(sep - med))) / med
        # una fila doblada da una separacion ~0 y la que falta, una del doble
        dobles = int((sep > 1.5 * med).sum())
        juntas = int((sep < 0.5 * med).sum())
        ok = peor <= args.tolerancia and dobles == 0 and juntas == 0
        fallos += 0 if ok else 1
        print(f"{'ok   ' if ok else 'FALLA'} {nombre}: {sep.size + 1}, "
              f"separacion {med:.4f}, desviacion maxima {peor * 100:.1f} %, "
              f"huecos dobles {dobles}, pegadas {juntas}")

    print("\ntodo correcto" if not fallos else f"\n{fallos} comprobaciones fallidas")
    return 0 if not fallos else 1


if __name__ == "__main__":
    sys.exit(main())
