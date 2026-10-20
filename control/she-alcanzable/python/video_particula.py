"""Animación: la partícula (lo que falta de b1 y bh) dentro de la caja que se encoge, con la
regla óptima (la del dual) y la perezosa; debajo, la onda que se va dibujando.
    python python/video_particula.py tmp/particula.json salida.mp4
"""
import json, sys, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FFMpegWriter
d = json.load(open(sys.argv[1])); out = sys.argv[2]
NAVY, PANEL, PAL, SU, AMB, AZUL, VERDE, ROJO, REJ = "#0d1f36", "#13294a", "#e8eef6", "#8fa3bd", "#f59e0b", "#4f9be8", "#3fb27f", "#e8604f", "#2d4466"
COLN = {-1.0: "#4f9be8", 0.0: "#8fa3bd", 1.0: "#f59e0b"}
plt.rcParams.update({"font.size": 10, "text.color": PAL, "axes.labelcolor": SU, "xtick.color": SU, "ytick.color": SU})
K = d["K"]; h = d["h"]; reglas = [("óptima", "Regla óptima (el dual): una brújula q fija"), ("perezosa", "Regla perezosa: aguantar hasta la pared")]
fig = plt.figure(figsize=(12.8, 7.2), dpi=100, facecolor=NAVY)
ejes = [fig.add_axes([0.05 + 0.5 * i, 0.33, 0.4, 0.58]) for i in range(2)]
ondas = [fig.add_axes([0.05 + 0.5 * i, 0.06, 0.4, 0.17]) for i in range(2)]
w = FFMpegWriter(fps=24, bitrate=3500)
n = len(d["cajas"])
with w.saving(fig, out, dpi=100):
    for f in list(range(n)) + [n - 1] * 36:
        caja = d["cajas"][f]; k = caja["k"]; P = np.array(caja["poli"] + caja["poli"][:1])
        idx = k // 10
        for (clave, tit), ax, aw in zip(reglas, ejes, ondas):
            ax.clear(); ax.set_facecolor(PANEL)
            for s in ax.spines.values(): s.set_color(REJ)
            P0 = np.array(d["cajas"][0]["poli"] + d["cajas"][0]["poli"][:1]); ax.plot(P0[:, 0], P0[:, 1], color=REJ, lw=1)
            ax.fill(P[:, 0], P[:, 1], color=AZUL, alpha=.25, lw=0); ax.plot(P[:, 0], P[:, 1], color=AZUL, lw=1.6)
            T = np.array(d[clave]["tray"][: idx + 1]); us = d[clave]["us"][: idx + 1]
            for a in range(len(T) - 1): ax.plot(T[a:a + 2, 0], T[a:a + 2, 1], color=COLN.get(round(us[min(a, len(us) - 1)], 3), PAL), lw=1.6)
            ax.plot(*T[-1], "o", color=PAL, ms=8, mec=NAVY); ax.plot(0, 0, "+", color=PAL, ms=10)
            ax.set_xlim(-1.35, 1.35); ax.set_ylim(-1.35, 1.35); ax.set_aspect("equal")
            ax.set_xlabel("lo que falta de b₁"); ax.set_ylabel(f"lo que falta de b{h}"); ax.set_title(tit, color=PAL, fontsize=11)
            aw.clear(); aw.set_facecolor(PANEL)
            for s in aw.spines.values(): s.set_color(REJ)
            uu = np.array(d[clave]["us"]); tt = (np.arange(len(uu)) + 0.5) * np.pi / len(uu)
            aw.step(tt[: idx + 1], uu[: idx + 1], where="mid", color=PAL, lw=1.4); aw.set_xlim(0, np.pi); aw.set_ylim(-1.3, 1.3)
            aw.set_xticks([0, np.pi / 2, np.pi], ["0", "π/2", "π"]); aw.set_yticks([-1, 0, 1])
            nc = int(np.sum(np.diff(uu[: idx + 1]) != 0)) if idx > 0 else 0
            aw.set_title(f"la onda · {nc} conmutaciones", color=SU, fontsize=9.5)
        fig.suptitle(f"La partícula en la caja que se encoge — t = {k / K:.0%} del semiperiodo  (3 niveles, fundamental 0,8, 5.º a cero)", color=PAL, fontsize=12)
        w.grab_frame()
print(out)
