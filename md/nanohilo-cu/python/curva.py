#!/usr/bin/env python3
"""Grafica tension-deformacion del ensayo, en SVG, y resumen numerico.

Lee datos/curva.txt (deformacion, tension en GPa, temperatura, energia) y
escribe salida/tension-deformacion.svg mas un pequeno resumen en
datos/resumen-curva.txt para el README.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).resolve().parents[1] / "datos" / ".mpl"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

AZUL = "#14519b"
GRIS = "#5b6b7b"
SUAVE = "#aab8c6"


def media_movil(y: np.ndarray, n: int) -> np.ndarray:
    if n <= 1:
        return y
    nucleo = np.ones(n) / n
    pad = n // 2
    ext = np.r_[np.full(pad, y[0]), y, np.full(pad, y[-1])]
    return np.convolve(ext, nucleo, "same")[pad:pad + y.size]


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--curva", default=str(raiz / "datos" / "curva.txt"))
    ap.add_argument("--svg", default=str(raiz / "salida" / "tension-deformacion.svg"))
    ap.add_argument("--resumen", default=str(raiz / "datos" / "resumen-curva.txt"))
    args = ap.parse_args()

    d = np.loadtxt(args.curva)
    eps, sig = d[:, 0], d[:, 1]
    sig_s = media_movil(sig, 15)

    # magnitudes de interes
    i_max = int(np.argmax(sig_s))
    eps_y, sig_y = eps[i_max], sig_s[i_max]
    # modulo de Young: ajuste lineal en el tramo claramente elastico
    m = eps < min(0.6 * eps_y, 0.03)
    E = np.polyfit(eps[m], sig[m], 1)[0]
    # rotura: primer punto tras el pico en que la tension cae por debajo del 5 %
    tras = np.where((eps > eps_y) & (sig_s < 0.05 * sig_y))[0]
    i_rot = int(tras[0]) if tras.size else int(np.argmin(sig_s[i_max:]) + i_max)

    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    fig.patch.set_alpha(0.0)
    ax.set_facecolor("none")

    ax.axhline(0.0, color=SUAVE, lw=0.8, zorder=1)
    ax.plot(eps * 100, sig, color=AZUL, lw=0.7, alpha=0.25, zorder=2)
    ax.plot(eps * 100, sig_s, color=AZUL, lw=2.0, zorder=3,
            solid_capstyle="round")

    ax.plot([eps_y * 100], [sig_y], "o", ms=6, color=AZUL, zorder=4)
    ax.annotate(f"limite elastico\n{sig_y:.1f} GPa a {eps_y * 100:.1f} %",
                xy=(eps_y * 100, sig_y), xytext=(eps_y * 100 + 4, sig_y + 0.1),
                color=GRIS, fontsize=9, va="center",
                arrowprops=dict(arrowstyle="-", color=SUAVE, lw=0.8))

    # pendiente elastica como guia
    xr = np.array([0.0, eps_y * 1.15])
    ax.plot(xr * 100, E * xr, color=GRIS, lw=0.9, ls=(0, (4, 3)), zorder=2)
    ax.annotate(f"E = {E:.0f} GPa", xy=(xr[-1] * 100, E * xr[-1]),
                xytext=(xr[-1] * 100 * 0.35, E * xr[-1] * 0.92),
                color=GRIS, fontsize=9, ha="left", va="top")

    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    for lado in ("left", "bottom"):
        ax.spines[lado].set_color(SUAVE)
        ax.spines[lado].set_linewidth(0.8)
    ax.tick_params(colors=GRIS, labelsize=9, length=3, width=0.8)
    ax.set_xlabel("deformacion ingenieril  (%)", color=GRIS, fontsize=10)
    ax.set_ylabel("tension ingenieril  $\\sigma_{xx}$  (GPa)", color=GRIS, fontsize=10)
    ax.set_xlim(0, eps.max() * 100)
    ax.grid(axis="y", color=SUAVE, lw=0.5, alpha=0.35)
    ax.set_axisbelow(True)
    fig.tight_layout()

    Path(args.svg).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.svg, format="svg", transparent=True)
    plt.close(fig)

    resumen = (
        f"E_ajuste_GPa {E:.2f}\n"
        f"sigma_max_GPa {sig_y:.3f}\n"
        f"eps_sigma_max {eps_y:.4f}\n"
        f"eps_rotura {eps[i_rot]:.4f}\n"
        f"sigma_final_GPa {sig_s[-1]:.3f}\n"
        f"eps_final {eps[-1]:.4f}\n"
    )
    Path(args.resumen).write_text(resumen)
    print(resumen, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
