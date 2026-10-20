#!/usr/bin/env python3
"""Ecuacion del calor con memoria en el cuadrado unidad y un control que se mueve.

Modelo continuo (Omega = (0,1)^2, Dirichlet homogeneo):

    y_t - nu * Lap y - mu * int_0^t Lap y(s) ds = chi_{omega(t)} f        (1)

Con la variable de memoria z(t) = int_0^t y(s) ds queda un sistema EDP-EDO:

    y_t = nu * Lap y + mu * Lap z + chi_{omega(t)} f
    z_t = y                                         (z no difunde: es una EDO)

Es el modelo (1.1) de Lu, Zhang y Zuazua con nucleo constante M = mu y
b = nu, el de Chaves-Silva, Rosier y Zuazua (2014) en viscoelasticidad. "Llevar
a cero" significa y(T) = 0 *y* z(T) = 0 (con Dirichlet, int_0^T Lap y = 0
equivale a z(T) = 0).

La region de control es un cuadrado de lado `lado` hecho con una Heaviside
suavizada, centrado en d(t). Dentro, f es un polinomio de grado <= `grado` en
cada direccion, escrito en la base de Legendre normalizada *en el marco del
cuadrado*: f(x, t) = sum_ij a_ij(t) phi_i(xi) phi_j(eta), xi = (x - d_x)/(lado/2).
El control viaja con el cuadrado y su dimension (36 numeros por paso con
grado 5) no depende de la malla. En el caso movil d es la posicion de una
particula: d'' = g, y g (acotada) es el segundo control.

Discretizacion
--------------
* Espacio: diferencias finitas de 5 puntos en una malla n x n de nodos
  interiores, h = 1/(n+1). Ese laplaciano discreto se diagonaliza
  *exactamente* con la transformada de senos (DST-I): S Y S, con S simetrica y
  ortonormal. El estado se guarda en esa base y resolver el sistema implicito
  es dividir elemento a elemento. No es una aproximacion espectral: da el mismo
  resultado que montar la matriz de 5 puntos y resolverla (peldano
  `consistencia` de la escalera).
* Tiempo: Euler implicito en el par (y, z):

      y+ - y = dt (nu Lap y+ + mu Lap z+ + b)       b = chi(d+) * f
      z+ - z = dt y+

  que, sustituyendo z+, es (1 + dt (nu + mu dt) Lam) y+ = y - dt mu Lam z + dt b
  en la base de senos (Lam = autovalores de -Lap). Incondicionalmente estable.
* Particula: Euler simplectico, v+ = v + dt g, d+ = d + dt v+; la ventana se
  evalua en d+.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import casadi as ca
import numpy as np


@dataclass(frozen=True)
class Params:
    n: int = 40              # nodos interiores por direccion
    N: int = 100             # pasos de tiempo (y de control)
    T: float = 1.0           # horizonte
    nu: float = 0.05         # difusion
    mu: float = 0.03         # peso de la memoria (0 = calor sin memoria)
    lado: float = 0.3        # lado del cuadrado de control
    kappa: float = 30.0      # pendiente de la Heaviside suavizada
    grado: int = 5           # grado de los polinomios del control en el cuadrado
    centro: tuple = (0.5, 0.5)   # posicion del control fijo / inicial del movil
    bultos: tuple = field(default_factory=lambda: (
        # (x, y, amplitud, anchura) de los focos de calor iniciales
        (0.24, 0.72, 1.0, 0.07),
        (0.74, 0.76, 0.8, 0.06),
        (0.78, 0.26, 1.0, 0.07),
        (0.30, 0.25, 0.7, 0.06),
    ))

    @property
    def h(self) -> float:
        return 1.0 / (self.n + 1)

    @property
    def dt(self) -> float:
        return self.T / self.N

    @property
    def m(self) -> int:
        return self.grado + 1

    def con(self, **kw) -> "Params":
        return replace(self, **kw)


# --- malla y base de senos -----------------------------------------------------

def nodos(p: Params) -> np.ndarray:
    return p.h * np.arange(1, p.n + 1)


def matriz_senos(n: int) -> np.ndarray:
    """DST-I ortonormal y simetrica: S @ S = I."""
    h = 1.0 / (n + 1)
    i = np.arange(1, n + 1)
    return np.sqrt(2.0 * h) * np.sin(np.pi * h * np.outer(i, i))


def autovalores(n: int) -> np.ndarray:
    """Autovalores de -Lap de 5 puntos con Dirichlet: Lam[i, j] = l_i + l_j."""
    h = 1.0 / (n + 1)
    l = 4.0 / h**2 * np.sin(np.arange(1, n + 1) * np.pi * h / 2) ** 2
    return l[:, None] + l[None, :]


def a_senos(Y, S):
    return S @ Y @ S


def a_fisico(Yh, S):
    return S @ Yh @ S


def estado_inicial(p: Params) -> np.ndarray:
    x = nodos(p)
    X, Yc = np.meshgrid(x, x, indexing="ij")
    y0 = np.zeros_like(X)
    for cx, cy, a, s in p.bultos:
        y0 += a * np.exp(-((X - cx) ** 2 + (Yc - cy) ** 2) / s**2)
    return y0


def norma(Y, p: Params) -> float:
    """Norma L2 discreta (regla del rectangulo)."""
    return float(np.sqrt(p.h**2 * np.sum(np.asarray(Y) ** 2)))


# --- ventana de control ----------------------------------------------------------

def _theta(s, kappa, lib=np):
    return 0.5 * (1 + lib.tanh(kappa * s))


def ventana_1d(x, c, lado, kappa, lib=np):
    return _theta(x - c + lado / 2, kappa, lib) - _theta(x - c - lado / 2, kappa, lib)


def ventana(p: Params, d, lib=np):
    """chi_omega(d) en los nodos, n x n (indice [i, j] <-> (x_i, y_j))."""
    x = nodos(p)
    if lib is np:
        wx = ventana_1d(x, d[0], p.lado, p.kappa)
        wy = ventana_1d(x, d[1], p.lado, p.kappa)
        return np.outer(wx, wy)
    xm = ca.DM(x)
    wx = ventana_1d(xm, d[0], p.lado, p.kappa, ca)
    wy = ventana_1d(xm, d[1], p.lado, p.kappa, ca)
    return ca.mtimes(wx, wy.T)


# --- base de Legendre en el marco del cuadrado -------------------------------

def legendre(xi, m, lib=np):
    """Columnas phi_0..phi_{m-1}(xi), Legendre normalizados en [-1, 1]."""
    P = [xi * 0 + 1, xi]
    for k in range(1, m - 1):
        P.append(((2 * k + 1) * xi * P[k] - k * P[k - 1]) / (k + 1))
    cols = [np.sqrt((2 * i + 1) / 2) * P[i] for i in range(m)]
    return np.stack(cols, axis=-1) if lib is np else ca.horzcat(*cols)


def campo_control(p: Params, C, d, lib=np):
    """f en los nodos (n x n) a partir de los coeficientes C (m x m)."""
    x = nodos(p)
    if lib is np:
        Px = legendre((x - d[0]) / (p.lado / 2), p.m)
        Py = legendre((x - d[1]) / (p.lado / 2), p.m)
        return Px @ C @ Py.T
    xm = ca.DM(x)
    Px = legendre((xm - d[0]) / (p.lado / 2), p.m, ca)
    Py = legendre((xm - d[1]) / (p.lado / 2), p.m, ca)
    return ca.mtimes(ca.mtimes(Px, C), Py.T)


# --- paso de tiempo en CasADi --------------------------------------------------

def func_paso(p: Params, movil: bool) -> ca.Function:
    """x+ = F(x, u).

    x = [vec Yh; vec Zh; d; v]   (2 n^2 + 4)
    u = [vec C; g]               (m^2 + 2 si movil, m^2 si no)
    """
    n, dt = p.n, p.dt
    nn = n * n
    S = ca.DM(matriz_senos(n))
    Lam = autovalores(n)
    den = ca.DM(1.0 / (1.0 + dt * (p.nu + p.mu * dt) * Lam))
    mLam = ca.DM(dt * p.mu * Lam)

    x = ca.MX.sym("x", 2 * nn + 4)
    mm = p.m * p.m
    u = ca.MX.sym("u", mm + (2 if movil else 0))
    Yh = ca.reshape(x[:nn], n, n)
    Zh = ca.reshape(x[nn:2 * nn], n, n)
    d, v = x[2 * nn:2 * nn + 2], x[2 * nn + 2:]
    C = ca.reshape(u[:mm], p.m, p.m)
    if movil:
        g = u[mm:]
        v1 = v + dt * g
        d1 = d + dt * v1
    else:
        v1, d1 = v, d
    chi = ventana(p, d1, lib=ca)
    F = campo_control(p, C, d1, lib=ca)
    Bh = ca.mtimes(ca.mtimes(S, chi * F), S)
    Y1 = (Yh - mLam * Zh + dt * Bh) * den
    Z1 = Zh + dt * Y1
    x1 = ca.vertcat(ca.vec(Y1), ca.vec(Z1), d1, v1)
    return ca.Function("paso", [x, u], [x1], ["x", "u"], ["x1"])


def x_inicial(p: Params, y0: np.ndarray | None = None, d0=None) -> np.ndarray:
    S = matriz_senos(p.n)
    y0 = estado_inicial(p) if y0 is None else y0
    d0 = p.centro if d0 is None else d0
    return np.concatenate([a_senos(y0, S).ravel(order="F"),
                           np.zeros(p.n * p.n), np.asarray(d0, float), [0.0, 0.0]])


def desempaqueta(X: np.ndarray, p: Params):
    """X: (2n^2+4) x K -> y, z (K x n x n, fisicos), d (K x 2)."""
    n, nn = p.n, p.n * p.n
    S = matriz_senos(n)
    K = X.shape[1]
    y = np.empty((K, n, n))
    z = np.empty((K, n, n))
    for k in range(K):
        y[k] = a_fisico(X[:nn, k].reshape(n, n, order="F"), S)
        z[k] = a_fisico(X[nn:2 * nn, k].reshape(n, n, order="F"), S)
    return y, z, X[2 * nn:2 * nn + 2, :].T.copy()


# --- version numpy (sin CasADi), para contrastar --------------------------------

def simula_np(p: Params, C: np.ndarray | None = None, g: np.ndarray | None = None,
              y0=None, d0=None, movil=False, F: np.ndarray | None = None):
    """Misma recurrencia en numpy. C: N x m x m (coeficientes), g: N x 2.

    En vez de C se puede dar F (N x n x n): el campo f ya evaluado en la malla.
    """
    n, dt = p.n, p.dt
    S = matriz_senos(n)
    Lam = autovalores(n)
    den = 1.0 / (1.0 + dt * (p.nu + p.mu * dt) * Lam)
    y0 = estado_inicial(p) if y0 is None else y0
    Yh = a_senos(y0, S)
    Zh = np.zeros_like(Yh)
    d = np.array(p.centro if d0 is None else d0, float)
    v = np.zeros(2)
    ys, zs, ds = [y0.copy()], [np.zeros_like(y0)], [d.copy()]
    for k in range(p.N):
        if movil and g is not None:
            v = v + dt * g[k]
            d = d + dt * v
        if C is not None:
            Bh = a_senos(ventana(p, d) * campo_control(p, C[k], d), S)
        elif F is not None:
            Bh = a_senos(ventana(p, d) * F[k], S)
        else:
            Bh = 0.0
        Yh = (Yh - dt * p.mu * Lam * Zh + dt * Bh) * den
        Zh = Zh + dt * Yh
        ys.append(a_fisico(Yh, S))
        zs.append(a_fisico(Zh, S))
        ds.append(d.copy())
    return np.array(ys), np.array(zs), np.array(ds)


# --- solucion analitica de un modo de Fourier (continuo) ----------------------

def modo_exacto(t, k, l, nu, mu):
    """y, z de un modo sin(k pi x) sin(l pi y), y(0) = 1, z(0) = 0, sin control.

    y' = -L (nu y + mu z), z' = y, L = (k^2 + l^2) pi^2. Exponencial de la
    matriz 2x2 por diagonalizacion (con raices complejas si las hay).
    """
    L = (k * k + l * l) * np.pi**2
    A = np.array([[-L * nu, -L * mu], [1.0, 0.0]])
    w, V = np.linalg.eig(A.astype(complex))
    c = np.linalg.solve(V, np.array([1.0, 0.0], complex))
    t = np.atleast_1d(t)
    sol = (V[:, :, None] * (c[:, None] * np.exp(np.outer(w, t)))[None]).sum(1).real
    return sol[0], sol[1]
