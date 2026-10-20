#!/usr/bin/env python3
"""Control optimo por disparo simple con CasADi + IPOPT.

Las incognitas son solo los controles: los coeficientes de f en la base de
Legendre del cuadrado (m x m por paso) y, en el caso movil, la fuerza g (2 por
paso) sobre la particula que lleva el cuadrado. El estado sale de integrar con
`mapaccum`, sin desplegar el grafo.

Coste, normalizado para que cada termino valga ~1 si "no hago nada":

    J = |y(T)|^2 / |y0|^2                                 temperatura final
      + wz |z(T)|^2 / |z_libre(T)|^2                      memoria final
      + beta  * int_0^T int_cuadrado f^2 / (|y0|^2 / T)    esfuerzo del campo
      + gamma * dt sum |g|^2 / (T g_max^2)                esfuerzo de la particula
      + rho   * dt sum dist(d, [m, 1-m]^2)^2              no salirse del cuadrado
      + vuelta * (|d(T) - d(0)|^2 / lado^2 + |v(T)|^2 T^2 / lado^2)

El ultimo termino (solo caso movil) pide que el cuadrado de control acabe donde
empezo y parado. No hace falta para controlar: esta para que la animacion
pueda encadenar en bucle sin que el cuadrado salte (vease el README).

z_libre(T) es la memoria final del sistema con memoria sin control. En el caso
(a), sin memoria, wz = 0: ahi solo se pide apagar la temperatura.

Con la base ortonormal, int_cuadrado f^2 = (lado/2)^2 sum_ij a_ij^2 exactamente
(sobre el cuadrado sin suavizar), asi que el esfuerzo es una suma de cuadrados
de las incognitas.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import casadi as ca
import numpy as np

from modelo import (Params, campo_control, desempaqueta, estado_inicial,
                    func_paso, norma, simula_np, ventana, x_inicial)


@dataclass(frozen=True)
class Pesos:
    wz: float = 1.0
    beta: float = 1e-4
    gamma: float = 1e-3
    rho: float = 1e3
    margen: float = 0.12   # el centro de la ventana no sale de [m, 1-m]^2
    g_max: float = 60.0
    f_esc: float = 20.0    # escala de los coeficientes del control en el NLP
    vuelta: float = 10.0   # la particula acaba en su punto de partida y quieta


CASOS = {
    "a": dict(memoria=False, movil=False, nombre="calor sin memoria, control fijo"),
    "b": dict(memoria=True, movil=False, nombre="con memoria, control fijo"),
    "c": dict(memoria=True, movil=True, nombre="con memoria, control movil"),
}


def params_caso(p: Params, caso: str) -> Params:
    return p if CASOS[caso]["memoria"] else p.con(mu=0.0)


class Problema:
    def __init__(self, p: Params, caso: str, pesos: Pesos = Pesos(),
                 z_ref: float | None = None):
        t0 = time.perf_counter()
        self.caso = caso
        self.movil = CASOS[caso]["movil"]
        self.p = params_caso(p, caso)
        self.pesos = pesos
        p, n, N, nn = self.p, self.p.n, self.p.N, self.p.n ** 2
        mm = p.m * p.m
        self.mm = mm

        self.y0 = estado_inicial(p)
        self.x0 = x_inicial(p)
        self.ny0 = norma(self.y0, p)
        if z_ref is None:
            # memoria final sin control, del sistema CON memoria (comun a b y c)
            _, zs, _ = simula_np(p.con(mu=p.mu if p.mu > 0 else Params().mu))
            z_ref = norma(zs[-1], p)
        self.z_ref = z_ref

        paso = func_paso(p, self.movil)
        self.nu_ = mm + (2 if self.movil else 0)
        U = ca.MX.sym("U", self.nu_, N)              # controles escalados
        esc = ca.DM([pesos.f_esc] * mm + ([pesos.g_max] * 2 if self.movil else []))
        Ufis = U * ca.repmat(esc, 1, N)
        X = paso.mapaccum(N)(ca.DM(self.x0), Ufis)    # (2nn+4) x N
        self.X_fun = ca.Function("X", [U], [X])

        xT = X[:, -1]
        h2 = p.h ** 2
        temp = h2 * ca.sumsqr(xT[:nn]) / self.ny0 ** 2
        memo = h2 * ca.sumsqr(xT[nn:2 * nn]) / self.z_ref ** 2
        esf = p.dt * (p.lado / 2) ** 2 * ca.sumsqr(Ufis[:mm, :]) / (self.ny0 ** 2 / p.T)
        if self.movil:
            G = Ufis[mm:, :]
            esf_g = p.dt * ca.sumsqr(G) / (p.T * pesos.g_max ** 2)
            D = X[2 * nn:2 * nn + 2, :]
            m = pesos.margen
            fuera = ca.fmax(0, m - D) + ca.fmax(0, D - (1 - m))
            pared = p.dt * ca.sumsqr(fuera)
            dT, vT = X[2 * nn:2 * nn + 2, -1], X[2 * nn + 2:, -1]
            vuelta = (ca.sumsqr(dT - ca.DM(self.x0[2 * nn:2 * nn + 2]))
                      + p.T ** 2 * ca.sumsqr(vT)) / p.lado ** 2
        else:
            vuelta = ca.MX(0)
            esf_g = ca.MX(0)
            pared = ca.MX(0)
        wz = pesos.wz if CASOS[caso]["memoria"] else 0.0
        J = (temp + wz * memo + pesos.beta * esf + pesos.gamma * esf_g
             + pesos.rho * pared + pesos.vuelta * vuelta)
        self.partes = ca.Function("partes", [U], [temp, memo, esf, esf_g, pared, vuelta, J],
                                  ["U"], ["temp", "memo", "esf", "esf_g", "pared",
                                          "vuelta", "J"])
        self.U = U
        self.J = J
        self.J_fun = ca.Function("J", [U], [J])
        self.grad_fun = ca.Function("g", [U], [ca.gradient(J, U)])
        self.t_construir = time.perf_counter() - t0

    # --- utilidades -------------------------------------------------------------
    def U_inicial(self, d_guia: np.ndarray | None = None) -> np.ndarray:
        """Control nulo; en el caso movil, g que sigue una trayectoria guia."""
        U = np.zeros((self.nu_, self.p.N))
        if self.movil and d_guia is not None:
            U[-2:, :] = guia_a_fuerza(d_guia, self.p) / self.pesos.g_max
        return U

    def desglose(self, U) -> dict:
        r = self.partes(U=ca.DM(U))
        return {k: float(v) for k, v in r.items()}

    def trayectoria(self, U):
        X = np.asarray(self.X_fun(ca.DM(U)))
        X = np.hstack([self.x0[:, None], X])
        y, z, d = desempaqueta(X, self.p)
        p, m = self.p, self.p.m
        C = (np.asarray(U)[:self.mm, :] * self.pesos.f_esc).T.reshape(-1, m, m, order="F")
        # control aplicado chi * f en la malla, con la posicion del final del paso
        F = np.array([ventana(p, d[k + 1]) * campo_control(p, C[k], d[k + 1])
                      for k in range(p.N)])
        g = (np.asarray(U)[self.mm:, :] * self.pesos.g_max).T if self.movil else None
        return y, z, d, F, g

    def resuelve(self, U0, max_iter=300, tol=1e-9, imprime=5, escala=None,
                 historia=30):
        if escala is None:
            g = np.asarray(self.grad_fun(ca.DM(U0)))
            escala = min(1e6, 1.0 / max(np.abs(g).max(), 1e-12))
        nlp = {"x": ca.vec(self.U), "f": escala * self.J}
        opts = {"ipopt": {"max_iter": max_iter, "tol": tol,
                          "hessian_approximation": "limited-memory",
                          "limited_memory_max_history": historia,
                          "nlp_scaling_method": "none",
                          "acceptable_iter": 0,
                          "print_level": imprime, "sb": "yes",
                          "print_frequency_iter": 10},
                "print_time": False}
        solver = ca.nlpsol("ocp", "ipopt", nlp, opts)
        n2 = self.mm
        lb = -np.inf * np.ones((self.nu_, self.p.N))
        ub = np.inf * np.ones((self.nu_, self.p.N))
        if self.movil:
            lb[n2:, :], ub[n2:, :] = -1.0, 1.0
        t0 = time.perf_counter()
        sol = solver(x0=ca.DM(U0.reshape(-1, order="F")),
                     lbx=ca.DM(lb.reshape(-1, order="F")),
                     ubx=ca.DM(ub.reshape(-1, order="F")))
        seg = time.perf_counter() - t0
        st = solver.stats()
        U = np.asarray(sol["x"]).reshape(self.nu_, self.p.N, order="F")
        return U, {"segundos": seg, "iteraciones": st.get("iter_count"),
                   "estado": st.get("return_status"), "escala": float(escala)}


def guia_a_fuerza(d_guia: np.ndarray, p: Params) -> np.ndarray:
    """Fuerza g (2 x N) tal que el Euler simplectico reproduce d_guia (N+1 x 2)."""
    dt = p.dt
    v = np.diff(d_guia, axis=0) / dt              # v_{k+1}, N x 2
    v_prev = np.vstack([np.zeros(2), v[:-1]])
    return ((v - v_prev) / dt).T


def guia_lazo(p: Params, vueltas: float = 1.0, radio: float = 0.27) -> np.ndarray:
    """Trayectoria guia: arranca en el centro en reposo y da una vuelta."""
    t = np.linspace(0, 1, p.N + 1)
    r = radio * np.sin(np.pi * t) ** 2   # arranca y acaba en el centro, sin tirones
    ang = 2 * np.pi * vueltas * t + np.pi / 4
    c = np.array(p.centro)
    return np.c_[c[0] + r * np.cos(ang), c[1] + r * np.sin(ang)]
