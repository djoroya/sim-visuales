#!/usr/bin/env python3
"""Rollouts: integrar la dinamica con un control dado o con una politica."""

from __future__ import annotations

import numpy as np
import casadi as ca

from modelo import Params, func_intervalo, paso_rk4


def rollout_control(paso: ca.Function, z0: np.ndarray, A: np.ndarray) -> np.ndarray:
    """A es 2*n_p x N (control constante en cada intervalo). Devuelve n_est x (N+1)."""
    n = A.shape[1]
    Z = np.empty((z0.size, n + 1))
    Z[:, 0] = z0
    z = ca.DM(z0)
    for k in range(n):
        z = paso(z=z, a=ca.DM(A[:, k]))["zn"]
        Z[:, k + 1] = np.asarray(z).ravel()
    return Z


def func_intervalo_cerrado(p: Params, pi: ca.Function, h: float, m: int,
                           a_max: float | None = None) -> ca.Function:
    """Un intervalo de control en lazo cerrado: la politica se reevalua en
    cada subpaso.

    La heuristica es una ley de realimentacion en tiempo continuo. Congelarla
    durante todo un intervalo de control (2 s, diez veces la escala de tiempo
    del perro, que es 1/nu_p = 0,2) la vuelve inestable: el perro sobreactua y
    oscila. Se simula como lo que es, y lo que se compara con el optimo es la
    accion media que resulta en cada intervalo.
    """
    z = ca.MX.sym("z", p.n_est)
    zk, acum, esf = z, 0, 0
    for _ in range(m):
        a = pi(z=zk)["a"]
        if a_max is not None:
            a = ca.fmax(ca.fmin(a, a_max), -a_max)
        acum = acum + a
        esf = esf + h * ca.sumsqr(a)       # el esfuerzo real, subpaso a subpaso
        zk = paso_rk4(zk, a, h, p)
    return ca.Function("cerrado", [z], [zk, acum / m, esf],
                       ["z"], ["zn", "a_media", "esfuerzo"])


def rollout_politica(p: Params, pi: ca.Function, z0: np.ndarray, n: int,
                     h: float, m: int, a_max: float | None = None):
    """Devuelve (Z, A, esfuerzo).

    A es la accion media por intervalo (lo comparable con un control ZOH) y
    `esfuerzo` el valor exacto de int |a|^2 dt en cada intervalo, que no es lo
    mismo: la heuristica varia dentro del intervalo y promediarla antes de
    elevar al cuadrado le rebajaria el gasto.
    """
    cerrado = func_intervalo_cerrado(p, pi, h, m, a_max)
    Z = np.empty((z0.size, n + 1))
    A = np.empty((2 * p.n_p, n))
    esf = np.empty(n)
    Z[:, 0] = z0
    z = ca.DM(z0)
    for k in range(n):
        sal = cerrado(z=z)
        A[:, k] = np.asarray(sal["a_media"]).ravel()
        esf[k] = float(sal["esfuerzo"])
        z = sal["zn"]
        Z[:, k + 1] = np.asarray(z).ravel()
    return Z, A, esf
