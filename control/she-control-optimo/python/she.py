"""Eliminación selectiva de armónicos (SHE) por control óptimo: referencia en Python.

Problema (Oroya-Villalta, Esteve-Yagüe y Biccari, Appl. Math. Optim. 86, 2022):
buscar u(τ) en [0, π] (simetría de media onda: u(τ + π) = -u(τ)) que tome valores solo en un
conjunto finito de niveles U y cuyos coeficientes de Fourier

    a_i = 2/π ∫_0^π u cos(iτ) dτ   (i en Ea),     b_j = 2/π ∫_0^π u sin(jτ) dτ   (j en Eb)

sean los objetivos x0 = [aT, bT]. Como control óptimo:

    min_{u ∈ [-1, 1]}  |x0 - ∫ D u|²  +  ε ∫ L(u),      D(τ) = 2/π [cos(Ea τ); sin(Eb τ)]

con L la interpolación lineal a trozos de u² en los niveles: por el principio del máximo, el
control óptimo solo toma valores de U.

Aquí se resuelve por el DUAL. Con p = ε q, el control óptimo es

    u_q(τ) = argmin_{u ∈ [-1, 1]}  m(τ) u + L(u),        m(τ) = q · D(τ)

(un nivel de U según en qué tramo cae -m(τ)), y q maximiza la función cóncava

    h(q) = -q · x0 - ε |q|² / 4 + ∫_0^π ψ(q · D(τ)) dτ,   ψ(m) = min_u m u + L(u)

cuyo gradiente es G(q) - x0 - ε q / 2 con G(q) = ∫ D u_q. El residuo en el óptimo es
x(π) = x0 - G(q) = -ε q / 2. Los puntos de conmutación (donde m(τ) cruza un umbral) se
calculan de forma exacta, y con ellos G(q) analítico y el hessiano: un Newton de 2N incógnitas.
"""
import numpy as np


def umbrales(U):
    """Nivel u_k es óptimo cuando -m está entre c_{k-1} y c_k, con c_k = u_k + u_{k+1}."""
    U = np.sort(np.asarray(U, float))
    return U, U[:-1] + U[1:]


def nivel(m, U, c):
    """argmin_u m u + L(u) para cada m (vectorizado): índice del nivel."""
    return np.searchsorted(c, -np.asarray(m), side="left")


def matrizD(tau, Ea, Eb):
    return (2 / np.pi) * np.concatenate([np.cos(np.outer(Ea, tau)), np.sin(np.outer(Eb, tau))])


def matrizDp(tau, Ea, Eb):
    """dD/dτ"""
    return (2 / np.pi) * np.concatenate([-Ea[:, None] * np.sin(np.outer(Ea, tau)), Eb[:, None] * np.cos(np.outer(Eb, tau))])


def primitivaD(tau, Ea, Eb):
    """∫ D dτ"""
    return (2 / np.pi) * np.concatenate([np.sin(np.outer(Ea, tau)) / Ea[:, None], -np.cos(np.outer(Eb, tau)) / Eb[:, None]])


def conmutaciones(q, Ea, Eb, U, c, nmuestras=4000):
    """Puntos de [0, π] donde m(τ) = q·D(τ) cruza un umbral -c_k, y el nivel en cada tramo.
    Muestreo fino más los extremos de m entre muestras (si no, un pulso más estrecho que una
    muestra, justo cuando nace o muere, pasaría sin verse); bisección en cada tramo monótono."""
    tau = np.linspace(0, np.pi, nmuestras + 1)
    m = q @ matrizD(tau, Ea, Eb)
    mf = lambda t: q @ matrizD(np.array([t]), Ea, Eb)[:, 0]
    dmf = lambda t: q @ matrizDp(np.array([t]), Ea, Eb)[:, 0]
    T, Mv = [tau[0]], [m[0]]
    for i in range(1, nmuestras + 1):
        if i < nmuestras and (m[i] - m[i - 1]) * (m[i + 1] - m[i]) < 0:
            a, b = tau[i - 1], tau[i + 1]; da = dmf(a)
            for _ in range(60):
                x = 0.5 * (a + b); dx = dmf(x)
                if (dx > 0) == (da > 0): a, da = x, dx
                else: b = x
            te = 0.5 * (a + b)
            if T[-1] < te < tau[i]: T += [te, tau[i]]; Mv += [mf(te), m[i]]
            elif tau[i] < te < tau[i + 1]: T += [tau[i], te]; Mv += [m[i], mf(te)]
            else: T.append(tau[i]); Mv.append(m[i])
        else:
            T.append(tau[i]); Mv.append(m[i])
    k = nivel(np.array(Mv), U, c)
    ts = []
    for i in np.nonzero(k[1:] != k[:-1])[0]:
        lo, hi = sorted((k[i], k[i + 1]))
        for kk in range(lo, hi):
            f = lambda t: mf(t) + c[kk]
            x0, x1 = T[i], T[i + 1]; fa = f(x0)
            for _ in range(60):
                xm = 0.5 * (x0 + x1)
                if np.sign(f(xm)) == np.sign(fa): x0 = xm
                else: x1 = xm
            ts.append(0.5 * (x0 + x1))
    ts = np.array(sorted(ts))
    bordes = np.concatenate([[0.0], ts, [np.pi]])
    medios = 0.5 * (bordes[:-1] + bordes[1:])
    niveles = U[nivel(q @ matrizD(medios, Ea, Eb), U, c)]
    return ts, bordes, niveles


