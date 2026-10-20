#!/usr/bin/env python3
"""Fotogramas de portada: el efecto rodeo en la malla g1, en bucle.

Escena (todo es una sola solucion de la ecuacion semidiscreta, superposicion
lineal de tres haces gaussianos en la malla g1 = tan(pi x/4) en x e y):

  * dos haces en la orbita cerrada del rodeo, en fases opuestas:
      (0,  Y_t, pi/2,  pi)   y   (0, -Y_t, 3pi/2, pi)
    el segundo es el primero girado 180 grados, asi que a medio periodo la
    escena vuelve a ser la del principio: el bucle dura T/2.
  * un haz quieto en (0, 0, pi, pi), el equilibrio del sistema de rayos. Se le
    da la anchura "ajustada" al centro (gamma = sqrt(b/a)/h en vez de h^-0.9)
    para que no respire: queda como un nucleo fijo.

Encuadre 3:1, dominio a la derecha (centro al ~70 % del ancho) y la mitad
izquierda limpia para el texto. Se dibujan, tenues, las lineas de la malla
no uniforme y la orbita del rayo: el paquete va montado encima.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
os.environ.setdefault("MPLCONFIGDIR", str(RAIZ / "tmp" / ".mpl"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from scipy.ndimage import map_coordinates  # noqa: E402

from escalera import Y_RODEO, periodo_rodeo  # noqa: E402
from ondas import PI, MALLAS, Operador2D, r0_2d, rayo  # noqa: E402
from paleta import tabla  # noqa: E402

FONDO = "#0d1f36"


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255


def capa_fija(W, H, cx, lado, N_lineas, orbita):
    """Fondo, lineas de la malla g1 y orbita del rayo (RGB float, H x W x 3)."""
    dpi = 100
    fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
    fig.patch.set_facecolor(FONDO)
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_facecolor(FONDO)
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.axis("off")
    g = MALLAS["g1"].g
    s = lado / 2
    cy = H / 2
    lw = max(0.6, W / 2400 * 1.1)
    xs = g(np.linspace(-1, 1, N_lineas + 1))
    for X in xs:
        # lineas de la malla: mas visibles en el centro, donde se aprietan
        a = 0.16 + 0.16 * np.cos(PI * X / 2) ** 2
        ax.plot([cx + s * X] * 2, [cy - s, cy + s], color="#14519b", lw=lw, alpha=a,
                solid_capstyle="butt")
        ax.plot([cx - s, cx + s], [cy - s * X] * 2, color="#14519b", lw=lw, alpha=a,
                solid_capstyle="butt")
    ax.plot(cx + s * np.array([-1, 1, 1, -1, -1]), cy - s * np.array([-1, -1, 1, 1, -1]),
            color="#14519b", lw=lw * 1.4, alpha=0.35)
    Xo, Yo = orbita
    ax.plot(cx + s * Xo, cy - s * Yo, color="#f59e0b", lw=lw * 1.2, alpha=0.30,
            dashes=(4, 5))
    fig.canvas.draw()
    img = np.asarray(fig.canvas.buffer_rgba())[..., :3].astype(float) / 255
    plt.close(fig)
    return img


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--N", type=int, default=1000)
    ap.add_argument("--ancho", type=int, default=2400)
    ap.add_argument("--alto", type=int, default=800)
    ap.add_argument("--nf", type=int, default=150, help="fotogramas del bucle")
    ap.add_argument("--centro", type=float, default=0.70, help="centro del dominio (fraccion del ancho)")
    ap.add_argument("--lado", type=float, default=0.92, help="lado del dominio (fraccion del alto)")
    ap.add_argument("--estela", type=float, default=0.6, help="duracion de la estela (fraccion del bucle)")
    ap.add_argument("--nucleo", type=float, default=0.12, help="energia del haz central")
    ap.add_argument("--brillo", type=float, default=0.9, help="fraccion del maximo que satura")
    ap.add_argument("--cola", type=float, default=0.85, help="intensidad de la estela")
    ap.add_argument("--gx", type=float, default=0.25, help="gamma_x / h^-0.9 de los haces del rodeo")
    ap.add_argument("--gy", type=float, default=4.0, help="gamma_y / h^-0.9 de los haces del rodeo")
    ap.add_argument("--fundido", type=int, default=15, help="fotogramas para cerrar el bucle")
    ap.add_argument("--salida", default=str(RAIZ / "tmp" / "portada"))
    ap.add_argument("--solo", type=int, default=None, help="dibuja solo este fotograma")
    args = ap.parse_args()

    t0 = time.time()
    W, H = args.ancho, args.alto
    cx, lado = args.centro * W, args.lado * H
    s = lado / 2

    op = Operador2D(args.N, "g1")
    o = op.o
    m = MALLAS["g1"]
    Tp = periodo_rodeo()
    Tbucle = Tp / 2
    print(f"N = {args.N}, periodo del rodeo {Tp:.4f}, bucle {Tbucle:.4f}"
          f"  [{time.time() - t0:.1f} s]")

    # haces: dos en el rodeo (fases opuestas) y uno en el equilibrio
    # haz anisotropo: mas ancho en x (menos dispersion en xi, que es lo que
    # cambia el periodo de la orbita) y mas estrecho en y (en el punto de
    # retorno lo que cuenta es la dispersion en y). Asi apenas se cizalla en
    # medio periodo y el bucle cierra casi solo (ver README).
    gam = o.h ** -0.9

    def haz(X0, Y0, xi0, eta0):
        x0, y0 = float(m.ginv(X0)), float(m.ginv(Y0))
        gx = np.exp(-0.5 * gam * args.gx * (o.x - x0) ** 2) * np.exp(1j * xi0 * o.x / o.h)
        gy = np.exp(-0.5 * gam * args.gy * (o.x - y0) ** 2) * np.exp(1j * eta0 * o.x / o.h)
        return gx[:, None] * gy[None, :]

    A = haz(0.0, Y_RODEO, PI / 2, PI)
    B = haz(0.0, -Y_RODEO, 3 * PI / 2, PI)
    # gamma ajustada al centro (0, pi): linealizando, x' = a d y d' = -b x con
    # a = c(0)/2 = 2/pi y b = -2 c''(0) = pi (coordenada de calculo). Un haz con
    # var(xi)/var(x) = b/a, es decir gamma = sqrt(b/a)/h, no respira.
    a_lin, b_lin = m.c(0.0) / 2, PI
    gam_c = np.sqrt(b_lin / a_lin) / o.h
    Cn = op.dato(0.0, 0.0, PI, PI, gamma=gam_c)
    haces = []
    for U0, peso in ((A, 1.0), (B, 1.0), (Cn, args.nucleo)):
        C = op.a_espectro(U0)
        haces.append(C * np.sqrt(peso / op.energia_espectral(C)))
    C0 = sum(haces)
    C_rodeo = haces[0] + haces[1]

    # orbita del rayo (para dibujarla)
    tt = np.linspace(0, Tp, 2000)
    y0 = float(m.ginv(Y_RODEO))
    xr, _ = rayo("g1", [0.0, y0], [PI / 2, PI], tt, r0=r0_2d("g1", 0.0, PI / 2, y0, PI))
    orbita = (m.g(xr[:, 0]), m.g(xr[:, 1]))
    base = capa_fija(W, H, cx, lado, 64, orbita)

    # pixeles del dominio -> indices (fraccionarios) de la malla de calculo
    jj = np.arange(W)
    ii = np.arange(H)
    Xp = (jj - cx) / s
    Yp = -(ii - H / 2) / s
    dentro_x = np.abs(Xp) <= 1
    dentro_y = np.abs(Yp) <= 1
    fx = (m.ginv(np.clip(Xp, -1, 1)) + 1) / o.h - 1
    fy = (m.ginv(np.clip(Yp, -1, 1)) + 1) / o.h - 1
    j0, j1 = np.where(dentro_x)[0][[0, -1]]
    i0, i1 = np.where(dentro_y)[0][[0, -1]]
    FX, FY = np.meshgrid(fx[j0:j1 + 1], fy[i0:i1 + 1])
    area = o.m[:, None] * o.m[None, :]

    pal = tabla(1024) / 255.0

    def densidad(t, C=None):
        U, Ut = op.en_t(C0 if C is None else C, t)
        rho = op.energia(U, Ut) / area          # energia por unidad de area fisica
        return map_coordinates(rho, [FX, FY], order=1, mode="nearest")

    # referencia de brillo: el maximo de los haces del rodeo a t = 0 (el nucleo,
    # mas concentrado, satura a ambar claro)
    ref = args.brillo * densidad(0.0, C_rodeo).max()
    dt = Tbucle / args.nf
    n_est = int(round(args.estela * args.nf))
    decae = 0.02 ** (1 / max(n_est, 1))            # la estela cae al 2 % en n_est pasos
    destino = Path(args.salida)
    destino.mkdir(parents=True, exist_ok=True)
    for v in list(destino.glob("f*.png")) + list(destino.glob("p*.png")):
        if args.solo is None:
            v.unlink()

    # calentamiento de la estela con tiempos negativos (la solucion exacta lo permite)
    k_ini = -2 * n_est
    rango = range(k_ini, args.nf) if args.solo is None else range(k_ini, args.solo + 1)
    estela = None
    for k in rango:
        if args.solo is not None and k < args.solo - 2 * n_est:
            continue
        d = densidad(k * dt)
        v = np.clip(d / ref, 0, None) ** 0.5
        estela = v if estela is None else np.maximum(estela * decae, v)
        if args.solo is not None and k != args.solo:
            continue
        if k < -args.fundido:
            continue
        val = np.maximum(v, args.cola * estela)
        val = np.clip(val, 0, 1)
        col = pal[(val * 1023).astype(int)]
        alfa = np.clip(val * 2.2, 0, 1)[..., None]
        img = base.copy()
        sub = img[i0:i1 + 1, j0:j1 + 1]
        img[i0:i1 + 1, j0:j1 + 1] = sub * (1 - alfa) + col * alfa
        # los fotogramas de tiempo negativo (p0001 = -dt, ...) sirven para cerrar
        # el bucle: la cola se funde con lo que viene justo antes de t = 0
        nombre = f"f{k:04d}.png" if k >= 0 else f"p{-k:04d}.png"
        Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(destino / nombre)
        if k % 25 == 0:
            print(f"  fotograma {k}/{args.nf}  [{time.time() - t0:.0f} s]")

    (destino / "meta.json").write_text(json.dumps({
        "N": args.N, "periodo_rodeo": Tp, "bucle": Tbucle, "nf": args.nf,
        "gamma_rodeo": [gam * args.gx, gam * args.gy], "gamma_nucleo": gam_c,
        "ancho": W, "alto": H, "centro": args.centro, "lado": args.lado}, indent=2))
    print(f"listo en {time.time() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
