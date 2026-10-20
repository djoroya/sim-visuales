"""SHE con penalización de variación total (convexa): menos conmutaciones.

Cuarto de onda, solo senos: u(τ) en [0, π/2], b_h = 4/π ∫ u sin(hτ) dτ.
    min  ε ∫ L(u) dτ + λ Σ |u_{k+1} - u_k|
    s.a. b_1 = m, b_h = 0 (h eliminados),  -1 <= u <= 1
L = parábola a trozos en los niveles. Discretizado en K puntos es un programa lineal; la solución
cae en un vértice (casi todas las muestras en un nivel). Se extrae la secuencia de niveles y los
ángulos, y se pulen con Newton sobre las ecuaciones clásicas para una solución exacta.
"""
import numpy as np
from scipy.optimize import linprog, least_squares
from scipy.sparse import lil_matrix, csr_matrix, hstack, vstack, identity, diags

def resuelve_tv(H, U, m, eps=1e-2, lam=0.0, K=1200):
    H = np.asarray(H, float); U = np.sort(np.asarray(U, float)); n = len(H)
    dt = (np.pi / 2) / K; tau = (np.arange(K) + 0.5) * dt
    A = (4 / np.pi) * np.sin(np.outer(H, tau)) * dt                  # n x K
    obj = np.zeros(n); obj[0] = m
    # variables: u (K), s (K) epígrafe de L, t (K-1) |Δu|
    nv = 3 * K - 1
    c = np.concatenate([np.zeros(K), np.full(K, eps * dt), np.full(K - 1, lam)])
    filas = []
    # s_k >= recta de L entre niveles consecutivos: a u_k + b - s_k <= 0
    pend = U[:-1] + U[1:]; ords = U[:-1] ** 2 - pend * U[:-1]
    I = identity(K, format="csr")
    for a, b in zip(pend, ords):
        filas.append((hstack([a * I, -I, csr_matrix((K, K - 1))]), np.full(K, -b)))
    # |u_{k+1} - u_k| <= t_k
    Dd = diags([-np.ones(K - 1), np.ones(K - 1)], [0, 1], shape=(K - 1, K), format="csr"); It = identity(K - 1, format="csr")
    filas.append((hstack([Dd, csr_matrix((K - 1, K)), -It]), np.zeros(K - 1)))
    filas.append((hstack([-Dd, csr_matrix((K - 1, K)), -It]), np.zeros(K - 1)))
    A_ub = vstack([f[0] for f in filas]).tocsr(); b_ub = np.concatenate([f[1] for f in filas])
    A_eq = hstack([csr_matrix(A), csr_matrix((n, K)), csr_matrix((n, K - 1))]).tocsr()
    bounds = [(-1, 1)] * K + [(None, None)] * K + [(0, None)] * (K - 1)
    r = linprog(c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=obj, bounds=bounds, method="highs")
    if r.status != 0: return None
    return tau, r.x[:K]

def a_escalera(tau, u, U):
    """Secuencia de niveles y ángulos aproximados: cada muestra al nivel más cercano; los cambios."""
    U = np.sort(U); idx = np.abs(u[:, None] - U[None]).argmin(1); niv = [U[idx[0]]]; ang = []
    for k in range(1, len(u)):
        if idx[k] != idx[k - 1]:
            ang.append(0.5 * (tau[k] + tau[k - 1])); niv.append(U[idx[k]])
    return np.array(niv), np.array(ang)

def pule(H, niv, ang, m):
    """Newton sobre las ecuaciones clásicas con la secuencia fija (ángulos ordenados)."""
    H = np.asarray(H, float); obj = np.zeros(len(H)); obj[0] = m
    if len(ang) == 0: return None
    f = lambda th: np.array([4 / (h * np.pi) * (niv[0] + np.sum(np.diff(niv) * np.cos(h * th))) for h in H]) - obj
    r = least_squares(f, ang, bounds=(0, np.pi / 2), xtol=1e-15, ftol=1e-15, gtol=1e-15)
    th = r.x
    if np.abs(r.fun).max() < 1e-9 and np.all(np.diff(th) > 1e-9): return th
    return None

def distorsion(niv, th, hmax=49):
    hs = np.arange(1, hmax + 1, 2)
    b = np.array([4 / (h * np.pi) * (niv[0] + np.sum(np.diff(niv) * np.cos(h * th))) for h in hs])
    nt = [abs(v) for h, v in zip(hs, b) if h > 1 and h % 3]
    return np.sqrt(np.sum(np.square(nt))) / abs(b[0])

if __name__ == "__main__":
    import sys
    nU = int(sys.argv[1]) if len(sys.argv) > 1 else 5; nArm = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    H = [1]; h = 5
    while len(H) < nArm:
        if h % 3: H.append(h)
        h += 2
    U = np.linspace(-1, 1, nU)
    print(f"{nU} niveles, armónicos {H} (mínimo genérico N = {nArm})")
    for lam in [0.0, 1e-3, 1e-2, 3e-2, 1e-1]:
        Ns, Nexactas, dist = [], 0, []
        for m in np.arange(0.1, 1.11, 0.1):
            r = resuelve_tv(H, U, m, lam=lam)
            if r is None: Ns.append(None); continue
            niv, ang = a_escalera(*r, U); th = pule(H, niv, ang, m)
            Ns.append(len(ang))
            if th is not None: Nexactas += 1; dist.append(distorsion(niv, th))
        vals = [v for v in Ns if v is not None]
        print(f"λ={lam:<6} conmutaciones por cuarto: {Ns} | media {np.mean(vals):.2f} | en el mínimo {sum(v == nArm for v in vals)}/{len(vals)} | exactas tras pulir {Nexactas} | distorsión media {100*np.mean(dist) if dist else float('nan'):.1f} %")
