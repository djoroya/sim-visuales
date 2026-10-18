#!/usr/bin/env python3
"""Dibuja la grieta: fotogramas para el video de portada e imagenes fijas.

Los atomos se pintan como discos coloreados por sigma_yy con la paleta de
python/paleta.py. El encuadre de portada sigue a la punta de la grieta, que
es donde pasa todo.
"""

from __future__ import annotations

import argparse
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parents[1] / "tmp" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from paleta import tabla
from campo import suaviza, rejilla

A_AT = np.sqrt(3) / 2 * 2 ** (1 / 3)
FONDO_OSCURO = "#081627"
FONDO_CLARO = "#ffffff"


def lee_volcados(ruta: Path):
    texto = ruta.read_text()
    for b in texto.split("ITEM: TIMESTEP\n")[1:]:
        lineas = b.splitlines()
        paso = int(lineas[0])
        i = next(j for j, l in enumerate(lineas) if l.startswith("ITEM: ATOMS"))
        datos = np.array([l.split() for l in lineas[i + 1:] if l.strip()],
                         dtype=np.float64)
        yield paso, datos[np.argsort(datos[:, 0])]


def dibuja_campo(args_t):
    """Pinta el campo como imagen continua: para el fondo de la portada."""
    (destino, xy, sig, vista, ancho, alto, fondo, smax, celda, sigma,
     sigma_dens) = args_t
    x0, x1, y0, y1 = vista
    campo, dens, lim = rejilla(xy, sig, celda=celda, sigma=sigma,
                               sigma_dens=sigma_dens)
    pal = tabla(256) / 255.0
    idx = np.clip(campo / smax, 0, 1)
    img = pal[(idx * 255).astype(int)]
    # donde no hay atomos (la grieta abierta) se deja el color de fondo
    hueco = dens < 0.45 * np.median(dens[dens > 0])
    img[hueco] = matplotlib.colors.to_rgb(fondo)

    dpi = 100
    fig = plt.figure(figsize=(ancho / dpi, alto / dpi), dpi=dpi)
    fig.patch.set_facecolor(fondo)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.axis("off")
    ax.imshow(np.transpose(img, (1, 0, 2)), origin="lower", extent=lim,
              interpolation="bicubic", aspect="auto")
    fig.savefig(destino, dpi=dpi, facecolor=fondo)
    plt.close(fig)
    return destino


