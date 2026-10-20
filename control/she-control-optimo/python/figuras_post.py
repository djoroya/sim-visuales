"""Figuras del artículo: el mapa de soluciones según la amplitud (3, 5 y 7 niveles), el residuo
al bajar ε y la imagen de la tarjeta.

    python python/figuras_post.py <salida>
"""
import sys
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
sys.path.insert(0, str(Path(__file__).parent)); import she

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
NAVY, PANEL, PAL, SU, AMB, AZUL, VERDE, ROJO, REJ = "#0d1f36", "#13294a", "#e8eef6", "#8fa3bd", "#f59e0b", "#4f9be8", "#3fb27f", "#e8604f", "#2d4466"
CMAP = LinearSegmentedColormap.from_list("niveles", [AZUL, "#1a345a", AMB])
E = [1, 5, 7, 11, 13]
plt.rcParams.update({"font.size": 10, "text.color": PAL, "axes.labelcolor": SU, "xtick.color": SU, "ytick.color": SU})


def estilo(ax):
    ax.set_facecolor(PANEL)
    for s in ax.spines.values(): s.set_color(REJ)


def x0_de(m):
    x0 = np.zeros(10); x0[5] = m; return x0


def mapa(nU, ms):
    """Onda en [0, π] para cada amplitud, en una rejilla de imagen; None si no hay solución."""
    U = np.linspace(-1, 1, nU); tau = np.linspace(0, np.pi, 900); img = np.full((len(ms), len(tau)), np.nan); q = None; lim = None
    for i, m in enumerate(ms):
        r = she.resuelve(x0_de(m), E, E, U, eps=1e-6, q0=q)
        if np.abs(r["residuo"]).max() > 1e-4:
            r2 = she.resuelve(x0_de(m), E, E, U, eps=1e-6)
            if np.abs(r2["residuo"]).max() < np.abs(r["residuo"]).max(): r = r2
        if np.abs(r["residuo"]).max() > 1e-4:
            lim = lim or m; q = None; continue
        lim = None                                   # el límite es donde dejan de existir todas
        q = r["q"]; b = np.concatenate([[0], r["ts"], [np.pi]])
        img[i] = r["niveles"][np.clip(np.searchsorted(b, tau, side="right") - 1, 0, len(r["niveles"]) - 1)]
        print(f"\r{nU} niveles m={m:.3f}", end="", flush=True)
    print()
    return img, lim


def fig_mapa():
    ms = np.linspace(0, 1.25, 251)
    fig, ejes = plt.subplots(1, 3, figsize=(11, 3.9), dpi=130, facecolor=NAVY, sharey=True)
    for ax, nU in zip(ejes, [3, 5, 7]):
        img, lim = mapa(nU, ms); estilo(ax)
        ax.imshow(img, origin="lower", aspect="auto", extent=[0, 180, 0, 1.25], cmap=CMAP, vmin=-1, vmax=1, interpolation="nearest")
        if lim: ax.axhspan(lim, 1.25, color="#0a1628"); ax.axhline(lim, color=ROJO, lw=1.2); ax.text(90, (lim + 1.25) / 2, f"sin solución (> {lim:.2f})", color=ROJO, ha="center", va="center", fontsize=8.5)
        ax.set_title(f"{nU} niveles (0, " + ", ".join(f"±{u:.2f}".rstrip("0").rstrip(".") for u in np.linspace(-1, 1, nU) if u > 0) + ")", color=SU, fontsize=10)
        ax.set_xlabel("ángulo en el semiperiodo (°)"); ax.set_xticks([0, 45, 90, 135, 180])
    ejes[0].set_ylabel("amplitud de la fundamental")
    fig.tight_layout(pad=0.6); fig.savefig(OUT / "she-mapa.png", facecolor=NAVY); plt.close(fig); print(OUT / "she-mapa.png")


def fig_epsilon():
    eps = np.logspace(-1, -8, 15); U = np.linspace(-1, 1, 5)
    fig, (a, b) = plt.subplots(1, 2, figsize=(11, 3.7), dpi=130, facecolor=NAVY)
    for m, col in [(0.3, VERDE), (0.6, AZUL), (0.8, AMB), (1.2, ROJO)]:
        res, nq = [], []; q = None
        for e in eps:
            r = she.resuelve(x0_de(m), E, E, U, eps=e, q0=q); q = r["q"]
            res.append(np.abs(r["residuo"]).max()); nq.append(np.linalg.norm(q))
        lab = f"amplitud {m}" + (" (inalcanzable)" if m > 1.17 else "")
        a.loglog(eps, res, "o-", color=col, ms=3.5, lw=1.6, label=lab); b.loglog(eps, nq, "o-", color=col, ms=3.5, lw=1.6, label=lab)
    for ax in (a, b): estilo(ax); ax.invert_xaxis(); ax.set_xlabel("ε (peso de la penalización)"); ax.grid(color=REJ, lw=.5)
    a.set_ylabel("error máximo en los armónicos"); b.set_ylabel("|q| (multiplicador)")
    a.legend(facecolor=PANEL, edgecolor=REJ, labelcolor=PAL, fontsize=8.5)
    a.set_title("Alcanzable: el error baja como ε, hasta eliminarlos", color=SU, fontsize=10)
    b.set_title("Inalcanzable: q crece como 1/ε y el error no baja", color=SU, fontsize=10)
    fig.tight_layout(pad=0.6); fig.savefig(OUT / "she-epsilon.png", facecolor=NAVY); plt.close(fig); print(OUT / "she-epsilon.png")


def fig_tarjeta():
    U = np.linspace(-1, 1, 5); r = she.resuelve(x0_de(0.8), E, E, U, eps=1e-8)
    fig = plt.figure(figsize=(12, 6.3), dpi=100, facecolor=NAVY)
    ax = fig.add_axes([0.04, 0.38, 0.92, 0.56]); ax.set_facecolor(NAVY); ax.axis("off")
    b = np.concatenate([[0], r["ts"], [np.pi]]); t, u = [], []
    for s, off in [(1, 0), (-1, np.pi)]:
        for k, lv in enumerate(r["niveles"]): t += [off + b[k], off + b[k + 1]]; u += [s * lv, s * lv]
    tt = np.linspace(0, 2 * np.pi, 400)
    ax.plot(tt, 0.8 * np.sin(tt), color=AMB, lw=2.5, ls=(0, (5, 4)))
    ax.plot(t, u, color=PAL, lw=3.2, solid_joinstyle="miter")
    ax.set_xlim(0, 2 * np.pi); ax.set_ylim(-1.15, 1.15)
    ax2 = fig.add_axes([0.04, 0.06, 0.92, 0.26]); ax2.set_facecolor(NAVY); ax2.axis("off")
    esp = [(h, abs(complex(*she.coeficientes(r["ts"], r["niveles"], [h], [h])))) for h in range(1, 50, 2)]
    for i, (h, amp) in enumerate(esp):
        col = AMB if h == 1 else VERDE if h in E else SU
        ax2.bar(i, max(amp, 0.012), color=col, width=0.6)
        if h in E[1:]: ax2.plot(i, 0.05, "o", mfc="none", mec=VERDE, ms=11, mew=2)
    ax2.set_ylim(0, 0.9)
    fig.savefig(OUT / "she-tarjeta.png", facecolor=NAVY); plt.close(fig); print(OUT / "she-tarjeta.png")


if __name__ == "__main__":
    if len(sys.argv) > 2: [globals()[f]() for f in sys.argv[2:]]
    else: fig_tarjeta(); fig_epsilon(); fig_mapa()
