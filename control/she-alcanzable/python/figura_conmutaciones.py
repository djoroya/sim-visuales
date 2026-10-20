"""Conmutaciones por cuarto de la solución óptima frente a la amplitud (tmp/conmutaciones.json).
    python python/figura_conmutaciones.py <salida.png>"""
import json, sys, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
d = json.load(open("tmp/conmutaciones.json"))
NAVY, PANEL, PAL, SU, REJ = "#0d1f36", "#13294a", "#e8eef6", "#8fa3bd", "#2d4466"
COL = {2: "#a9d0ff", 3: "#3fb27f", 5: "#c9c23a", 7: "#f59e0b", 9: "#e8604f"}
plt.rcParams.update({"font.size": 10, "text.color": PAL, "axes.labelcolor": SU, "xtick.color": SU, "ytick.color": SU})
fig, ejes = plt.subplots(1, 3, figsize=(14, 4.2), dpi=110, facecolor=NAVY, sharey=False)
for ax, n in zip(ejes, [4, 5, 9]):
    ax.set_facecolor(PANEL); ax.grid(color=REJ, lw=.5)
    for s in ax.spines.values(): s.set_color(REJ)
    for i, nU in enumerate([2, 3, 5, 7, 9]):
        c = next(x for x in d if x["nArm"] == n and x["nU"] == nU)
        m = np.array([f["m"] for f in c["filas"]]); N = np.array([f["Nq"] for f in c["filas"]])
        ax.step(m, N + (i - 2) * 0.07, where="mid", color=COL[nU], lw=1.4, label=f"{nU} niveles")
    ax.axhline(n, color=PAL, ls="--", lw=1); ax.text(0.02, n - 0.35, "mínimo genérico N = n", color=PAL, fontsize=8.5)
    H = c["H"]; ax.set_title(f"n = {n}: fundamental + {', '.join(map(str, H[1:]))}", color=SU, fontsize=9.5)
    ax.set_xlabel("amplitud"); ax.set_ylabel("conmutaciones por cuarto"); ax.set_ylim(n - 0.8, n + 4.5)
ejes[0].legend(facecolor=PANEL, edgecolor=REJ, labelcolor=PAL, fontsize=8.5, loc="upper left")
fig.suptitle("Cuántas conmutaciones usa la solución óptima (las curvas van ligeramente desplazadas para que se vean)", color=PAL, fontsize=11)
fig.tight_layout(); fig.savefig(sys.argv[1], facecolor=NAVY); print(sys.argv[1])