def dibuja(args_t):
    (destino, xy, sig, vista, ancho, alto, fondo, smax, radio, claro) = args_t
    x0, x1, y0, y1 = vista
    dpi = 100
    fig = plt.figure(figsize=(ancho / dpi, alto / dpi), dpi=dpi)
    fig.patch.set_facecolor(fondo)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_facecolor(fondo)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.axis("off")

    dentro = ((xy[:, 0] > x0 - 2) & (xy[:, 0] < x1 + 2)
              & (xy[:, 1] > y0 - 2) & (xy[:, 1] < y1 + 2))
    p = xy[dentro]
    s = np.clip(sig[dentro] / smax, 0, 1)
    pal = tabla(256) / 255.0
    col = pal[(s * 255).astype(int)]
    if claro:
        # sobre fondo blanco el extremo frio se aclara para no manchar
        col = 1.0 - (1.0 - col) * (0.25 + 0.75 * s)[:, None]

    pt_por_u = (ancho / dpi * 72.0) / (x1 - x0)
    ax.scatter(p[:, 0], p[:, 1], s=(radio * pt_por_u) ** 2, c=col,
               marker="o", linewidths=0)
    fig.savefig(destino, dpi=dpi, facecolor=fondo)
    plt.close(fig)
    return destino


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--volcado", default=str(raiz / "datos" / "grieta.lammpstrj"))
    ap.add_argument("--punta", default=str(raiz / "datos" / "punta.txt"))
    ap.add_argument("--salida", default=str(raiz / "tmp" / "frames"))
    ap.add_argument("--modo", choices=("portada", "fija", "og"), default="portada")
    ap.add_argument("--ancho", type=int, default=1600)
    ap.add_argument("--alto", type=int, default=400)
    ap.add_argument("--ventana", type=float, nargs=2, default=[190.0, 47.5],
                    help="tamano de la vista en unidades LJ")
    ap.add_argument("--adelanto", type=float, default=25.0,
                    help="cuanto se adelanta el encuadre a la punta")
    ap.add_argument("--frac-punta", type=float, default=None,
                    help="donde cae la punta a lo ancho, de 0 a 1 "
                         "(si se da, manda sobre --adelanto)")
    ap.add_argument("--frac-grieta", type=float, default=None,
                    help="donde cae la grieta a lo alto, de 0 a 1 medido "
                         "desde ARRIBA, como en una imagen")
    ap.add_argument("--claro", action="store_true")
    ap.add_argument("--radio", type=float, default=0.62)
    ap.add_argument("--percentil", type=float, default=99.5)
    ap.add_argument("--smax", type=float, default=None,
                    help="tension que satura el color; si no, el percentil")
    ap.add_argument("--suavizado", type=float, default=1.6,
                    help="ancho del suavizado espacial, unidades LJ (0 = sin)")
    ap.add_argument("--frames", type=int, nargs="*", default=None,
                    help="indices concretos (para imagenes fijas)")
    ap.add_argument("--desde", type=int, default=0)
    ap.add_argument("--hasta", type=int, default=None)
    ap.add_argument("--procesos", type=int, default=8)
    ap.add_argument("--dibujo", choices=("atomos", "campo"), default="atomos")
    ap.add_argument("--celda", type=float, default=1.1)
    ap.add_argument("--sigma-dens", type=float, default=1.05,
                    help="suavizado de la densidad que marca el hueco de la "
                         "grieta; tiene que ser del orden del espaciado "
                         "atomico aunque la celda sea mas fina, o las celdas "
                         "vacias entre atomos se marcan como hueco")
    args = ap.parse_args()

    cuadros = list(lee_volcados(Path(args.volcado)))
    if args.suavizado > 0:
        cuadros = [(p, np.c_[d[:, :3], suaviza(d[:, 1:3], d[:, 3] / A_AT,
                                               sigma=args.suavizado)])
                   for p, d in cuadros]
    else:
        cuadros = [(p, np.c_[d[:, :3], d[:, 3] / A_AT]) for p, d in cuadros]
    sig_todo = np.concatenate([d[:, 3] for _, d in cuadros])
    smax = args.smax if args.smax else float(np.percentile(sig_todo, args.percentil))
    lejano = float(np.median(sig_todo[sig_todo > 0]))
    xy0 = cuadros[0][1][:, 1:3]
    ymed = 0.5 * (xy0[:, 1].min() + xy0[:, 1].max())
    print(f"{len(cuadros)} fotogramas; campo lejano ~{lejano:.2f}, "
          f"color satura en {smax:.2f}")

    xp = None
    if Path(args.punta).exists():
        d = np.loadtxt(args.punta)
        xp = np.interp(np.arange(len(cuadros)),
                       np.linspace(0, len(cuadros) - 1, len(d)), d[:, 1])

    destino = Path(args.salida)
    destino.mkdir(parents=True, exist_ok=True)
    fondo = FONDO_CLARO if args.claro else FONDO_OSCURO
    w, h = args.ventana
    indices = (args.frames if args.frames
               else range(args.desde, args.hasta or len(cuadros)))

    tareas = []
    for k, i in enumerate(indices):
        _, datos = cuadros[i]
        xy = datos[:, 1:3]
        sig = datos[:, 3]
        if args.frac_punta is not None and xp is not None:
            # la punta cae en esa fraccion del ancho: el centro del encuadre
            # se corre hacia la izquierda lo que haga falta
            cx = xp[i] - (args.frac_punta - 0.5) * w
        else:
            cx = (xp[i] + args.adelanto) if xp is not None else xy[:, 0].mean()
        cx = min(max(cx, xy[:, 0].min() + w / 2), xy[:, 0].max() - w / 2)
        # frac_grieta se mide desde arriba, como en una imagen; el mundo tiene
        # la y hacia arriba, de ahi el signo
        cy = ymed + (args.frac_grieta - 0.5) * h if args.frac_grieta else ymed
        vista = (cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2)
        nombre = destino / (f"f{k:04d}.png" if not args.frames else f"fija{i:04d}.png")
        if args.dibujo == "campo":
            tareas.append((str(nombre), xy, sig, vista, args.ancho, args.alto,
                           fondo, smax, args.celda, args.suavizado,
                           args.sigma_dens))
        else:
            tareas.append((str(nombre), xy, sig, vista, args.ancho, args.alto,
                           fondo, smax, args.radio, args.claro))

    with ProcessPoolExecutor(max_workers=args.procesos) as ex:
        fn = dibuja_campo if args.dibujo == "campo" else dibuja
        for k, _ in enumerate(ex.map(fn, tareas, chunksize=2)):
            if k % 40 == 0:
                print(f"  {k}/{len(tareas)}", flush=True)
    print(f"{len(tareas)} imagenes en {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
