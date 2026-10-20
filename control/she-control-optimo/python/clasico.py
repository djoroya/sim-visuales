"""El método clásico frente al control óptimo.

Clásico: con simetría de cuarto de onda (solo senos), se fija la secuencia de niveles en
[0, π/2] y se buscan los ángulos 0 < φ1 < ... < φN < π/2 con Newton (aquí: mínimos cuadrados
con restricciones de orden, desde muchos arranques al azar). Se enumeran todas las secuencias
de N conmutaciones entre niveles contiguos que empiezan en 0, y para cada una se mira si tiene
solución exacta y cuál es su penalización ∫L(u).
"""
import itertools, sys, numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, "python"); import she

E = np.array([1, 5, 7, 11, 13.0]); U = np.linspace(-1, 1, 5); m = float(sys.argv[1]) if len(sys.argv) > 1 else 0.8
N = len(E)                                            # tantas conmutaciones como ecuaciones
rng = np.random.default_rng(0)

def b_de(phi, seq):
    """b_j de la onda con cuarto de onda: 4/(jπ) Σ s_k [cos(jφ_k) - cos(jφ_{k+1})]."""
    bordes = np.concatenate([[0], phi, [np.pi / 2]])
    return np.array([4 / (j * np.pi) * np.sum(seq * (np.cos(j * bordes[:-1]) - np.cos(j * bordes[1:]))) for j in E])

objetivo = np.zeros(N); objetivo[0] = m
secuencias = []
for pasos in itertools.product([-1, 1], repeat=N):
    idx = np.cumsum([2] + list(pasos))               # índice de nivel; 2 = el nivel 0
    if idx.min() < 0 or idx.max() > 4: continue
    secuencias.append(U[idx])
print(f"m = {m}: {len(secuencias)} secuencias posibles de {N} conmutaciones")
res = []
for seq in secuencias:
    soluciones = []
    for _ in range(60):
        x = np.sort(rng.uniform(0, np.pi / 2, N))
        # variables libres: incrementos positivos, para mantener el orden
        def f(z):
            phi = np.cumsum(np.exp(z)); return b_de(phi, seq) - objetivo
        z0 = np.log(np.diff(np.concatenate([[0], x])) + 1e-9)
        r = least_squares(f, z0, xtol=1e-14, ftol=1e-14, gtol=1e-14)
        phi = np.cumsum(np.exp(r.x))
        if np.abs(r.fun).max() < 1e-9 and phi[-1] < np.pi / 2:
            if not any(np.abs(phi - s).max() < 1e-6 for s in soluciones): soluciones.append(phi)
    for phi in soluciones:
        bordes = np.concatenate([[0], phi, [np.pi / 2]])
        L = 2 * np.sum(np.diff(bordes) * seq ** 2)        # ∫_0^π L(u) con L = u² en los niveles
        res.append((L, seq, phi))
print(f"{len({tuple(s) for _, s, _ in res})} secuencias con solución, {len(res)} soluciones distintas")
for L, seq, phi in sorted(res, key=lambda t: t[0])[:6]:
    print(f"  ∫L = {L:.4f}  niveles {seq.tolist()}  ángulos {np.round(np.degrees(phi), 2).tolist()}")
x0 = np.zeros(10); x0[5] = m
r = she.resuelve(x0, E, E, U, eps=1e-8)
bordes = np.concatenate([[0], r["ts"], [np.pi]])
print(f"control óptimo: ∫L = {np.sum(np.diff(bordes) * r['niveles'] ** 2):.4f}, {len(r['ts'])} conmutaciones en [0, π], "
      f"en [0, π/2]: {np.round(np.degrees(r['ts'][r['ts'] < np.pi / 2]), 2).tolist()}, niveles {r['niveles'][:len(r['ts'][r['ts'] < np.pi/2]) + 1].tolist()}")
