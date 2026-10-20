"""Lo alcanzable con N conmutaciones por cuarto de periodo, según el número de niveles.

Simetría de cuarto de onda, solo senos: b_h = 4/(hπ) [ s0 + Σ_k (s_k - s_{k-1}) cos(h θ_k) ],
0 < θ1 < … < θN < π/2, y cada conmutación sube o baja un nivel. Se muestrean los ángulos para
todas las secuencias posibles y se pinta la ocupación en el plano (b1, bh), sobre el contorno
del conjunto alcanzable completo (infinitas conmutaciones; igual para cualquier número de
niveles).
    python python/pocas_conmutaciones.py <salida.png> [h]
"""
import itertools, sys
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
sys.path.insert(0, str(Path(__file__).parent)); import alcanzable as al

salida = sys.argv[1]; h = int(sys.argv[2]) if len(sys.argv) > 2 else 5
NAVY, PANEL, PAL, SU, AZUL, REJ = "#0d1f36", "#13294a", "#e8eef6", "#8fa3bd", "#4f9be8", "#2d4466"
COL = {2: "#f59e0b", 3: "#3fb27f", 5: "#c9c23a"}
plt.rcParams.update({"font.size": 9.5, "text.color": PAL, "axes.labelcolor": SU, "xtick.color": SU, "ytick.color": SU})
rng = np.random.default_rng(3); LIM, R = 1.35, 420

def secuencias(L, N):
    U = np.linspace(-1, 1, L); out = []
    for i0 in range(L):
        for pasos in itertools.product([-1, 1], repeat=N):
            idx = np.cumsum([i0] + list(pasos))
            if idx.min() >= 0 and idx.max() < L: out.append(U[idx])
    return out

def ocupacion(L, N, total=6_000_000):
    S = secuencias(L, N); M = max(20000, total // len(S)); occ = np.zeros((R, R), bool)
    for s in S:
        for _ in range(4):                              # por tandas, para no agotar memoria
            th = np.sort(rng.uniform(0, np.pi / 2, (M // 4, N)), axis=1); ds = np.diff(s)
            b1 = 4 / np.pi * (s[0] + (ds * np.cos(th)).sum(1)); bh = 4 / (h * np.pi) * (s[0] + (ds * np.cos(h * th)).sum(1))
            ix = np.clip(((b1 + LIM) / (2 * LIM) * (R - 1)).round().astype(int), 0, R - 1)
            iy = np.clip(((bh + LIM) / (2 * LIM) * (R - 1)).round().astype(int), 0, R - 1)
            occ[iy, ix] = True
    return occ

F = al.frontera_2d([], [1, h]); C = np.vstack([F, F[:1]])
NS = [1, 2, 3, 4, 6]
fig, ejes = plt.subplots(3, len(NS), figsize=(15, 9.3), dpi=110, facecolor=NAVY, sharex=True, sharey=True)
for i, L in enumerate([2, 3, 5]):
    for j, N in enumerate(NS):
        ax = ejes[i, j]; ax.set_facecolor(PANEL)
        for s in ax.spines.values(): s.set_color(REJ)
        occ = ocupacion(L, N)
        ax.imshow(np.where(occ, 1.0, np.nan), origin="lower", extent=[-LIM, LIM, -LIM, LIM], cmap=ListedColormap([COL[L]]), interpolation="nearest")
        ax.plot(C[:, 0], C[:, 1], color=AZUL, lw=1.2)
        ax.set_xlim(-LIM, LIM); ax.set_ylim(-LIM, LIM); ax.set_aspect("equal")
        if i == 0: ax.set_title(f"{N} conmutaci{'ones' if N > 1 else 'ón'} por cuarto", color=PAL, fontsize=10.5)
        if j == 0: ax.set_ylabel(f"{L} niveles\n\nb{h}", fontsize=10.5)
        if i == 2: ax.set_xlabel("b₁")
        print(f"{L} niveles, N={N}", flush=True)
fig.suptitle(f"Lo que se alcanza con pocas conmutaciones (relleno) frente al conjunto completo (contorno azul), armónicos 1 y {h}", color=PAL, fontsize=11.5)
fig.tight_layout(); fig.savefig(salida, facecolor=NAVY); print(salida)
