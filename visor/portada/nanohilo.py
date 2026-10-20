#!/usr/bin/env python3
"""Bucle de la portada: el nanohilo de cobre estirandose hasta romper.

Lee los volcados de md/nanohilo-cu (los mismos que alimentan el visor del
tutorial) y los dibuja como md/nanohilo-cu/python/render.py, pero sobre azul
marino y con la paleta de la portada:

    FCC (cristal perfecto)      azul acero, de relleno
    superficie (CNA desconocido) azul grisaceo algo mas claro
    HCP (fallas de apilamiento)  ambar: la plasticidad es lo que se enciende
    BCC / icosaedrico            azul claro

El hilo es periodico en x (la caja de LAMMPS es `pp` a lo largo), asi que se
dibujan las copias vecinas y el hilo cruza la banda entera, sin extremos
cortados. El cuello, donde rompe, se clava en el 72 % del ancho; hacia la
izquierda el hilo se funde con el fondo (una niebla horizontal pintada en el
propio render), porque esa es la zona del titular.

El tramo: con las fallas de apilamiento ya formadas (antes el hilo solo se
alarga y no pasa nada que se vea), el cuello y la rotura; medio volcado por
fotograma (interpolado), y un fundido de vuelta al principio.
"""

from __future__ import annotations

import argparse
import math
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

HILO = comun.SIM / "md" / "nanohilo-cu"
sys.path.insert(0, str(HILO / "python"))
from render import lee_frame, ordena  # noqa: E402  (lee_frame: solo el encuadre)

NOMBRE = "nanohilo"
COLORES = {1: "#56708f", 2: comun.WARM, 3: comun.AZUL_CLARO, 4: comun.AZUL_CLARO,
           5: "#7f97b3"}
ENCIMA = (2, 3, 4)
THETA = math.radians(24.0)       # el mismo giro que el render del tutorial
DIAM = 2.8                       # diametro de dibujo, A: algo mayor que en el tutorial para tapar las capas de detras
PX_POR_A = 10.0                  # escala: el hilo (~31 A) ocupa ~40 % del alto
CUELLO_X = 0.72                  # donde cae el cuello, en fraccion del ancho
NIEBLA = (0.52, 0.70)            # de aqui a aqui el hilo pasa de fondo a pleno: empieza donde acaba el titular
BRILLO = 0.0                     # opacidad del brillo especular (0 = sin; ver main)


def lee_ordenado(ruta: Path):
    """Como `lee_frame`, pero ordenado por id: para promediar en el tiempo
    hace falta que cada fila sea siempre el mismo atomo."""
    texto = ruta.read_text()
    cab, cuerpo = texto.split("ITEM: ATOMS", 1)
    lineas = cab.splitlines()
    i = next(k for k, l in enumerate(lineas) if l.startswith("ITEM: BOX BOUNDS"))
    xlo, xhi = (float(v) for v in lineas[i + 1].split()[:2])
    d = np.fromstring(cuerpo.split("\n", 1)[1], sep=" ").reshape(-1, 5)
    d = d[np.argsort(d[:, 0])]
    return d[:, 1:4], d[:, 4].astype(np.int8), (xlo, xhi)


def gauss_t(x: np.ndarray, sigma: float) -> np.ndarray:
    """Suavizado gaussiano a lo largo del primer eje (el tiempo)."""
    if sigma <= 0:
        return x
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    ext = np.concatenate([np.repeat(x[:1], r, 0), x, np.repeat(x[-1:], r, 0)])
    return sum(w * ext[i:i + len(x)] for i, w in enumerate(k))


def niebla(x_px: np.ndarray) -> np.ndarray:
    a, b = NIEBLA[0] * comun.ANCHO, NIEBLA[1] * comun.ANCHO
    f = np.clip((x_px - a) / (b - a), 0, 1)
    return f * f * (3 - 2 * f)       # smoothstep: sin borde visible


