#!/usr/bin/env python3
"""Escalera de pruebas. Cada peldano comprueba una cosa y solo una.

    consistencia  la base de senos da lo mismo que la matriz de 5 puntos
                  montada a mano, y CasADi lo mismo que numpy
    analitico     integrador frente a la solucion exacta de modos de Fourier
                  (con y sin memoria): orden 2 en espacio, 1 en tiempo
    gradiente     gradiente por AD frente a diferencias finitas (caso movil)
    optimalidad   en (a) y (b) el problema es cuadratico: el minimo de IPOPT
                  frente al de gradiente conjugado sobre las ecuaciones normales
    refina        (b) frente a (c) con otra malla / otro paso / otro beta:
                  el resultado cualitativo no puede depender de eso

    python/escalera.py <peldano> [opciones]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import casadi as ca
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

from modelo import (Params, a_fisico, campo_control, a_senos, autovalores, desempaqueta,
                    estado_inicial, func_paso, matriz_senos, nodos, norma,
                    simula_np, ventana, x_inicial)
from ocp import Pesos, Problema

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "salida"


def guarda(nombre: str, datos) -> None:
    SALIDA.mkdir(exist_ok=True)
    f = SALIDA / f"escalera-{nombre}.json"
    f.write_text(json.dumps(datos, indent=1, ensure_ascii=False, default=float))
    print(f"-> {f.relative_to(RAIZ)}")


def titulo(t):
    print(f"\n\033[1m== {t}\033[0m", flush=True)


# --- consistencia ------------------------------------------------------------

def laplaciano_fd(n: int) -> sp.csr_matrix:
    h = 1.0 / (n + 1)
    T = sp.diags([1.0, -2.0, 1.0], [-1, 0, 1], shape=(n, n)) / h**2
    I = sp.identity(n)
    return (sp.kron(T, I) + sp.kron(I, T)).tocsr()   # orden C: indice i*n + j


def peldano_consistencia(a) -> dict:
    titulo("consistencia: base de senos vs matriz de 5 puntos; CasADi vs numpy")
    p = Params(n=a.n or 14, N=20)
    rng = np.random.default_rng(1)
    C = rng.standard_normal((p.N, p.m, p.m))
    g = 30 * rng.standard_normal((p.N, 2))
    ys, zs, ds = simula_np(p, C, g, movil=True)

    # referencia: sistema acoplado montado a mano, Euler implicito, spsolve
    n2, dt = p.n**2, p.dt
    L = laplaciano_fd(p.n)
    I = sp.identity(n2)
    A = sp.bmat([[I - dt * p.nu * L, -dt * p.mu * L], [-dt * I, I]]).tocsc()
    lu = spla.splu(A)
    y = estado_inicial(p).ravel()
    z = np.zeros(n2)
    d, v = np.array(p.centro, float), np.zeros(2)
    err_y = err_z = 0.0
    for k in range(p.N):
        v = v + dt * g[k]
        d = d + dt * v
        b = (ventana(p, d) * campo_control(p, C[k], d)).ravel()
        sol = lu.solve(np.concatenate([y + dt * b, z]))
        y, z = sol[:n2], sol[n2:]
        err_y = max(err_y, np.abs(y - ys[k + 1].ravel()).max())
        err_z = max(err_z, np.abs(z - zs[k + 1].ravel()).max())

    # CasADi (mapaccum) vs numpy
    paso = func_paso(p, movil=True)
    U = np.vstack([np.stack([C[k].ravel(order="F") for k in range(p.N)], 1), g.T])
    X = np.asarray(paso.mapaccum(p.N)(ca.DM(x_inicial(p)), ca.DM(U)))
    yc, zc, dc = desempaqueta(np.hstack([x_inicial(p)[:, None], X]), p)
    r = {
        "n": p.n, "N": p.N,
        "max_y": float(np.abs(ys).max()),
        "senos_vs_matriz_y": float(err_y), "senos_vs_matriz_z": float(err_z),
        "casadi_vs_numpy_y": float(np.abs(yc - ys).max()),
        "casadi_vs_numpy_z": float(np.abs(zc - zs).max()),
        "casadi_vs_numpy_d": float(np.abs(dc - ds).max()),
    }
    for k, val in r.items():
        print(f"  {k:22s} {val:.3e}" if isinstance(val, float) else f"  {k:22s} {val}")
    guarda("consistencia", r)
    return r


# --- analitico -----------------------------------------------------------------

MODOS = ((1, 1, 1.0), (3, 2, 0.5), (2, 5, 0.25))   # (k, l, amplitud)


def exacto_2x2(Lam, nu, mu, t):
    """y(t), z(t) de y' = -Lam (nu y + mu z), z' = y, y(0)=1, z(0)=0."""
    A = np.array([[-Lam * nu, -Lam * mu], [1.0, 0.0]], complex)
    w, V = np.linalg.eig(A)
    c = np.linalg.solve(V, np.array([1.0, 0.0], complex))
    s = V @ (c * np.exp(w * t))
    return s.real


def campo_modos(p: Params, t, discreto: bool):
    """y, z con dato inicial suma de MODOS, exactos en el tiempo.

    discreto=False: solucion continua en los nodos (autovalor pi^2 (k^2+l^2)).
    discreto=True: la semidiscreta (autovalor del laplaciano de 5 puntos), es
    decir, lo que daria el integrador con dt -> 0.
    """
    x = nodos(p)
    h = p.h
    y = np.zeros((p.n, p.n))
    z = np.zeros((p.n, p.n))
    for k, l, amp in MODOS:
        if discreto:
            Lam = 4 / h**2 * (np.sin(k * np.pi * h / 2)**2 + np.sin(l * np.pi * h / 2)**2)
        else:
            Lam = np.pi**2 * (k * k + l * l)
        yt, zt = exacto_2x2(Lam, p.nu, p.mu, t)
        phi = np.outer(np.sin(k * np.pi * x), np.sin(l * np.pi * x))
        y += amp * yt * phi
        z += amp * zt * phi
    return y, z


def peldano_analitico(a) -> dict:
    titulo("integrador frente a la solucion exacta de modos de Fourier")
    base = Params()
    out = {"modos": MODOS, "T": base.T, "nu": base.nu, "mu": base.mu}
    for etiqueta, mu in (("sin_memoria", 0.0), ("con_memoria", base.mu)):
        q = base.con(mu=mu)
        # espacio: semidiscreta exacta en tiempo frente a la continua
        esp = []
        for n in (10, 20, 40, 80, 160):
            pn = q.con(n=n)
            yd, zd = campo_modos(pn, q.T, True)
            yc, zc = campo_modos(pn, q.T, False)
            esp.append({"n": n, "h": pn.h, "err_y": norma(yd - yc, pn),
                        "err_z": norma(zd - zc, pn), "y": norma(yc, pn), "z": norma(zc, pn)})
        # tiempo: integrador completo frente a la semidiscreta exacta (n = 40)
        tie = []
        for N in (25, 50, 100, 200, 400, 800):
            pN = q.con(n=40, N=N)
            y0, _ = campo_modos(pN, 0.0, True)
            ys, zs, _ = simula_np(pN, y0=y0)
            yd, zd = campo_modos(pN, q.T, True)
            tie.append({"N": N, "dt": pN.dt, "err_y": norma(ys[-1] - yd, pN),
                        "err_z": norma(zs[-1] - zd, pN)})
        # total en la malla de produccion
        pp = q.con(n=40, N=100)
        y0, _ = campo_modos(pp, 0.0, False)
        ys, zs, _ = simula_np(pp, y0=y0)
        yc, zc = campo_modos(pp, q.T, False)
        total = {"n": 40, "N": 100,
                 "err_y_rel": norma(ys[-1] - yc, pp) / norma(yc, pp),
                 "err_z_rel": norma(zs[-1] - zc, pp) / norma(zc, pp)}
        for lista, var in ((esp, "h"), (tie, "dt")):
            for i in range(1, len(lista)):
                for c in ("err_y", "err_z"):
                    lista[i]["orden_" + c[-1]] = float(
                        np.log(lista[i - 1][c] / lista[i][c])
                        / np.log(lista[i - 1][var] / lista[i][var]))
        out[etiqueta] = {"espacio": esp, "tiempo": tie, "produccion": total}
        print(f"  [{etiqueta}]")
        for e in esp:
            print(f"   n={e['n']:4d}  err_y={e['err_y']:.2e}  err_z={e['err_z']:.2e}  "
                  f"orden={e.get('orden_y', float('nan')):.2f}")
        for e in tie:
            print(f"   N={e['N']:4d}  err_y={e['err_y']:.2e}  err_z={e['err_z']:.2e}  "
                  f"orden={e.get('orden_y', float('nan')):.2f}")
        print(f"   produccion (40x40, 100 pasos): err rel y={total['err_y_rel']:.2e} "
              f"z={total['err_z_rel']:.2e}")
    guarda("analitico", out)
    return out


# --- gradiente -------------------------------------------------------------------

def peldano_gradiente(a) -> dict:
    titulo("gradiente por AD frente a diferencias finitas")
    p = Params(n=12, N=16)
    out = {}
    rng = np.random.default_rng(3)
    for caso in ("b", "c"):
        pr = Problema(p, caso, z_ref=0.03)
        U = 0.3 * rng.standard_normal((pr.nu_, p.N))
        if pr.movil:
            U[-2:, :] = 0.05 * rng.standard_normal((2, p.N))   # sin salirse del dominio
        t0 = time.perf_counter()
        G = np.asarray(pr.grad_fun(ca.DM(U)))
        t_ad = time.perf_counter() - t0
        idx = [(i, j) for i, j in zip(rng.integers(0, pr.nu_, 30), rng.integers(0, p.N, 30))]
        if pr.movil:   # que entren seguro componentes de la fuerza de la particula
            idx += [(pr.nu_ - 2, j) for j in (0, p.N // 2, p.N - 1)]
            idx += [(pr.nu_ - 1, j) for j in (1, p.N // 3)]
        filas = []
        for eps in (1e-3, 1e-4, 1e-5, 1e-6, 1e-7):
            err = err_c = 0.0
            for i, j in idx:
                E = np.zeros_like(U)
                E[i, j] = eps
                fd = (float(pr.J_fun(ca.DM(U + E))) - float(pr.J_fun(ca.DM(U - E)))) / (2 * eps)
                err = max(err, abs(fd - G[i, j]) / max(abs(G).max(), 1e-14))
                err_c = max(err_c, abs(fd - G[i, j]) / (abs(G[i, j]) + 1e-8 * abs(G).max()))
            filas.append({"eps": eps, "err_rel_max": err, "err_rel_componente": err_c})
        # derivada direccional en una direccion aleatoria
        D = rng.standard_normal(U.shape)
        eps = 1e-5
        dd = (float(pr.J_fun(ca.DM(U + eps * D))) - float(pr.J_fun(ca.DM(U - eps * D)))) / (2 * eps)
        out[caso] = {"n_var": int(U.size), "componentes": len(idx), "tabla": filas,
                     "direccional_fd": dd, "direccional_ad": float(np.sum(G * D)),
                     "direccional_err_rel": abs(dd - np.sum(G * D)) / abs(dd),
                     "t_grad_ad_s": t_ad}
        print(f"  [{caso}] {U.size} variables")
        for f in filas:
            print(f"   eps={f['eps']:.0e}  err rel (al max)={f['err_rel_max']:.2e}  "
                  f"err rel (por componente)={f['err_rel_componente']:.2e}")
        print(f"   direccional: FD={dd:.10e}  AD={np.sum(G*D):.10e}")
    guarda("gradiente", out)
    return out


# --- optimalidad ---------------------------------------------------------------------

def peldano_optimalidad(a) -> dict:
    """(a) y (b) son cuadraticos en f: J(U) = 1/2 U'HU + g0'U + c.

    La solucion de referencia sale de gradiente conjugado sobre H U = -g0, con
    H v = grad J(v) - grad J(0) (exacto porque J es cuadratico). Se compara con
    lo que devuelve IPOPT con L-BFGS.
    """
    titulo("optimalidad: IPOPT frente a gradiente conjugado (casos cuadraticos)")
    p = Params(n=a.n or 40, N=a.N or 100)
    out = {"n": p.n, "N": p.N}
    from experimento import z_libre
    zr = z_libre(p)
    for caso in ("a", "b"):
        pr = Problema(p, caso, z_ref=zr)
        sh = (pr.nu_, p.N)
        g0 = np.asarray(pr.grad_fun(ca.DM(np.zeros(sh)))).ravel()
        Hv = lambda v: np.asarray(pr.grad_fun(ca.DM(v.reshape(sh)))).ravel() - g0
        t0 = time.perf_counter()
        x = np.zeros_like(g0)
        r = -g0.copy()
        q = r.copy()
        rr = r @ r
        it = 0
        while it < 20000 and np.sqrt(rr) > 1e-13 * np.linalg.norm(g0):
            Aq = Hv(q)
            al = rr / (q @ Aq)
            x += al * q
            r -= al * Aq
            rr1 = r @ r
            q = r + rr1 / rr * q
            rr = rr1
            it += 1
        t_cg = time.perf_counter() - t0
        U_cg = x.reshape(sh)
        U_ip, info = pr.resuelve(np.zeros(sh), max_iter=3000, tol=1e-10, imprime=0)
        J_cg, J_ip = float(pr.J_fun(ca.DM(U_cg))), float(pr.J_fun(ca.DM(U_ip)))
        dc, di = pr.desglose(U_cg), pr.desglose(U_ip)
        out[caso] = {
            "J_cg": J_cg, "J_ipopt": J_ip, "dif_rel_J": abs(J_ip - J_cg) / J_cg,
            "dif_rel_U": float(np.linalg.norm(U_ip - U_cg) / np.linalg.norm(U_cg)),
            "temp_cg": dc["temp"], "temp_ipopt": di["temp"],
            "memo_cg": dc["memo"], "memo_ipopt": di["memo"],
            "iter_cg": it, "s_cg": t_cg, **{"ipopt_" + k: v for k, v in info.items()},
        }
        print(f"  [{caso}] J: CG={J_cg:.10e}  IPOPT={J_ip:.10e}  "
              f"dif rel={out[caso]['dif_rel_J']:.1e}  |dU|/|U|={out[caso]['dif_rel_U']:.1e}  "
              f"({it} it CG, {info['iteraciones']} it IPOPT)")
    guarda("optimalidad", out)
    return out


# --- refina ------------------------------------------------------------------------

def peldano_refina(a) -> dict:
    from experimento import corre
    p = Params(n=a.n or 30, N=a.N or 100)
    pesos = Pesos(beta=a.beta)
    titulo(f"refina: n={p.n}, N={p.N}, beta={a.beta:g}, casos {a.casos}")
    out = {}
    for caso in a.casos:
        t0 = time.perf_counter()
        r = corre(p, caso, pesos, a.iter, a.guia)
        r["total_s"] = time.perf_counter() - t0
        out[caso] = r
        print(f"  [{caso}] |y(T)|/|y0|={r['yT_rel']:.3e}  |z(T)|/|z_libre|={r['zT_rel']:.3e}  "
              f"esfuerzo={r['esfuerzo_f']:.3e}  {r['iteraciones']} it  {r['segundos']:.0f} s  "
              f"{r['estado']}", flush=True)
    guarda(f"refina-n{p.n}-N{p.N}-b{a.beta:g}{a.sufijo}", out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("peldano")
    ap.add_argument("--n", type=int, default=0)
    ap.add_argument("--N", type=int, default=0)
    ap.add_argument("--beta", type=float, default=Pesos().beta)
    ap.add_argument("--casos", default="bc")
    ap.add_argument("--iter", type=int, default=1000)
    ap.add_argument("--guia", default="lazo")
    ap.add_argument("--sufijo", default="")
    a = ap.parse_args()
    {"consistencia": peldano_consistencia, "analitico": peldano_analitico,
     "gradiente": peldano_gradiente, "optimalidad": peldano_optimalidad,
     "refina": peldano_refina}[a.peldano](a)


if __name__ == "__main__":
    main()
