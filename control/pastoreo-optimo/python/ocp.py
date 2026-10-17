#!/usr/bin/env python3
"""Control optimo por disparo simple (single shooting).

Las unicas incognitas son los controles: 2 x n_p x N numeros, el estado se
obtiene integrando. No hay restricciones de dinamica porque la dinamica se
cumple por construccion; el problema queda como una minimizacion con cotas de
caja, |a_j^c| <= a_max, que es lo que mejor le sienta a IPOPT con
aproximacion L-BFGS del hessiano.

El coste, todo normalizado para que los pesos sean interpretables:

    J = |xm(T) - x_T|^2 / L^2                     llegar
      + lam * tr Cov(x(T)) / tr Cov(x(0))         no dispersar
      + bet * sum_k |a_k|^2 / (N n_p a_max^2)     esfuerzo
      + gam * (1/N) sum_k |xm_k - x_T|^2 / L^2    seguimiento (opcional)

con L la distancia inicial del rebano al objetivo. Cada termino vale ~1 para
"no he hecho nada" y ~0 para "perfecto", de modo que lam = 0,2 significa
literalmente que agrupar pesa una quinta parte de llegar.

El termino de seguimiento no esta en el enunciado del TFM, que solo mira el
instante final. La razon de anadirlo es que el gradiente del coste terminal
respecto a los primeros controles pasa por 160 intervalos de dinamica
disipativa y llega aplastado. Medido en el caso de 200 ovejas: con gam = 0 el
optimizador tambien lleva el rebano al objetivo, pero gastando tres veces mas
esfuerzo (120 377 frente a 39 982) y quedandose algo mas lejos. No es
imprescindible; sale mas barato. Se apaga con gam = 0.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import casadi as ca
import numpy as np

from modelo import Params, dispersion, func_intervalo, media, trayectoria


@dataclass(frozen=True)
class Pesos:
    lam: float = 0.2      # dispersion final
    bet: float = 0.01     # esfuerzo
    gam: float = 0.5      # seguimiento durante el horizonte
    lam_t: float = 0.0    # dispersion durante el horizonte


@dataclass(frozen=True)
class Malla:
    T: float = 400.0      # horizonte
    n: int = 160          # intervalos de control
    m: int = 10           # subpasos de RK4 por intervalo (h = 0,25)

    @property
    def dt(self) -> float:
        return self.T / self.n

    @property
    def h(self) -> float:
        return self.T / (self.n * self.m)


def _selector_media(no: int):
    """S tal que S @ vec(X) = media de las columnas de X (2 x no)."""
    return ca.kron(ca.DM.ones(1, no), ca.DM.eye(2)) / no


class Problema:
    """Monta una vez el grafo y deja listas J(A), su gradiente y el solver."""

    def __init__(self, p: Params, malla: Malla, pesos: Pesos, z0: np.ndarray,
                 a_max: float = 25.0, jit: bool = False):
        self.p, self.malla, self.pesos, self.a_max = p, malla, pesos, a_max
        self.z0 = np.asarray(z0, dtype=float)

        t0 = time.perf_counter()
        self.paso = func_intervalo(p, malla.h, malla.m, jit=jit)

        A = ca.MX.sym("A", 2 * p.n_p, malla.n)
        Z = trayectoria(self.paso, ca.DM(self.z0), A)          # n_est x N
        self.Z_fun = ca.Function("Z", [A], [Z], ["A"], ["Z"])

        obj = ca.DM(list(p.objetivo))
        X0 = ca.DM(self.z0[: 2 * p.n_o]).reshape((2, p.n_o))
        L2 = float(ca.sumsqr(media(X0) - obj))
        # con una sola oveja la dispersion es identicamente nula: se deja sin
        # normalizar en vez de dividir por cero (el termino vale 0 de todos modos)
        D0 = float(dispersion(X0)) if p.n_o > 1 else 1.0
        self.L = np.sqrt(L2)

        S = _selector_media(p.n_o)
        CM = ca.mtimes(S, Z[: 2 * p.n_o, :])                   # 2 x N
        XT = ca.reshape(Z[: 2 * p.n_o, -1], 2, p.n_o)

        # dispersion en cada instante, sin reconstruir las 200 columnas:
        #   tr Cov_k = (1/n) sum_i |x_i|^2 - |media|^2
        Zx = Z[: 2 * p.n_o, :]
        disp_k = ca.sum1(Zx * Zx) / p.n_o - ca.sum1(CM * CM)

        llegar = ca.sumsqr(media(XT) - obj) / L2
        agrupar = dispersion(XT) / D0
        esfuerzo = ca.sumsqr(A) / (malla.n * p.n_p * a_max ** 2)
        seguir = ca.sumsqr(CM - ca.repmat(obj, 1, malla.n)) / (malla.n * L2)
        agrupado = ca.sum2(disp_k) / (malla.n * D0)

        J = (llegar + pesos.lam * agrupar + pesos.bet * esfuerzo
             + pesos.gam * seguir + pesos.lam_t * agrupado)
        self.partes = ca.Function(
            "partes", [A], [llegar, agrupar, esfuerzo, seguir, agrupado],
            ["A"], ["llegar", "agrupar", "esfuerzo", "seguir", "agrupado"])
        self.J = ca.Function("J", [A], [J], ["A"], ["J"])
        self.gradJ = ca.Function("gradJ", [A], [ca.gradient(J, A)], ["A"], ["g"])

        # Escalado. Las incognitas del NLP son u = A/a_max en [-1, 1]: asi la
        # escala de las variables es 1 en vez de 25 y las cotas quedan
        # simetricas y unitarias. El objetivo tambien hay que escalarlo: tal
        # cual, |dJ/du| ~ 1e-2 y el primer paso de L-BFGS (que arranca con el
        # hessiano identidad) mueve los controles una centesima, de modo que
        # IPOPT agota las iteraciones sin salir del sitio. Se multiplica J por
        # un factor que deja el gradiente inicial del orden de 10.
        self.u = ca.MX.sym("u", 2 * p.n_p, malla.n)
        self.J_u = self.J(self.u * a_max)
        self.t_construir = time.perf_counter() - t0

    # --- interfaz numerica --------------------------------------------------
    def coste(self, A) -> float:
        return float(self.J(ca.DM(A)))

    def desglose(self, A) -> dict:
        s = self.partes(A=ca.DM(A))
        d = {k: float(v) for k, v in s.items()}
        d["J"] = self.coste(A)
        return d

    def estados(self, A) -> np.ndarray:
        """n_est x (N+1), con z_0 delante."""
        Z = np.asarray(self.Z_fun(A=ca.DM(A))["Z"])
        return np.hstack([self.z0.reshape(-1, 1), Z])

    def factor_escala(self, A0, objetivo_grad: float = 0.2) -> float:
        """Factor por el que se multiplica J para que IPOPT arranque bien.

        L-BFGS empieza con el hessiano identidad, de modo que su primer paso
        es -grad f: el factor de escala *es* la longitud del primer paso. Con
        gradiente ~10 el primer paso saca los controles del rango util y la
        trayectoria cae en la cuenca equivocada (el perro se aleja hasta que
        su repulsion es despreciable: un punto estacionario perfecto y un
        resultado inutil). Con ~0,2 el primer paso mueve los controles una
        quinta parte de su rango, que es lo que aqui funciona; vease
        salida/escalera-pareja.json.
        """
        g = np.asarray(self.gradJ(A=ca.DM(A0))["g"]) * self.a_max
        pico = float(np.abs(g).max())
        return 1.0 if pico <= 0 else min(1e8, objetivo_grad / pico)

    def resuelve(self, A0, max_iter: int = 150, tol: float = 1e-8,
                 historia: int = 20, imprime: int = 5, escala: float | None = None):
        if escala is None:
            escala = self.factor_escala(A0)
        opciones = {
            "ipopt": {
                "max_iter": max_iter,
                "tol": tol,
                "hessian_approximation": "limited-memory",
                "limited_memory_max_history": historia,
                "nlp_scaling_method": "none",
                "mu_strategy": "adaptive",
                "print_level": imprime,
                "print_timing_statistics": "no",
                "sb": "yes",
            },
            "print_time": False,
        }
        nlp = {"x": ca.vec(self.u), "f": escala * self.J_u}
        solver = ca.nlpsol("ocp", "ipopt", nlp, opciones)
        t0 = time.perf_counter()
        sol = solver(x0=ca.DM(np.asarray(A0).reshape(-1, 1, order="F") / self.a_max),
                     lbx=-1.0, ubx=1.0)
        t = time.perf_counter() - t0
        est = solver.stats()
        A = self.a_max * np.asarray(sol["x"]).reshape(
            2 * self.p.n_p, self.malla.n, order="F")
        info = {
            "segundos": t,
            "iteraciones": est.get("iter_count"),
            "estado": est.get("return_status"),
            "exito": bool(est.get("success")),
            "escala": float(escala),
        }
        it = est.get("iterations")
        if it:
            for clave in ("inf_du", "obj"):
                if clave in it and it[clave]:
                    v = float(it[clave][-1])
                    info["kkt_dual" if clave == "inf_du" else "coste_ipopt"] = \
                        v / escala if clave == "obj" else v
        return A, info
