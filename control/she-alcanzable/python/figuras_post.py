"""Figuras del artículo: el conjunto alcanzable en 2D, los mapas de dos niveles y la tarjeta.
    python python/figuras_post.py <salida>      (necesita tmp/dos_niveles.json de tmp/dos_niveles.mjs)
"""
import json, sys
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
sys.path.insert(0, str(Path(__file__).parent)); import alcanzable as al
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
NAVY, PANEL, PAL, SU, AMB, AZUL, VERDE, ROJO, REJ = "#0d1f36", "#13294a", "#e8eef6", "#8fa3bd", "#f59e0b", "#4f9be8", "#3fb27f", "#e8604f", "#2d4466"
plt.rcParams.update({"font.size": 10, "text.color": PAL, "axes.labelcolor": SU, "xtick.color": SU, "ytick.color": SU})

def estilo(ax):
    ax.set_facecolor(PANEL); ax.grid(color=REJ, lw=.5)
    for s in ax.spines.values(): s.set_color(REJ)

def fig_alcanzable():
    fig, ejes = plt.subplots(1, 3, figsize=(13, 4.3), dpi=110, facecolor=NAVY)
    for ax, h in zip(ejes, [3, 5, 7]):
        F = al.frontera_2d([], [1, h]); estilo(ax)
        ax.fill(F[:, 0], F[:, 1], color=AZUL, alpha=.35, lw=0); ax.plot(*np.vstack([F, F[:1]]).T, color=AZUL, lw=1.8)
        ax.plot([4 / np.pi], [4 / (h * np.pi)], "o", color=AMB, ms=6); ax.annotate("onda cuadrada", (4 / np.pi, 4 / (h * np.pi)), xytext=(-70, 8), textcoords="offset points", color=AMB, fontsize=8.5)
        # máxima fundamental con el armónico eliminado (b_h = 0)
        mm, _ = al.m_max([], [1, h], np.array([1.0, 0.0]))
        ax.plot([-mm, mm], [0, 0], color=VERDE, lw=2.4); ax.plot([mm], [0], "o", color=VERDE, ms=6)
        ax.annotate(f"máx. con b{h} = 0: {mm:.3f}", (mm, 0), xytext=(-110, -18), textcoords="offset points", color=VERDE, fontsize=8.5)
        ax.set_xlabel("b₁ (fundamental)"); ax.set_ylabel(f"b{h}".translate(str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")))
        ax.set_title(f"armónicos 1 y {h}", color=SU, fontsize=10)
    fig.suptitle("Todo lo que se puede conseguir con una onda entre −1 y 1: un conjunto convexo", color=PAL, fontsize=11)
    fig.tight_layout(); fig.savefig(OUT / "alcanzable-2d.png", facecolor=NAVY); plt.close(fig); print(OUT / "alcanzable-2d.png")

def fig_dos_niveles():
    d = json.load(open("tmp/dos_niveles.json"))
    fig, ejes = plt.subplots(2, 2, figsize=(12, 6.4), dpi=110, facecolor=NAVY, sharex=True, sharey=True)
    for i, H in enumerate(["1,3,5,7,9", "1,7,9,11,13"]):
        for j, s in enumerate(["minus", "plus"]):
            ax = ejes[i, j]; ax.set_facecolor("#0a1628")
            for f in d[f"{H}|{s}"]:
                if not f["ok"]: continue
                b = np.concatenate([[0], f["ts"], [np.pi]])
                for k, lv in enumerate(f["niveles"]):
                    a0, a1 = min(b[k], np.pi / 2), min(b[k + 1], np.pi / 2)
                    if a1 > a0: ax.fill_between([f["m"] - 0.005, f["m"] + 0.005], a0, a1, color=AMB if lv > 0 else "#1a345a", lw=0)
            ax.set_ylim(0, np.pi / 2); ax.set_xlim(-1, 1)
            for sp in ax.spines.values(): sp.set_color(REJ)
            ax.set_title(f"eliminar {H.split(',', 1)[1].replace(',', ', ')}  ·  penalización {'−u' if s == 'minus' else '+u'}", color=SU, fontsize=9.5)
            if i == 1: ax.set_xlabel("b₁ (fundamental)")
            if j == 0: ax.set_ylabel("ángulo en el cuarto de periodo (rad)")
    fig.suptitle("Dos niveles (−1 en azul, +1 en ámbar): la penalización lineal da las dos familias simétricas", color=PAL, fontsize=11)
    fig.tight_layout(); fig.savefig(OUT / "dos-niveles.png", facecolor=NAVY); plt.close(fig); print(OUT / "dos-niveles.png")

def fig_tarjeta():
    F = al.frontera_2d([], [1, 5]); C = np.vstack([F, F[:1]])
    fig = plt.figure(figsize=(12, 6.3), dpi=100, facecolor=NAVY); ax = fig.add_axes([0.05, 0.06, 0.9, 0.88]); ax.set_facecolor(NAVY); ax.axis("off")
    ax.fill(F[:, 0], F[:, 1], color=AZUL, alpha=.3, lw=0); ax.plot(C[:, 0], C[:, 1], color=AZUL, lw=3.5)
    mm, _ = al.m_max([], [1, 5], np.array([1.0, 0.0])); ax.plot([-mm, mm], [0, 0], color=VERDE, lw=3.5); ax.plot([mm], [0], "o", color=VERDE, ms=13)
    # un objetivo imposible y la recta que lo separa (el certificado)
    p = np.array([0.95, 0.95]); ax.plot(*p, "o", color=ROJO, ms=13)
    th = np.linspace(0, 2 * np.pi, 720, endpoint=False); W = np.stack([np.cos(th), np.sin(th)], 1)
    h = np.max(W @ C.T, axis=1); k = np.argmax(W @ p - h); w = W[k]; t = np.array([-w[1], w[0]])
    q0 = p - (w @ p - h[k]) * w; ax.plot(*np.stack([q0 - 0.9 * t, q0 + 0.9 * t]).T, color=ROJO, lw=2.2, ls="--")
    ax.set_xlim(-1.45, 1.45); ax.set_ylim(-1.45, 1.45)
    fig.savefig(OUT / "alcanzable-tarjeta.png", facecolor=NAVY); plt.close(fig); print(OUT / "alcanzable-tarjeta.png")


if __name__ == "__main__":
    for f in (sys.argv[2:] or ["fig_alcanzable", "fig_dos_niveles", "fig_tarjeta"]): globals()[f]()
