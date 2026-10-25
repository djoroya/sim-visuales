"""Figuras del estudio → tmp/fig_*.png

    python python/figuras.py        (después de hoja.py y de node js/serie.mjs)
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
import fem  # noqa: E402

RAIZ = Path(__file__).parent.parent
DATOS, TMP = RAIZ / "datos", RAIZ / "tmp"
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
COL = {"cerradas": "#8a8a8a", "motor": "#2f6db3", "cera": "#c9861a", "bimetal": "#c0392b", "bimetal_fina": "#e59a8f", "bimetal_negra": "#222"}
NOM = {"cerradas": "ventanas cerradas", "motor": "motor (22–26 °C)", "cera": "abridor de cera (22 °C)",
       "bimetal": "termobimetal 0,4 mm, blanco", "bimetal_fina": "termobimetal 0,2 mm (el viento la abre)", "bimetal_negra": "termobimetal negro"}


def curvatura():
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    for s, c in ((0.2, "#c0392b"), (0.4, "#2f6db3")):
        d = json.loads((DATOS / f"hoja-termica-{s}.json").read_text())
        dT = np.array([0] + [f["dT"] for f in d["filas"]])
        z = np.array([0] + [f["z_medio"] for f in d["filas"]])
        zf = np.array([fem.arco(150, fem.Bimetal().k * t / s)[1] for t in dT])
        ax[0].plot(dT, z, "o-", color=c, label=f"CalculiX, {s} mm")
        ax[0].plot(dT, zf, "--", color=c, alpha=0.7, label=f"fórmula de tira, {s} mm")
        x = np.array([f["dT"] for f in d["filas"]]) * (50 / s) ** 2
        ax[1].plot(x, [f["factor"] for f in d["filas"]], "o-", color=c, label=f"{s} mm")
    ax[0].set(xlabel="ΔT sobre la temperatura de cierre (K)", ylabel="subida de la punta (mm)", title="Hoja de 150 × 50 mm")
    ax[0].legend(frameon=False, fontsize=8)
    ax[1].set(xscale="log", xlabel="ΔT · (b/s)²  (K)", ylabel="CalculiX / fórmula", title="De casquete a cilindro", ylim=(0.95, 1.35))
    ax[1].axhline(1.3, color="#888", lw=0.8, ls=":"); ax[1].text(4.5e4, 1.31, "límite cilíndrico: 1 + ν", fontsize=8, color="#666")
    ax[1].legend(frameon=False, fontsize=8)
    fig.tight_layout(); fig.savefig(TMP / "fig_curvatura.png", dpi=130)


def viento():
    fig, ax = plt.subplots(figsize=(5.2, 3.8))
    u = np.linspace(0, 15, 100)
    for s, c in ((0.2, "#c0392b"), (0.4, "#2f6db3")):
        D = 135e3 * s ** 3 / (12 * 0.91)
        ax.plot(u, 0.5 * 1.2 * u ** 2 * 1e-6 * 150 ** 4 / (8 * D), color=c, label=f"placa lineal, {s} mm")
        ruta = DATOS / f"hoja-viento-{s}.json"
        if ruta.exists():
            v = [r for r in json.loads(ruta.read_text()) if r.get("converge", True) and r["caso"].startswith("cerrada")]
            ax.plot([r["u"] for r in v], [r["z_con"] for r in v], "o", color=c, label=f"CalculiX, {s} mm")
    ax.axhline(26.3, color="#888", ls=":", lw=0.8); ax.text(0.3, 27.5, "lo que abre con 20 K (0,4 mm)", fontsize=8, color="#666")
    ax.set(xlabel="viento (m/s)", ylabel="subida de la punta por succión (mm)", title="La hoja cerrada, con viento", ylim=(0, 80))
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout(); fig.savefig(TMP / "fig_viento.png", dpi=130)


def semana():
    S = json.loads((TMP / "serie.json").read_text())
    fig, axs = plt.subplots(2, 2, figsize=(11, 5.6), sharex="col", gridspec_kw={"height_ratios": [2.2, 1]})
    for col, (dia0, titulo) in enumerate(((95, "Una semana de abril"), (185, "Una semana de julio"))):
        for k in ("cerradas", "motor", "cera", "bimetal"):
            a = np.array(S[k]["serie"])
            m = (a[:, 0] >= dia0 * 86400) & (a[:, 0] < (dia0 + 7) * 86400)
            d = (a[m, 0] - dia0 * 86400) / 86400
            axs[0, col].plot(d, a[m, 1], color=COL[k], lw=1.2, label=NOM[k])
            if k != "cerradas":
                axs[1, col].plot(d, a[m, 3], color=COL[k], lw=1)
            if k == "motor":
                axs[0, col].plot(d, a[m, 2], color="#5aa05a", lw=0.8, ls="--", label="fuera")
        axs[0, col].axhline(30, color="#c0392b", lw=0.6, ls=":")
        axs[0, col].set(title=titulo, ylabel="aire de dentro (°C)")
        axs[1, col].set(xlabel="días", ylabel="área abierta (m²)")
    axs[0, 0].legend(frameon=False, fontsize=8, ncol=2)
    fig.tight_layout(); fig.savefig(TMP / "fig_semana.png", dpi=130)


def resumen():
    S = json.loads((TMP / "serie.json").read_text())
    ks = ["cerradas", "motor", "cera", "bimetal", "bimetal_fina", "bimetal_negra"]
    fig, ax = plt.subplots(1, 3, figsize=(11, 3.6))
    for i, (clave, tit) in enumerate((("h32dia", "horas de día por encima de 32 °C"), ("h10", "horas por debajo de 10 °C"), ("fruto", "fruto (g/m² de carbohidrato)"))):
        ax[i].barh(range(len(ks)), [S[k][clave] for k in ks], color=[COL[k] for k in ks])
        ax[i].set_yticks(range(len(ks)), [NOM[k] for k in ks] if i == 0 else [""] * len(ks), fontsize=8)
        ax[i].set_title(tit, fontsize=9); ax[i].invert_yaxis()
        for j, k in enumerate(ks):
            ax[i].text(S[k][clave], j, f" {S[k][clave]:.0f}", va="center", fontsize=8)
    ax[1].set_xlim(580, 700); ax[2].set_xlim(1400, 2150)
    fig.suptitle("Invernadero GES (crecimiento y ventilación de Vanthoor) con el tiempo de HortiMED, 16 feb – 9 ago 2018", fontsize=10)
    fig.tight_layout(); fig.savefig(TMP / "fig_resumen.png", dpi=130)


if __name__ == "__main__":
    for f in (curvatura, viento, semana, resumen):
        f(); print("ok", f.__name__)


def hojas3d(ruta=TMP / "fig_hojas3d.png", dTs=(0, 7.5, 15, 22.5, 30), s=0.2):
    """Una rejilla de hojas de 150 × 50 × s mm en el tejado, cada fila más caliente: la forma es un arco
    con la curvatura de la fórmula por el factor de CalculiX (casquete → cilindro)."""
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    d = json.loads((DATOS / f"hoja-termica-{s}.json").read_text())
    tab = [(0, 1.0)] + [(f["dT"], f["factor"]) for f in d["filas"]]
    factor = lambda t: np.interp(t, [a for a, _ in tab], [b for _, b in tab])
    L, b = 150.0, 50.0
    fig = plt.figure(figsize=(12, 6.3), facecolor="#0d1f36")
    ax = fig.add_subplot(projection="3d", facecolor="#0d1f36")
    cmap = plt.get_cmap("inferno")
    for fila, dT in enumerate(dTs):
        kap = factor(dT) * fem.Bimetal().k * dT / s
        u = np.linspace(0, L, 30)
        x = np.sin(kap * u) / kap if kap > 0 else u
        z = (1 - np.cos(kap * u)) / kap if kap > 0 else 0 * u
        for col in range(6):
            y0 = col * (b + 6)
            X0 = fila * (L + 25)
            polys = [[(X0 + x[i], y0, z[i]), (X0 + x[i + 1], y0, z[i + 1]), (X0 + x[i + 1], y0 + b, z[i + 1]), (X0 + x[i], y0 + b, z[i])] for i in range(len(u) - 1)]
            pc = Poly3DCollection(polys, facecolor=cmap(0.25 + 0.6 * dT / max(dTs)), edgecolor="none", alpha=0.97)
            pc.set_clip_on(False); ax.add_collection3d(pc)
            ax.plot([X0, X0 + L], [y0, y0], [0, 0], color="#4f6a8a", lw=0.6, clip_on=False)      # el hueco del marco
        ax.text(fila * (L + 25) + L / 2, -45, 0, f"+{dT:g} K", color="#e8eef6", fontsize=15, ha="center")
    ax.set_xlim(0, len(dTs) * (L + 25)); ax.set_ylim(-60, 6 * 56); ax.set_zlim(0, 130)
    ax.set_box_aspect((len(dTs) * (L + 25), 6 * 56 + 60, 130), zoom=1.25); ax.view_init(elev=22, azim=-62); ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    fig.savefig(ruta, dpi=100, facecolor=fig.get_facecolor())
