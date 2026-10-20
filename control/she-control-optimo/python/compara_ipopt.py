"""Comparación con el método del artículo: transcripción directa con IPOPT (CasADi), malla de
Nt puntos, trapecios, penalización L suavizada con tanh (Leta1, eta = 1e3), ε = 1e-2.
Se resuelve el mismo problema con el dual exacto de she.py y se comparan coste, residuo y onda.

    python python/compara_ipopt.py
"""
import time
import numpy as np
import casadi as ca
import she

Ea = Eb = np.array([1, 5, 7, 11, 13], float)
import os
U = np.linspace(-1, 1, int(os.environ.get("NIVELES", 5)))
EPS, ETA, NT = 1e-2, 1e3, 300


def Lk(u):
    """Rectas que interpolan u² entre niveles consecutivos (como Lk.m con u0 = 0)."""
    x1, x2 = U[:-1], U[1:]
    return [(x2[k] ** 2 - x1[k] ** 2) / (x2[k] - x1[k]) * (u - x1[k]) + x1[k] ** 2 for k in range(len(x1))]


def Leta1(u):
    th = lambda x: 0.5 + 0.5 * ca.tanh(ETA * x)
    L = Lk(u); s = L[-1] * th(u - U[-2]) + L[0] * th(-u + U[1])
    for k in range(1, len(U) - 2):
        s += th(u - U[k]) * th(U[k + 1] - u) * L[k]                    # ventana win(u, eta, x1, x2)
    return s


def L_exacta(u):
    """Interpolación lineal de u² en los niveles (la del dual)."""
    return np.interp(u, U, U ** 2)


tau = np.linspace(0, np.pi, NT)
u = ca.SX.sym("u", NT); x0s = ca.SX.sym("x0", 10)
D = she.matrizD(tau, Ea, Eb)
w = np.diff(tau)
Du = sum((w[i] / 2) * (D[:, i] * u[i] + D[:, i + 1] * u[i + 1]) for i in range(NT - 1))
xend = x0s - Du
Lu = Leta1(u)
J = ca.dot(xend, xend) + EPS * sum(w[i] * (Lu[i] + Lu[i + 1]) / 2 for i in range(NT - 1))
S = ca.nlpsol("S", "ipopt", {"x": u, "p": x0s, "f": J}, {"ipopt": {"print_level": 0, "tol": 1e-12}, "print_time": 0})


def coste_continuo(ts, niveles, x0):
    """Coste exacto en tiempo continuo de una onda escalonada."""
    r = x0 - she.coeficientes(ts, niveles, Ea, Eb)
    b = np.concatenate([[0], ts, [np.pi]])
    return r @ r + EPS * np.sum(np.diff(b) * L_exacta(niveles)), r


def coste_malla(uv, x0):
    """Coste exacto en tiempo continuo de la onda de IPOPT, interpretada a trozos lineal."""
    Dm = she.matrizD(np.linspace(0, np.pi, 20 * NT), Ea, Eb)
    um = np.interp(np.linspace(0, np.pi, 20 * NT), tau, uv)
    tf = np.linspace(0, np.pi, 20 * NT)
    r = x0 - np.trapezoid(Dm * um, tf, axis=1)
    return r @ r + EPS * np.trapezoid(L_exacta(um), tf), r


if __name__ == "__main__":
    print(f"{'m':>5} | {'J dual':>10} {'J ipopt':>10} {'brecha':>8} | {'|r| dual':>9} {'|r| ipopt':>9} | {'conm.':>5} | {'L1 onda':>8} | t dual  t ipopt")
    for m in np.round(np.linspace(-0.8, 0.8, 9), 2):
        x0 = np.zeros(10); x0[0] = x0[5] = m
        t0 = time.time(); r = she.resuelve(x0, Ea, Eb, U, eps=EPS); td = time.time() - t0
        Jd, rd = coste_continuo(r["ts"], r["niveles"], x0)
        t0 = time.time(); s = S(x0=np.zeros(NT), p=x0, lbx=-1, ubx=1); ti = time.time() - t0
        ui = np.array(s["x"]).ravel()
        Ji, ri = coste_malla(ui, x0)
        # diferencia entre ondas: la del dual evaluada en la malla
        b = np.concatenate([[0], r["ts"], [np.pi]])
        ud = r["niveles"][np.clip(np.searchsorted(b, tau, side="right") - 1, 0, len(r["niveles"]) - 1)]
        l1 = np.trapezoid(np.abs(ud - ui), tau) / np.pi
        print(f"{m:5.2f} | {Jd:10.6f} {Ji:10.6f} {r['brecha']:8.1e} | {np.abs(rd).max():9.2e} {np.abs(ri).max():9.2e} | {len(r['ts']):5d} | {l1:8.4f} | {td:5.2f}  {ti:5.2f}")
