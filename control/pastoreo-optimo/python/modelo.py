#!/usr/bin/env python3
"""Modelo de pastoreo del TFM, escrito una sola vez y en CasADi.

Todo lo que simula aqui -- la heuristica, el optimo, las comprobaciones --
pasa por este fichero, de modo que comparar dos politicas compara politicas y
no dos implementaciones distintas de la misma dinamica.

Dinamica (TFM, ec. 5.7-5.10; masa unidad, asi que fuerza = aceleracion):

    x_i' = v_i    v_i' = -nu_o v_i + sum_k g_oo(r_ik) e_ik + sum_j g_op(r_ij) e_ij
    y_j' = w_j    w_j' = -nu_p w_j + sum_k g_pp(r_jk) e_jk + a_j

con e_ik el unitario de i hacia k, y las fuerzas radiales (ec. 5.4-5.6)

    g_oo(r) = -(1/r - 1/r_oo)        g_op(r) = -F_m exp(-r^2/sigma^2)
    g_pp(r) = -(1/r - 1/r_pp)

Regularizacion. Todas las fuerzas se evaluan en r_e = sqrt(|d|^2 + eps^2) en
lugar de r = |d|, lo que las vuelve analiticas en d = 0 (la norma no lo es, y
1/r diverge). El efecto es doble y deliberado:

  - el unitario e = d/r_e se queda corto cuando |d| ~ eps, de modo que la
    fuerza tiende a 0 linealmente en vez de reventar;
  - para |d| >> eps el error relativo es eps^2/(2|d|^2): con eps = 1 y la
    distancia tipica entre ovejas (~10) son 5 por mil.

El termino 1/r_oo y 1/r_pp (la parte atractiva) no necesita regularizacion,
pero se deja dentro del mismo parentesis por claridad.

La repulsion del perro sobre la oveja es *asimetrica*: el perro no siente la
reaccion (ec. 5.10). Es la misma eleccion que hace la version en LAMMPS de
`particulas/pastoreo/` y la razon de que alli no pueda ser un pair_style.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import casadi as ca
import numpy as np


@dataclass(frozen=True)
class Params:
    """Parametros del modelo. Los valores son los calibrados en
    `particulas/pastoreo/` (TFM figura 5 + codigo DeustoTech)."""

    n_o: int = 200          # ovejas
    n_p: int = 3            # perros
    nu_o: float = 0.45      # rozamiento de las ovejas
    nu_p: float = 5.0       # rozamiento de los perros
    r_oo: float = 30.0      # radio de equilibrio oveja-oveja
    r_pp: float = 10.0      # radio de equilibrio perro-perro
    sigma: float = 50.0     # alcance de la repulsion del perro
    F_m: float = 5.0        # intensidad de la repulsion del perro
    eps: float = 1.0        # regularizacion de 1/r y de la norma
    objetivo: tuple = (0.0, 0.0)

    @property
    def n_est(self) -> int:
        return 4 * (self.n_o + self.n_p)

    def con(self, **kw) -> "Params":
        return replace(self, **kw)


# --- utilidades de estado ---------------------------------------------------
# El estado es un vector columna [x ; v ; y ; w], cada bloque en orden
# column-major: la columna i de la matriz 2 x N es el individuo i.

def trocea(z, p: Params):
    """z -> (X, V, Y, W) como matrices 2 x N."""
    no, npr = p.n_o, p.n_p
    X = ca.reshape(z[0:2 * no], 2, no)
    V = ca.reshape(z[2 * no:4 * no], 2, no)
    Y = ca.reshape(z[4 * no:4 * no + 2 * npr], 2, npr)
    W = ca.reshape(z[4 * no + 2 * npr:], 2, npr)
    return X, V, Y, W


def junta(X, V, Y, W):
    return ca.vertcat(ca.vec(X), ca.vec(V), ca.vec(Y), ca.vec(W))


def _radial(A, B, g, eps, quita_diagonal=False):
    """Suma de fuerzas radiales que los individuos de B ejercen sobre los de A.

    A es 2 x n, B es 2 x m; `g` es una funcion de la distancia regularizada
    que devuelve el *modulo con signo* (negativo = repulsion). Devuelve 2 x n.
    """
    n, m = A.shape[1], B.shape[1]
    dx = ca.repmat(B[0, :], n, 1) - ca.repmat(A[0, :].T, 1, m)   # [i,k] = b_k - a_i
    dy = ca.repmat(B[1, :], n, 1) - ca.repmat(A[1, :].T, 1, m)
    r = ca.sqrt(dx * dx + dy * dy + eps * eps)
    c = g(r) / r                       # g(r) * d / r  = (g(r)/r) * d
    if quita_diagonal:
        c = c * (ca.DM.ones(n, m) - ca.DM.eye(n))
    uno = ca.DM.ones(m, 1)
    return ca.horzcat(ca.mtimes(c * dx, uno), ca.mtimes(c * dy, uno)).T


def campo(z, a, p: Params):
    """Campo vectorial f(z, a). `a` es 2 x n_p (aceleraciones de los perros)."""
    X, V, Y, W = trocea(z, p)
    g_oo = lambda r: -(1.0 / r - 1.0 / p.r_oo)
    g_pp = lambda r: -(1.0 / r - 1.0 / p.r_pp)
    g_op = lambda r: -p.F_m * ca.exp(-(r * r) / (p.sigma * p.sigma))

    F_oo = _radial(X, X, g_oo, p.eps, quita_diagonal=True)
    F_op = _radial(X, Y, g_op, p.eps)
    F_pp = _radial(Y, Y, g_pp, p.eps, quita_diagonal=True)

    dV = -p.nu_o * V + F_oo + F_op
    dW = -p.nu_p * W + F_pp + ca.reshape(a, 2, p.n_p)
    return junta(V, dV, W, dW)


# --- integracion ------------------------------------------------------------

def paso_rk4(z, a, h, p: Params):
    k1 = campo(z, a, p)
    k2 = campo(z + 0.5 * h * k1, a, p)
    k3 = campo(z + 0.5 * h * k2, a, p)
    k4 = campo(z + h * k3, a, p)
    return z + (h / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)


def func_intervalo(p: Params, h: float, m: int, jit: bool = False) -> ca.Function:
    """Un intervalo de control: `m` subpasos de RK4 con la accion congelada.

    El control es constante a trozos sobre intervalos de longitud m*h. Los
    subpasos van desenrollados dentro del cuerpo (son pocos) y el bucle sobre
    intervalos se hace fuera con mapaccum, que no desenrolla el grafo.
    """
    z = ca.MX.sym("z", p.n_est)
    a = ca.MX.sym("a", 2 * p.n_p)
    zk = z
    for _ in range(m):
        zk = paso_rk4(zk, a, h, p)
    opciones = {}
    if jit:
        opciones = {"jit": True, "compiler": "shell",
                    "jit_options": {"flags": ["-O2"], "verbose": False}}
    return ca.Function("intervalo", [z, a], [zk], ["z", "a"], ["zn"], opciones)


def trayectoria(paso: ca.Function, z0, A) -> ca.MX:
    """Despliega N intervalos. A es 2*n_p x N. Devuelve n_est x N (z_1..z_N)."""
    n = A.shape[1]
    return paso.mapaccum("rollout", n)(z=z0, a=A)["zn"]


# --- medidas ----------------------------------------------------------------

def media(X):
    return ca.sum2(X) / X.shape[1]


def dispersion(X):
    """traza de la covarianza de las posiciones = radio de giro al cuadrado."""
    n = X.shape[1]
    D = X - ca.repmat(media(X), 1, n)
    return ca.sum1(ca.sum2(D * D)) / n


def medidas_np(Z: np.ndarray, p: Params) -> dict:
    """Distancia al objetivo y dispersion a lo largo de una trayectoria.

    Z es n_est x (N+1) en numpy (incluyendo z_0).
    """
    no = p.n_o
    X = Z[0:2 * no, :].reshape(2, no, -1, order="F")
    cm = X.mean(axis=1)                                    # 2 x T
    obj = np.asarray(p.objetivo).reshape(2, 1)
    dist = np.linalg.norm(cm - obj, axis=0)
    disp = ((X - cm[:, None, :]) ** 2).sum(axis=0).mean(axis=0)
    return {"cm": cm, "distancia": dist, "dispersion": disp}


# --- escenario --------------------------------------------------------------

def estado_inicial(p: Params, semilla: int = 90210,
                   centro=(-170.0, 110.0), radio: float = 45.0,
                   perros=None) -> np.ndarray:
    """Rebano en un disco y perros detras, como en `particulas/pastoreo/`.

    El disco se llena con una espiral de Fibonacci (determinista) mas un jitter
    pequeno: con 200 ovejas un sorteo uniforme deja huecos y parejas pegadas, y
    las parejas pegadas hacen que la fuerza 1/r domine el primer instante.
    """
    rng = np.random.default_rng(semilla)
    k = np.arange(p.n_o) + 0.5
    rr = radio * np.sqrt(k / p.n_o)
    th = k * np.pi * (3.0 - np.sqrt(5.0))
    X = np.stack([centro[0] + rr * np.cos(th), centro[1] + rr * np.sin(th)])
    X += rng.normal(0.0, radio * 0.02, X.shape)

    if perros is None:
        # en arco por detras del rebano, mirando al objetivo
        obj = np.asarray(p.objetivo)
        e = np.asarray(centro) - obj
        e = e / np.linalg.norm(e)
        angs = np.linspace(-0.6, 0.6, p.n_p) if p.n_p > 1 else np.array([0.0])
        Y = np.zeros((2, p.n_p))
        for j, psi in enumerate(angs):
            R = np.array([[np.cos(psi), -np.sin(psi)], [np.sin(psi), np.cos(psi)]])
            Y[:, j] = np.asarray(centro) + (radio + 35.0) * (R @ e)
    else:
        Y = np.asarray(perros, dtype=float).reshape(2, p.n_p)

    return np.concatenate([X.flatten(order="F"), np.zeros(2 * p.n_o),
                           Y.flatten(order="F"), np.zeros(2 * p.n_p)])