def G(q, Ea, Eb, U, c):
    ts, bordes, niveles = conmutaciones(q, Ea, Eb, U, c)
    P = primitivaD(bordes, Ea, Eb)
    g = (P[:, 1:] - P[:, :-1]) @ niveles
    # hessiano de G: -Σ_s Δu_s / m'(τ_s) D(τ_s) D(τ_s)^T,  Δu_s = u_izq - u_der
    H = np.zeros((len(q), len(q)))
    if len(ts):
        Ds, Dps = matrizD(ts, Ea, Eb), matrizDp(ts, Ea, Eb)
        mp = q @ Dps
        du = niveles[:-1] - niveles[1:]
        w = -du / np.where(np.abs(mp) < 1e-12, 1e-12, mp)
        H = (Ds * w) @ Ds.T
    return g, H, ts, niveles


def psi_integral(q, Ea, Eb, U, c):
    """∫ ψ(q·D) = ∫ m u_q + L(u_q), con L(u_k) = u_k² en los niveles."""
    ts, bordes, niveles = conmutaciones(q, Ea, Eb, U, c)
    P = primitivaD(bordes, Ea, Eb)
    return q @ ((P[:, 1:] - P[:, :-1]) @ niveles) + np.sum(np.diff(bordes) * niveles ** 2)


def resuelve_eps(x0, Ea, Eb, U, eps=1e-4, q0=None, tol=1e-11, maxit=200):
    """Newton regularizado (Levenberg) sobre el dual cóncavo h(q). Devuelve q, conmutaciones,
    niveles, residuo x(π) y la brecha de dualidad (coste primal - dual), que es 0 en el óptimo."""
    Ea = np.asarray(Ea, float); Eb = np.asarray(Eb, float)
    U, c = umbrales(U)
    n = len(Ea) + len(Eb)
    # q = 0 es un punto anguloso de h (m ≡ 0 cae justo en un umbral si 0 está entre dos
    # niveles): se arranca en la dirección de subida natural, -x0, con una escala O(1)
    if q0 is None: q0 = -5 * x0 / max(np.linalg.norm(x0), 1e-9) + 1e-3 * np.cos(np.arange(n))
    q = np.array(q0, float)
    h = lambda q: -q @ x0 - eps * q @ q / 4 + psi_integral(q, Ea, Eb, U, c)
    hq = h(q); mu = 1e-3
    for it in range(maxit):
        g, HG, ts, niveles = G(q, Ea, Eb, U, c)
        grad = g - x0 - eps * q / 2
        if np.linalg.norm(grad) < tol: break
        A = -(HG - eps / 2 * np.eye(n))                   # semidefinida positiva
        while True:
            d = np.linalg.solve(A + mu * np.eye(n), grad)
            qn = q + d; hn = h(qn)
            # mejora real frente a la prevista por el modelo cuadrático
            pred = d @ grad - 0.5 * d @ A @ d
            rho = (hn - hq) / pred if pred > 0 else -1
            if rho > 1e-4: mu = max(mu / 3, 1e-12); break
            mu *= 4
            if mu > 1e12: break
        if mu > 1e12: break
        q, hq = qn, hn
    g, _, ts, niveles = G(q, Ea, Eb, U, c)
    res = x0 - g
    bordes = np.concatenate([[0.0], ts, [np.pi]])
    primal = res @ res + eps * np.sum(np.diff(bordes) * niveles ** 2)
    return dict(q=q, ts=ts, niveles=niveles, residuo=res, iter=it,
                grad=np.linalg.norm(g - x0 - eps * q / 2), primal=primal, brecha=primal - eps * hq)


def resuelve(x0, Ea, Eb, U, eps=1e-4, q0=None, **kw):
    """resuelve_eps con los mismos rescates que la versión JavaScript: si no converge,
    continuación en ε (de 1e-2 hacia abajo) y, si aún no, un objetivo un poco desplazado
    como arranque (para los pliegues del dual donde nace o muere un pulso)."""
    err = lambda r: np.abs(r["residuo"]).max()
    r = resuelve_eps(x0, Ea, Eb, U, eps=eps, q0=q0, **kw)
    if err(r) < 1e-4: return r
    q = None
    for e in [1e-2, 1e-3, 1e-4, 1e-5, eps]:
        rc = resuelve_eps(x0, Ea, Eb, U, eps=e, q0=q, **kw); q = rc["q"]
    mejor = rc if err(rc) < err(r) else r
    for d in [1e-3, -1e-3, 3e-3, -3e-3]:
        if err(mejor) < 1e-4: break
        rd = resuelve_eps(x0 * (1 + d), Ea, Eb, U, eps=eps, q0=mejor["q"], **kw)
        rf = resuelve_eps(x0, Ea, Eb, U, eps=eps, q0=rd["q"], **kw)
        if err(rf) < err(mejor): mejor = rf
    return mejor


def coeficientes(ts, niveles, Ea, Eb):
    bordes = np.concatenate([[0.0], ts, [np.pi]])
    P = primitivaD(bordes, np.asarray(Ea, float), np.asarray(Eb, float))
    return (P[:, 1:] - P[:, :-1]) @ niveles


if __name__ == "__main__":
    Ea = Eb = [1, 5, 7, 11, 13]
    U = np.linspace(-1, 1, 6)
    for m in [0.2, 0.5, 0.8]:
        x0 = np.zeros(10); x0[0] = x0[5] = m
        r = resuelve(x0, Ea, Eb, U)
        print(f"m={m}: iter {r['iter']}, |grad| {r['grad']:.1e}, |residuo| {np.abs(r['residuo']).max():.2e}, "
              f"{len(r['ts'])} conmutaciones, niveles {np.round(r['niveles'], 2).tolist()}")