def dibuja(tarea):
    destino, u, v, prof, col, encima, lx = tarea

    W, H = comun.ANCHO, comun.ALTO
    vx0 = -CUELLO_X * W / PX_POR_A
    vista = (vx0, vx0 + W / PX_POR_A, -H / 2 / PX_POR_A, H / 2 / PX_POR_A)

    # copias periodicas que caen dentro del encuadre
    uu, vv, pp, cc, ee = [], [], [], [], []
    for k in range(-3, 4):
        uk = u + k * lx
        m = (uk > vista[0] - 3) & (uk < vista[1] + 3)
        uu.append(uk[m]); vv.append(v[m]); pp.append(prof[m])
        cc.append(col[m]); ee.append(encima[m])
    uu, vv, pp, cc, ee = map(np.concatenate, (uu, vv, pp, cc, ee))

    dpi = 100
    fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
    fig.patch.set_facecolor(comun.NAVY)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_facecolor(comun.NAVY)
    ax.set_xlim(vista[0], vista[1])
    ax.set_ylim(vista[2], vista[3])
    ax.set_aspect("equal")
    ax.axis("off")
    tam = (DIAM * PX_POR_A * 72.0 / dpi) ** 2
    luz = (pp - pp.min()) / max(np.ptp(pp), 1e-9)
    xpx = (uu - vista[0]) * PX_POR_A
    fog = niebla(xpx)
    navy = comun.rgb(comun.NAVY)

    def capa(m, z):
        if not m.any():
            return
        o = np.argsort(pp[m])
        col = cc[m][o] * (0.55 + 0.45 * luz[m][o])[:, None]
        f = fog[m][o][:, None]
        col = navy + (col - navy) * f
        ax.scatter(uu[m][o], vv[m][o], s=tam, c=np.clip(col, 0, 1), marker="o",
                   linewidths=0, zorder=z)
        if BRILLO <= 0:
            return
        # brillo especular, apagado tambien por la niebla
        r = DIAM / 2
        ax.scatter(uu[m][o] - 0.3 * r, vv[m][o] + 0.3 * r, s=tam * 0.16,
                   c="white", alpha=np.clip(BRILLO * f[:, 0], 0, 1), marker="o",
                   linewidths=0, zorder=z + 0.1)

    capa(~ee, 2)
    capa(ee, 3)
    fig.savefig(destino, dpi=dpi, facecolor=comun.NAVY)
    plt.close(fig)
    return destino


