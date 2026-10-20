"""Figuras del artículo del MPC en tiempo real: tiras de fotogramas de meter y sacar el
rebaño (de las ejecuciones reproducibles de web/prueba) y la imagen de la tarjeta.

    python python/figuras_post.py <salida>
"""
import json, sys
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RAIZ = Path(__file__).resolve().parents[1]; OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
NAVY, CAMPO, OV, BO, PAL, SU, AMB = "#0d1f36", "#13294a", "#aebfd4", "#5b6f8a", "#e8eef6", "#8fa3bd", "#f59e0b"
PERROS = ["#f59e0b", "#4f9be8", "#3fb27f"]
CAJA = (-20, 140, -20, 80); PUERTA = [-20, 21, -20, 39]

def panel(ax, tray, i, seg, obj, rotulo, zoom=None):
    ax.set_facecolor(CAMPO); ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_color("#2d4466")
    x0, x1, y0, y1 = zoom or (-300, 300, -220, 220); ax.set_xlim(x0, x1); ax.set_ylim(y0, y1)
    for q in seg: ax.plot([q[0], q[2]], [q[1], q[3]], color=PAL, lw=2.5, solid_capstyle="round")
    ax.plot([PUERTA[0], PUERTA[2]], [PUERTA[1], PUERTA[3]], color=AMB, lw=1.2, ls=(0, (3, 3)))
    ax.add_patch(plt.Circle(obj, 9, fill=False, ec=AMB, lw=1.8)); ax.plot(*obj, "+", color=AMB, ms=8, mew=1.6)
    X = np.array(tray[i]["X"]).reshape(-1, 2); Y = np.array(tray[i]["Y"]).reshape(-1, 2)
    for j in range(3):
        h = np.array([np.array(tray[k]["Y"]).reshape(-1, 2)[j] for k in range(max(0, i - 20), i + 1)])
        ax.plot(h[:, 0], h[:, 1], color=PERROS[j], lw=1.3, alpha=.45)
    ax.scatter(X[:, 0], X[:, 1], s=9, c=OV, edgecolors=BO, linewidths=.3, zorder=3)
    for j in range(3): ax.plot(*Y[j], "o", ms=7, color=PERROS[j], mec=NAVY, mew=1.2, zorder=4)
    ax.set_title(rotulo, color=SU, fontsize=10, pad=4)

def dentro(tray, i):
    X = np.array(tray[i]["X"]).reshape(-1, 2)
    return int(((X[:, 0] > CAJA[0] + 2) & (X[:, 0] < CAJA[1] - 2) & (X[:, 1] > CAJA[2] + 2) & (X[:, 1] < CAJA[3] - 2)).sum())

def tira(tray, seg, obj, idx, nombre, txt):
    # 2 x 3 con el campo entero: en el ancho del artículo se lee mejor que seis en fila
    fig, ejes = plt.subplots(2, 3, figsize=(11, 5.9), dpi=130, facecolor=NAVY)
    for ax, i in zip(ejes.ravel(), idx): panel(ax, tray, i, seg, obj, f"t = {(i + 1) * 2.5:.0f}  ·  {txt(tray, i)}")
    fig.tight_layout(pad=0.6, h_pad=1.2); fig.savefig(OUT / nombre, facecolor=NAVY); plt.close(fig); print(OUT / nombre)

e = json.load(open(RAIZ / "tmp/v_entrada.json")); t = json.load(open(RAIZ / "tmp/traza_corral_12.json"))
seg = t["seg"][:-4]
n = len(e); tira(e, seg, t["obj"], [0, n // 6, n // 3, n // 2, 2 * n // 3, n - 1], "mpc-meter.png", lambda tr, i: f"dentro {dentro(tr, i)}/80")
s = json.load(open(RAIZ / "tmp/v_salida.json"))
tira(s["tray"], s["seg"], s["obj"], [0, 30, 60, 100, 160, 239], "mpc-sacar.png", lambda tr, i: f"en el corral {dentro(tr, i)}")
# tarjeta: un fotograma de meterlas, 1200x630
fig = plt.figure(figsize=(12, 6.3), dpi=100, facecolor=NAVY); ax = fig.add_axes([0, 0, 1, 1])
panel(ax, e, n // 3, seg, t["obj"], "", (-230, 230, -125, 125)); ax.set_title("")
fig.savefig(OUT / "mpc-tarjeta.png", facecolor=NAVY); print(OUT / "mpc-tarjeta.png")
