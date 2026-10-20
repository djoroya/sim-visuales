#!/usr/bin/env python3
"""Figuras estaticas: explicativa (paquete + rayo), casos 1D y validacion.

  salida/ondas-explicativa.png   espacio-tiempo en g1 con el rayo encima,
                                 retrato de fases y rodeo 2D
  salida/ondas-casos-1d.png      3 mallas x 3 frecuencias, como el articulo
  salida/ondas-validacion.png    velocidad de grupo y convergencia
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
os.environ.setdefault("MPLCONFIGDIR", str(RAIZ / "tmp" / ".mpl"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.colors import ListedColormap  # noqa: E402

from escalera import RODEO, compara_1d, periodo_rodeo  # noqa: E402
from ondas import PI, MALLAS, Operador2D, r0_2d, rayo  # noqa: E402
from paleta import tabla  # noqa: E402

FONDO = "#0d1f36"
TINTA = "#e8edf3"        # texto principal
TINTA2 = "#9fb0c4"       # texto secundario, ejes
REJILLA = "#1f3553"
AMBAR = "#f59e0b"
SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"]  # validada sobre FONDO
CMAP = ListedColormap(tabla(256) / 255.0)
SAL = RAIZ / "salida"

plt.rcParams.update({
    "figure.facecolor": FONDO, "axes.facecolor": FONDO, "savefig.facecolor": FONDO,
    "axes.edgecolor": REJILLA, "axes.labelcolor": TINTA2, "xtick.color": TINTA2,
    "ytick.color": TINTA2, "text.color": TINTA, "axes.titlecolor": TINTA,
    "font.size": 10, "axes.titlesize": 11, "axes.titleweight": "normal",
    "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False,
    "legend.labelcolor": TINTA2,
})


def espacio_tiempo(ax, c, titulo, rayo_=True):
    """|u| en el plano (X fisica, t), con el rayo encima."""
    op = c["op"]
    A = np.abs(c["u"]).T
    ax.pcolormesh(op.X, c["ts"], A / A.max(), cmap=CMAP, shading="nearest",
                  vmin=0, vmax=1, rasterized=True)
    if rayo_:
        X = c["Xr"].copy()
        # cortar la linea en las reflexiones para no unir -1 con 1
        X[np.r_[False, np.abs(np.diff(X)) > 0.5]] = np.nan
        ax.plot(X, c["ts"], color=AMBAR, lw=1.1, dashes=(3, 3))
    ax.set_xlim(-1, 1)
    ax.set_ylim(0, c["ts"][-1])
    ax.set_title(titulo, loc="left")


def figura_explicativa():
    fig = plt.figure(figsize=(13.5, 4.6), dpi=150)
    gs = fig.add_gridspec(1, 3, wspace=0.28, left=0.05, right=0.985, top=0.86, bottom=0.12)

    # (a) espacio-tiempo en g1, reflexion interna
    ax = fig.add_subplot(gs[0])
    c = compara_1d(1600, "g1", 0.0, 10 * PI / 15, T=5.0, nt=501)
    espacio_tiempo(ax, c, "a) Malla g1, ξ₀ = 10π/15")
    ax.set_xlabel("x (coordenada física)")
    ax.set_ylabel("t")
    ax.text(0.98, 0.97, "- - rayo del hamiltoniano discreto", color=AMBAR, ha="right",
            va="top", transform=ax.transAxes, fontsize=9)

    # (b) retrato de fases de g1 con los casos medidos
    ax = fig.add_subplot(gs[1])
    m = MALLAS["g1"]
    xx = np.linspace(-1, 1, 400)
    ee = np.linspace(0, 2 * PI, 400)
    Xg, Eg = np.meshgrid(xx, ee)
    lam = 2 * np.sin(Eg / 2) * m.c(Xg)
    ax.contour(m.g(Xg), Eg / PI, lam, levels=np.linspace(0.1, 2.5, 18),
               colors=REJILLA, linewidths=0.8)
    for col, (et, xi0) in zip(SERIES, [("7π/15", 7 * PI / 15), ("10π/15", 10 * PI / 15),
                                       ("13π/15", 13 * PI / 15)]):
        cc = compara_1d(1600, "g1", 0.0, xi0, T=5.0, nt=501)
        ax.plot(cc["Xr"], cc["xir"] / PI, color=col, lw=1.6)
        k = slice(0, None, 12)
        ax.plot(cc["mo"]["X"][k], cc["mo"]["xi"][k] / PI, "o", ms=3.2, color=col,
                mec=FONDO, mew=0.6)
        ax.annotate(f"ξ₀ = {et}", (0, xi0 / PI), xytext=(4, -10), textcoords="offset points",
                    color=TINTA2, fontsize=8.5)
    ax.plot([0], [1], "o", ms=6, color=AMBAR)
    ax.annotate("equilibrio (0, π): centro", (0, 1.62), xytext=(0, 0), ha="center",
                textcoords="offset points", color=TINTA2, fontsize=8.5)
    ax.set_xlim(-1, 1)
    ax.set_ylim(0, 2)
    ax.set_xlabel("x (coordenada física)")
    ax.set_ylabel("ξ / π")
    ax.set_title("b) Fases en g1: rayo (línea) y paquete (puntos)", loc="left")

    # (c) rodeo 2D: maximo temporal de la energia y rayo
    ax = fig.add_subplot(gs[2])
    N = 1000
    op = Operador2D(N, "g1")
    C0 = op.a_espectro(op.dato(*RODEO))
    Tp = periodo_rodeo()
    acum = None
    area = op.o.m[:, None] * op.o.m[None, :]
    # ocho instantaneas a lo largo de una vuelta (maximo de las ocho)
    for t in np.linspace(0, Tp, 8, endpoint=False):
        U, Ut = op.en_t(C0, t)
        d = op.energia(U, Ut) / area
        acum = d if acum is None else np.maximum(acum, d)
    X = op.o.X
    ax.pcolormesh(X, X, (acum / acum.max()).T ** 0.5, cmap=CMAP, shading="nearest",
                  rasterized=True)
    g = m.g
    for xl in g(np.linspace(-1, 1, 25)):
        ax.axvline(xl, color="#14519b", lw=0.4, alpha=0.5)
        ax.axhline(xl, color="#14519b", lw=0.4, alpha=0.5)
    ts = np.linspace(0, Tp, 800)
    y0 = float(m.ginv(RODEO[1]))
    xr, _ = rayo("g1", [0.0, y0], [RODEO[2], RODEO[3]], ts,
                 r0=r0_2d("g1", 0.0, RODEO[2], y0, RODEO[3]))
    ax.plot(g(xr[:, 0]), g(xr[:, 1]), color=AMBAR, lw=1.1, dashes=(3, 3))
    ax.set_aspect("equal")
    ax.set_xlim(-1, 1)
    ax.set_ylim(-1, 1)
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title("c) Rodeo en g1 (2D): 8 instantes de una vuelta", loc="left")

    fig.suptitle("Un paquete de alta frecuencia sigue el rayo del símbolo discreto",
                 x=0.05, ha="left", fontsize=13, color=TINTA)
    fig.savefig(SAL / "ondas-explicativa.png")
    plt.close(fig)
    print("  salida/ondas-explicativa.png")


def figura_casos():
    filas = [
        ("uniforme", [(0.0, PI / 4, "ξ₀ = π/4"), (0.0, PI, "ξ₀ = π"),
                      (0.0, 13 * PI / 15, "ξ₀ = 13π/15")]),
        ("g1", [(0.0, PI / 4, "ξ₀ = π/4"), (0.0, PI, "ξ₀ = π (centro)"),
                (0.0, 10 * PI / 15, "ξ₀ = 10π/15")]),
        ("g2", [(0.0, PI / 4, "ξ₀ = π/4"), (0.0, PI, "ξ₀ = π (silla)"),
                (0.5, PI, "x₀ = 1/2, ξ₀ = π")]),
    ]
    fig, axs = plt.subplots(3, 3, figsize=(11, 10), dpi=140, sharex=True, sharey=True)
    for i, (malla, casos) in enumerate(filas):
        for j, (X0, xi0, et) in enumerate(casos):
            c = compara_1d(1600, malla, X0, xi0, T=5.0, nt=401)
            espacio_tiempo(axs[i, j], c, f"{malla} · {et}")
        axs[i, 0].set_ylabel("t")
    for j in range(3):
        axs[2, j].set_xlabel("x")
    fig.suptitle("|u(x, t)| y rayo discreto (línea discontinua), N = 1600",
                 x=0.06, ha="left", fontsize=12)
    fig.tight_layout()
    fig.savefig(SAL / "ondas-casos-1d.png")
    plt.close(fig)
    print("  salida/ondas-casos-1d.png")


def figura_validacion():
    disp = json.loads((SAL / "escalera-dispersion.json").read_text())
    conv = json.loads((SAL / "escalera-convergencia.json").read_text())
    c2 = json.loads((SAL / "escalera-conv2d.json").read_text())
    fig, (a, b) = plt.subplots(1, 2, figsize=(12, 4.4), dpi=150)
    xi = np.linspace(0, 2, 400)
    a.axhline(-1, color=TINTA2, lw=1, dashes=(2, 3))
    a.text(1.98, -0.96, "continua: −1", color=TINTA2, ha="right", fontsize=9)
    a.plot(xi, -np.cos(PI * xi / 2), color=SERIES[0], lw=1.6, label="teoría: −cos(ξ/2)")
    f = disp["filas"]
    a.plot([r["xi0_pi"] for r in f], [r["v_medida"] for r in f], "o", ms=5,
           color=AMBAR, mec=FONDO, mew=0.8, label="medida (centro de energía)")
    a.axhline(0, color=REJILLA, lw=0.8)
    a.set_xlabel("ξ₀ / π")
    a.set_ylabel("velocidad de grupo")
    a.set_title(f"Malla uniforme, N = {disp['N']}: error máx. {disp['max_error']:.0e}",
                loc="left")
    a.legend(loc="upper left")

    hs = None
    for col, caso in zip(SERIES, conv["casos"]):
        a_h = np.array(caso["h"])
        b.loglog(a_h, caso["err_medio_lejos_borde"], "o-", color=col, lw=1.4, ms=5,
                 label=f"1D {caso['caso']}  (orden {caso['orden_medio']})")
        hs = a_h
    b.loglog(c2["h"], c2["err_medio"], "s-", color=SERIES[4], lw=1.4, ms=5,
             label=f"2D rodeo g1  (orden {c2['orden_medio']})")
    ref = hs ** 0.9 * 0.25
    b.loglog(hs, ref, color=TINTA2, lw=1, dashes=(2, 3), label="pendiente 0,9")
    b.set_xlabel("h")
    b.set_ylabel("error medio |centro − rayo|")
    b.set_title("Al refinar, el paquete se pega al rayo", loc="left")
    b.legend(fontsize=8.5, loc="lower right")
    b.grid(True, which="major", color=REJILLA, lw=0.5)
    fig.tight_layout()
    fig.savefig(SAL / "ondas-validacion.png")
    plt.close(fig)
    print("  salida/ondas-validacion.png")


if __name__ == "__main__":
    pedidas = sys.argv[1:] or ["explicativa", "casos", "validacion"]
    for p in pedidas:
        {"explicativa": figura_explicativa, "casos": figura_casos,
         "validacion": figura_validacion}[p]()