def main() -> int:
    global PX_POR_A, DIAM, BRILLO
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=str(HILO / "datos" / "frames"))
    ap.add_argument("--desde", type=int, default=94,
                    help="primer volcado: cuando ya hay fallas de apilamiento")
    ap.add_argument("--hasta", type=int, default=166)
    ap.add_argument("--segundos", type=float, default=6.0)
    ap.add_argument("--sigma", type=float, default=2.0,
                    help="suavizado temporal, en volcados")
    ap.add_argument("--fundido", type=int, default=18)
    ap.add_argument("--procesos", type=int, default=4)
    ap.add_argument("--solo-poster", action="store_true")
    ap.add_argument("--escala", type=float, default=PX_POR_A, help="px por angstrom")
    ap.add_argument("--diam", type=float, default=DIAM)
    ap.add_argument("--brillo", type=float, default=BRILLO)
    ap.add_argument("--n-max", type=int, default=None, help="solo para pruebas")
    args = ap.parse_args()
    # los procesos del pool heredan estos valores (fork)
    PX_POR_A, DIAM, BRILLO = args.escala, args.diam, args.brillo

    rutas = ordena(Path(args.frames).glob("hilo.*.lammpstrj"))
    pos0, _, _ = lee_frame(rutas[0])
    posf, _, (xlof, xhif) = lee_frame(rutas[-1])
    centro_yz = (0.5 * (pos0[:, 1].min() + pos0[:, 1].max()),
                 0.5 * (pos0[:, 2].min() + pos0[:, 2].max()))
    # donde rompe: el tramo con menos atomos en el ultimo volcado (como render.py)
    s_fin = (posf[:, 0] - xlof) / (xhif - xlof)
    hist, bordes = np.histogram(s_fin, bins=60, range=(0.0, 1.0))
    suave = np.convolve(np.r_[hist, hist, hist], np.ones(5) / 5, "same")[60:120]
    j = int(np.argmin(suave))
    desplaza = (0.5 * (bordes[j] + bordes[j + 1]) + 0.5) % 1.0

    # --- trayectoria suavizada en el tiempo --------------------------------
    # Lo que de verdad pesa en el video no son los atomos sino su vibracion
    # termica: de un volcado al siguiente cada atomo se mueve al azar una
    # fraccion de su diametro y su tipo CNA parpadea, y eso es ruido de alta
    # frecuencia que el codec no puede predecir (el primer intento, sin
    # suavizar, pesaba 2,3 MiB). Se promedia con una gaussiana en el tiempo
    # (posiciones en coordenada fraccionaria, que es casi constante con la caja
    # estirandose de forma afin, y colores en RGB, de modo que una falla que
    # aparece se enciende en vez de parpadear) y se muestrea a 24 fps.
    margen = int(np.ceil(3 * args.sigma)) + 1
    i0, i1 = max(0, args.desde - margen), min(len(rutas), args.hasta + margen)
    tabla = np.array([comun.rgb(COLORES.get(c, COLORES[5])) for c in range(6)])
    S, Y, Z, C, T, L = [], [], [], [], [], []
    for r in rutas[i0:i1]:
        pos, cna, (xlo, xhi) = lee_ordenado(Path(r))
        S.append((pos[:, 0] - xlo) / (xhi - xlo))
        Y.append(pos[:, 1])
        Z.append(pos[:, 2])
        C.append(tabla[np.clip(cna, 0, 5)])
        T.append(np.isin(cna, ENCIMA))
        L.append(xhi - xlo)
    S, Y, Z, C, T, L = map(np.array, (S, Y, Z, C, T, L))
    # sin saltos de periodo: un atomo que cruza el borde de la caja no puede
    # promediarse con su imagen del otro lado
    S = S[0] + np.cumsum(np.r_[np.zeros((1, S.shape[1])),
                               np.diff(S, axis=0) - np.round(np.diff(S, axis=0))], axis=0)
    S, Y, Z, C, Tf = (gauss_t(x, args.sigma) for x in (S, Y, Z, C, T.astype(float)))

    n = 1 if args.solo_poster else int(round(args.segundos * comun.FPS))
    ts = np.linspace(args.desde - i0, args.hasta - 1 - i0, n)[:args.n_max]
    ct, st = math.cos(THETA), math.sin(THETA)
    crudo = comun.TMP / NOMBRE / "crudo"
    crudo.mkdir(parents=True, exist_ok=True)
    for v in crudo.glob("*.png"):
        v.unlink()
    tareas = []
    for k, t in enumerate(ts):
        j = min(int(t), len(L) - 2)
        a = t - j
        mezcla = lambda X: X[j] * (1 - a) + X[j + 1] * a  # noqa: E731
        lx = mezcla(L)
        u = (np.mod(mezcla(S) - desplaza, 1.0) - 0.5) * lx
        y, z = mezcla(Y) - centro_yz[0], mezcla(Z) - centro_yz[1]
        tareas.append((str(crudo / f"f{k:04d}.png"), u, y * st + z * ct,
                       y * ct - z * st, mezcla(C), mezcla(Tf) > 0.5, lx))
    with ProcessPoolExecutor(max_workers=args.procesos) as ex:
        for i, _ in enumerate(ex.map(dibuja, tareas, chunksize=4)):
            if i % 40 == 0:
                print(f"  {i}/{len(tareas)}", flush=True)

    pesos = comun.poster(crudo / "f0000.png", f"{NOMBRE}-poster")
    if not args.solo_poster:
        bucle = comun.TMP / NOMBRE / "bucle"
        comun.cierra_bucle(crudo, bucle, args.fundido)
        pesos |= comun.codifica(bucle, NOMBRE, crf_webm={2400: 38, 1200: 36},
                                crf_mp4={2400: 29, 1200: 27})
    comun.informe(pesos)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
