"""Conjunto alcanzable de la SHE: R = { ∫_0^π D(τ) u(τ) dτ : u ∈ [-1, 1] }.

Es convexo (y por el teorema de Lyapunov, el mismo con u ∈ {-1, 1}: cualquier número de
niveles que incluya ±1 alcanza lo mismo). Su función soporte es h(w) = ∫ |w·D(τ)| dτ, y su
frontera en la dirección w la marca u = sign(w·D). Un objetivo x0 es alcanzable si y solo si
w·x0 <= h(w) para toda w. La mayor amplitud alcanzable en la dirección e:
    m_max = min { h(w) : w·e = 1 }        (programa lineal tras discretizar τ)
"""
import numpy as np
from scipy.optimize import linprog


def matrizD(tau, Ea, Eb):
    return (2 / np.pi) * np.concatenate([np.cos(np.outer(Ea, tau)), np.sin(np.outer(Eb, tau))])


def m_max(Ea, Eb, e, K=20000):
    """min ∫|w·D| s.t. w·e = 1, con regla del punto medio. Variables [w (n), t (K)]."""
    tau = (np.arange(K) + 0.5) * np.pi / K; dt = np.pi / K
    D = matrizD(tau, np.asarray(Ea, float), np.asarray(Eb, float)); n = D.shape[0]
    c = np.concatenate([np.zeros(n), np.full(K, dt)])
    # |w·D_k| <= t_k  ->  D_k·w - t_k <= 0,  -D_k·w - t_k <= 0
    from scipy.sparse import hstack, vstack, identity, csr_matrix
    A = vstack([hstack([csr_matrix(D.T), -identity(K)]), hstack([csr_matrix(-D.T), -identity(K)])])
    r = linprog(c, A_ub=A, b_ub=np.zeros(2 * K), A_eq=np.concatenate([e, np.zeros(K)])[None], b_eq=[1],
                bounds=[(None, None)] * n + [(0, None)] * K, method="highs")
    return r.fun, r.x[:n]


def frontera_2d(Ea, Eb, n=720, K=40000):
    """Frontera de R en 2D: para cada dirección w, el punto ∫ D sign(w·D)."""
    tau = (np.arange(K) + 0.5) * np.pi / K; dt = np.pi / K
    D = matrizD(tau, np.asarray(Ea, float), np.asarray(Eb, float))
    th = np.linspace(0, 2 * np.pi, n, endpoint=False); W = np.stack([np.cos(th), np.sin(th)])
    S = np.sign(W.T @ D)                       # n x K
    return (S @ D.T) * dt                       # n x 2


if __name__ == "__main__":
    E = [1, 5, 7, 11, 13]
    e = np.zeros(10); e[5] = 1                  # b1, con a1 = 0 y el resto 0 (el caso del artículo)
    mm, w = m_max(E, E, e); print(f"artículo (a y b de 1, 5, 7, 11, 13): m_max = {mm:.4f}")
    for H in [[1, 5, 7, 11, 13], [1, 3, 5, 7, 9], [1, 3, 9, 13, 17], [1, 5, 7, 9, 11], [1, 7, 9, 11, 13], [1], [1, 5], [1, 5, 7]]:
        e = np.zeros(len(H)); e[0] = 1
        mm, w = m_max([], H, e); print(f"solo senos {H}: m_max = {mm:.4f}   (onda cuadrada: 4/π = {4/np.pi:.4f})")
