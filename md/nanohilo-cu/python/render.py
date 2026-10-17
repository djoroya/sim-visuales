#!/usr/bin/env python3
"""Render de los volcados de LAMMPS a fotogramas PNG.

Proyeccion ortografica del nanohilo con el eje horizontal, coloreando cada
atomo por su estructura local (analisis de vecinos comunes, CNA):

    FCC          gris muy claro   (cristal perfecto, de relleno)
    superficie   gris azulado     (CNA desconocido: caras libres y amorfo)
    HCP          azul #14519b     (fallas de apilamiento = plasticidad)
    BCC / ICO    azul medio       (raros)

Los atomos no FCC se dibujan por encima, de modo que las fallas de
apilamiento se ven a traves de la superficie del hilo.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parents[1] / "datos" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# --- estetica ---------------------------------------------------------------
FONDO = "#ffffff"
AZUL = "#14519b"          # color de acento de djoroya.com
COLORES = {
    1: "#ccd6e0",         # FCC
    2: AZUL,              # HCP  -> falla de apilamiento
    3: "#4a7fbf",         # BCC
    4: "#4a7fbf",         # icosaedrico
    5: "#aab8c6",         # desconocido -> superficie libre
}
ENCIMA = (2, 3, 4)        # categorias que se dibujan sobre el resto

ANCHO_PX, ALTO_PX = 1280, 720
DPI = 100
THETA = math.radians(24.0)   # giro alrededor del eje del hilo
DIAM = 2.35                  # diametro de dibujo del atomo, A
MARGEN = 1.10                # holgura horizontal sobre la longitud final


def lee_frame(ruta: Path):
    """Devuelve (pos Nx3, cna N, (xlo, xhi))."""
    with open(ruta) as fh:
        texto = fh.read()
    cabecera, cuerpo = texto.split("ITEM: ATOMS", 1)
    lineas = cabecera.splitlines()
    i = next(k for k, l in enumerate(lineas) if l.startswith("ITEM: BOX BOUNDS"))
    xlo, xhi = (float(v) for v in lineas[i + 1].split()[:2])
    cuerpo = cuerpo.split("\n", 1)[1]
    datos = np.fromstring(cuerpo, dtype=np.float64, sep=" ").reshape(-1, 5)
    return datos[:, 1:4], datos[:, 4].astype(np.int8), (xlo, xhi)


def sombrea(color: str, f: np.ndarray) -> np.ndarray:
    """Oscurece el color para los atomos lejanos (f = 1 es el mas cercano)."""
    rgb = np.array(matplotlib.colors.to_rgb(color))
    return np.clip(np.outer(0.62 + 0.38 * f, rgb), 0.0, 1.0)


def dibuja(args):
    (idx, ruta, destino, desplaza, vista_x, vista_y, centro_yz) = args
    pos, cna, (xlo, xhi) = lee_frame(Path(ruta))
    lx = xhi - xlo

    # traslacion ciclica para que el cuello quede en el centro del encuadre
    s = (pos[:, 0] - xlo) / lx
    s = np.mod(s - desplaza, 1.0)
    u = (s - 0.5) * lx

    y = pos[:, 1] - centro_yz[0]
    z = pos[:, 2] - centro_yz[1]
    ct, st = math.cos(THETA), math.sin(THETA)
    prof = y * ct - z * st          # profundidad (mayor = mas cerca)
    v = y * st + z * ct             # vertical en pantalla

    fig = plt.figure(figsize=(ANCHO_PX / DPI, ALTO_PX / DPI), dpi=DPI)
    fig.patch.set_facecolor(FONDO)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_facecolor(FONDO)
    ax.set_xlim(-vista_x / 2, vista_x / 2)
    ax.set_ylim(-vista_y / 2, vista_y / 2)
    ax.set_aspect("equal")
    ax.axis("off")

    pt_por_a = (ANCHO_PX / DPI * 72.0) / vista_x
    tam = (DIAM * pt_por_a) ** 2

    pmin, pmax = prof.min(), prof.max()
    luz = (prof - pmin) / max(pmax - pmin, 1e-9)   # 0 = al fondo, 1 = delante

    def capa(mascara, encima):
        if not mascara.any():
            return
        orden = np.argsort(prof[mascara])
        uu, vv = u[mascara][orden], v[mascara][orden]
        ll = luz[mascara][orden]
        cc = cna[mascara][orden]
        col = np.empty((uu.size, 3))
        for clave in np.unique(cc):
            m = cc == clave
            col[m] = sombrea(COLORES.get(int(clave), "#aab8c6"), ll[m])
        ax.scatter(uu, vv, s=tam, c=col, marker="o", linewidths=0,
                   zorder=3 if encima else 2)
        # brillo especular: punto claro desplazado hacia la esquina superior
        r = DIAM / 2
        ax.scatter(uu - 0.30 * r, vv + 0.30 * r, s=tam * 0.16, c="white",
                   marker="o", linewidths=0, alpha=0.30,
                   zorder=3.1 if encima else 2.1)

    arriba = np.isin(cna, ENCIMA)
    capa(~arriba, False)
    capa(arriba, True)

    fig.savefig(destino, dpi=DPI, facecolor=FONDO)
    plt.close(fig)
    return idx, int((cna == 2).sum()), lx


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=str(raiz / "datos" / "frames"))
    ap.add_argument("--salida", default=str(raiz / "datos" / "render"))
    ap.add_argument("--procesos", type=int, default=min(10, os.cpu_count() or 4))
    args = ap.parse_args()

    rutas = sorted(Path(args.frames).glob("hilo.*.lammpstrj"))
    if not rutas:
        print("no hay volcados que renderizar", file=sys.stderr)
        return 1
    destino = Path(args.salida)
    destino.mkdir(parents=True, exist_ok=True)
    for viejo in destino.glob("*.png"):
        viejo.unlink()

    # --- encuadre comun a toda la animacion ---------------------------------
    pos0, _, (xlo0, xhi0) = lee_frame(rutas[0])
    posf, cnaf, (xlof, xhif) = lee_frame(rutas[-1])
    lx_fin = xhif - xlof
    vista_x = lx_fin * MARGEN
    vista_y = vista_x * ALTO_PX / ANCHO_PX
    centro_yz = (0.5 * (pos0[:, 1].min() + pos0[:, 1].max()),
                 0.5 * (pos0[:, 2].min() + pos0[:, 2].max()))

    # --- donde ha roto: el tramo con menos atomos en el ultimo fotograma ----
    s_fin = (posf[:, 0] - xlof) / lx_fin
    hist, bordes = np.histogram(s_fin, bins=60, range=(0.0, 1.0))
    # el minimo circular, suavizado para no fijarse en un hueco puntual
    suave = np.convolve(np.r_[hist, hist, hist], np.ones(5) / 5, "same")[60:120]
    s_cuello = 0.5 * (bordes[int(np.argmin(suave))] + bordes[int(np.argmin(suave)) + 1])
    desplaza = (s_cuello + 0.5) % 1.0
    print(f"encuadre {vista_x:.1f} x {vista_y:.1f} A ; rotura en s={s_cuello:.3f}")

    n = len(rutas)
    tareas = [(i, str(ruta), str(destino / f"f{i:04d}.png"),
               desplaza, vista_x, vista_y, centro_yz)
              for i, ruta in enumerate(rutas)]

    hcp = np.zeros(n, dtype=int)
    with ProcessPoolExecutor(max_workers=args.procesos) as ex:
        for k, (i, nhcp, lx) in enumerate(ex.map(dibuja, tareas, chunksize=2)):
            hcp[i] = nhcp
            if k % 40 == 0:
                print(f"  {k}/{n}", flush=True)

    # fotograma mas vistoso: el de mayor numero de atomos en falla de apilamiento
    mejor = int(np.argmax(hcp))
    (destino / "mejor.txt").write_text(f"{mejor}\n")
    print(f"{n} fotogramas; el mas vistoso es el {mejor} ({hcp[mejor]} atomos HCP)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
