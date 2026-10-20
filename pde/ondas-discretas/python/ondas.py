#!/usr/bin/env python3
"""Ecuacion de ondas semidiscretizada con diferencias finitas en mallas no uniformes.

Modelo (Biccari, Marica y Zuazua, FoCM 2020, sec. 2.1 y 3.1):

    u_tt - u_xx = 0 en (-1, 1),  u(+-1, t) = 0

Malla uniforme de calculo x_j = -1 + j h, h = 2/(N+1), j = 0..N+1, y malla
fisica g_j = g(x_j) con g un difeomorfismo de [-1, 1]. Con
h_{j+1/2} = g_{j+1} - g_j y m_j = (h_{j+1/2} + h_{j-1/2})/2 el esquema es

    m_j u_j'' = (u_{j+1} - u_j)/h_{j+1/2} - (u_j - u_{j-1})/h_{j-1/2}

es decir M u'' = -K u, con M diagonal y K tridiagonal simetrica. En 2D el
operador es la suma tensorial de dos copias del 1D (malla producto).

Integracion temporal: exacta. Con w = M^{1/2} u el sistema es w'' = -S w,
S = M^{-1/2} K M^{-1/2} simetrica; se diagonaliza una vez (S = Q L Q^T) y

    u(t) = M^{-1/2} Q exp(i t sqrt(L)) Q^T M^{1/2} u0

que es la rama e^{+i omega t}: un solo paquete (el mismo dato que usa el codigo
original, u1 = i sqrt(A) u0). Para contrastar se incluye tambien el leapfrog
con dt = 0.1 h del articulo.

Rayos (bicaracteristicas del simbolo discreto), en la coordenada de calculo x
y con c(x) = 1/g'(x), lambda(x, xi) = 2 sin(xi/2) c(x):

    1D:  x' = -cos(xi/2) c(x)            xi' = 2 sin(xi/2) c'(x)
    2D:  x' = -(l1/r0) cos(xi/2) c(x)    xi' = (l1/r0) 2 sin(xi/2) c'(x)
         (y, eta) igual con l2;  r0 = sqrt(l1^2 + l2^2) se conserva

con xi en [0, 2 pi] y reflexion de Descartes-Snell xi -> 2 pi - xi en x = +-1.
El signo es el de la rama e^{+i omega t}: a baja frecuencia el paquete va
hacia la izquierda, como en el articulo.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import eigh_tridiagonal

PI = np.pi


# --------------------------------------------------------------------- mallas
@dataclass(frozen=True)
class Malla:
    nombre: str
    g: callable      # coordenada fisica X = g(x)
    ginv: callable   # x = g^{-1}(X)
    c: callable      # 1/g'(x)
    dc: callable     # (1/g')'(x)


MALLAS = {
    "uniforme": Malla(
        "uniforme",
        g=lambda x: np.asarray(x, float),
        ginv=lambda X: np.asarray(X, float),
        c=lambda x: np.ones_like(np.asarray(x, float)),
        dc=lambda x: np.zeros_like(np.asarray(x, float)),
    ),
    # g1(x) = tan(pi x / 4): refinada en el centro, gruesa en los bordes
    "g1": Malla(
        "g1",
        g=lambda x: np.tan(PI * np.asarray(x) / 4),
        ginv=lambda X: 4 / PI * np.arctan(X),
        c=lambda x: 4 / PI * np.cos(PI * np.asarray(x) / 4) ** 2,
        dc=lambda x: -np.sin(PI * np.asarray(x) / 2),
    ),
    # g2(x) = 2 sin(pi x / 6): refinada en los bordes, gruesa en el centro
    "g2": Malla(
        "g2",
        g=lambda x: 2 * np.sin(PI * np.asarray(x) / 6),
        ginv=lambda X: 6 / PI * np.arcsin(np.asarray(X) / 2),
        c=lambda x: 3 / (PI * np.cos(PI * np.asarray(x) / 6)),
        dc=lambda x: np.sin(PI * np.asarray(x) / 6)
        / (2 * np.cos(PI * np.asarray(x) / 6) ** 2),
    ),
}


# ------------------------------------------------------------------ operador
class Operador1D:
    """Semidiscretizacion 1D en la malla g(G_h) con N nodos interiores."""

    def __init__(self, N: int, malla: str = "uniforme", autovectores=True):
        self.N = N
        self.malla = MALLAS[malla]
        self.h = 2.0 / (N + 1)
        xs = -1 + self.h * np.arange(N + 2)
        self.x_todo = xs
        self.X_todo = self.malla.g(xs)
        self.x = xs[1:-1]
        self.X = self.X_todo[1:-1]
        self.hm = np.diff(self.X_todo)              # h_{j+1/2}, j = 0..N
        self.m = 0.5 * (self.hm[1:] + self.hm[:-1])  # m_j, j = 1..N
        inv = 1.0 / self.hm
        self.Kd = inv[1:] + inv[:-1]
        self.Ko = -inv[1:-1]
        self.sm = np.sqrt(self.m)
        if autovectores:
            d = self.Kd / self.m
            e = self.Ko / (self.sm[1:] * self.sm[:-1])
            lam, Q = eigh_tridiagonal(d, e)
            self.lam = lam
            self.om = np.sqrt(np.maximum(lam, 0.0))
            self.Q = Q

    # u -> coeficientes espectrales y vuelta
    def a_espectro(self, u):
        return self.Q.T @ (self.sm[:, None] * u if u.ndim == 2 else self.sm * u)

    def de_espectro(self, c):
        return (self.Q @ c) / (self.sm[:, None] if c.ndim == 2 else self.sm)

    def K_por(self, u):
        """K u (con u_0 = u_{N+1} = 0)."""
        r = self.Kd * u
        r[:-1] += self.Ko * u[1:]
        r[1:] += self.Ko * u[:-1]
        return r


def dato_gaussiano(op: Operador1D, X0: float, xi0: float, gamma=None):
    """Haz gaussiano (2.10): exp(-gamma/2 (x - x0)^2) exp(i xi0 x / h),

    con x la coordenada de calculo, x0 = g^{-1}(X0) y gamma = h^{-0.9}."""
    if gamma is None:
        gamma = op.h ** -0.9
    x0 = float(op.malla.ginv(X0))
    return np.exp(-0.5 * gamma * (op.x - x0) ** 2) * np.exp(1j * xi0 * op.x / op.h)


def evoluciona_1d(op: Operador1D, u0, t):
    """Solucion exacta en tiempo, rama e^{+i omega t}. Devuelve u y u_t (N, nt)."""
    c0 = op.a_espectro(u0)
    fase = np.exp(1j * op.om[:, None] * np.asarray(t)[None, :])
    c = c0[:, None] * fase
    u = op.de_espectro(c)
    ut = op.de_espectro(1j * op.om[:, None] * c)
    return u, ut


def leapfrog_1d(op: Operador1D, u0, T, cfl=0.1, guarda=None):
    """Leapfrog del articulo, dt = cfl * h. Arranque con la solucion exacta en dt.

    guarda: tiempos (crecientes) en los que se devuelve la solucion."""
    dt = cfl * op.h
    n = int(np.ceil(T / dt))
    dt = T / n
    u_prev = u0.astype(complex)
    u_act, _ = evoluciona_1d(op, u0, np.array([dt]))
    u_act = u_act[:, 0]
    guarda = np.array([T] if guarda is None else guarda)
    idx = np.round(guarda / dt).astype(int)
    out = np.zeros((op.N, len(guarda)), complex)
    for k, i in enumerate(idx):
        if i == 0:
            out[:, k] = u_prev
    paso = 1
    k_sig = np.searchsorted(idx, 1)
    while paso < n:
        if k_sig < len(idx) and idx[k_sig] == paso:
            out[:, k_sig] = u_act
            k_sig += 1
        u_sig = 2 * u_act - u_prev - dt * dt * op.K_por(u_act) / op.m
        u_prev, u_act = u_act, u_sig
        paso += 1
    while k_sig < len(idx) and idx[k_sig] == paso:
        out[:, k_sig] = u_act
        k_sig += 1
    return out, dt


def energia_1d(op: Operador1D, u, ut):
    """Densidad de energia nodal (N, nt); su suma es la energia discreta exacta."""
    kin = 0.5 * op.m[:, None] * np.abs(ut) ** 2
    ue = np.zeros((op.N + 2,) + u.shape[1:], complex)
    ue[1:-1] = u
    pot_arista = np.abs(np.diff(ue, axis=0)) ** 2 / op.hm[:, None]  # N+1 aristas
    pot = 0.25 * (pot_arista[1:] + pot_arista[:-1])
    # las aristas del borde solo tienen un nodo interior: se lo lleva entero
    pot[0] += 0.25 * pot_arista[0]
    pot[-1] += 0.25 * pot_arista[-1]
    return kin + pot


def momentos_1d(op: Operador1D, u, e):
    """Centro de energia (fisico y de calculo), anchura y frecuencia local."""
    E = e.sum(0)
    Xc = (op.X[:, None] * e).sum(0) / E
    xc = (op.x[:, None] * e).sum(0) / E
    sx = np.sqrt(np.maximum((op.x[:, None] ** 2 * e).sum(0) / E - xc ** 2, 0))
    xi = np.mod(np.angle((np.conj(u[:-1]) * u[1:]).sum(0)), 2 * PI)
    return dict(E=E, X=Xc, x=xc, sx=sx, xi=xi)


# --------------------------------------------------------------------- rayos
def _rhs(malla: Malla, r0):
    def f(t, s):
        x, xi = s[0::2], s[1::2]
        l = 2 * np.sin(xi / 2) * malla.c(x)
        w = l / r0 if r0 is not None else np.ones_like(l)
        dx = -w * np.cos(xi / 2) * malla.c(x)
        dxi = w * 2 * np.sin(xi / 2) * malla.dc(x)
        out = np.empty_like(s)
        out[0::2], out[1::2] = dx, dxi
        return out
    return f


def rayo(malla: str, x0, xi0, t, r0=None, rtol=1e-11, atol=1e-12):
    """Integra el rayo en coordenada de calculo con reflexiones en x = +-1.

    x0, xi0: listas (una entrada por direccion). Para 2D se pasa r0, el valor
    conservado de sqrt(l1^2 + l2^2). Devuelve (x, xi) en los tiempos t."""
    m = MALLAS[malla]
    t = np.asarray(t, float)
    s0 = np.empty(2 * len(x0))
    s0[0::2], s0[1::2] = x0, xi0
    f = _rhs(m, r0)
    nd = len(x0)
    sal = np.zeros((len(t), 2 * nd))

    def evento(d, lado):
        def ev(tt, s):
            return s[2 * d] - lado
        ev.terminal = True
        ev.direction = 1 if lado > 0 else -1
        return ev

    eventos = [evento(d, l) for d in range(nd) for l in (1.0, -1.0)]
    ta, sa = 0.0, s0.copy()
    hechos = np.zeros(len(t), bool)
    while ta < t[-1]:
        r = solve_ivp(f, (ta, t[-1]), sa, method="DOP853", rtol=rtol, atol=atol,
                      events=eventos, dense_output=True)
        tfin = r.t[-1]
        sel = (~hechos) & (t <= tfin + 1e-14)
        if sel.any():
            sal[sel] = r.sol(t[sel]).T
            hechos |= sel
        if r.status == 1:      # choque con el borde: reflexion xi -> 2 pi - xi
            sa = r.y[:, -1].copy()
            for k, te in enumerate(r.t_events):
                if len(te):
                    d = k // 2
                    sa[2 * d] = np.clip(sa[2 * d], -1, 1) * (1 - 1e-13)
                    sa[2 * d + 1] = 2 * PI - sa[2 * d + 1]
            ta = tfin
        else:
            break
    return sal[:, 0::2], np.mod(sal[:, 1::2], 2 * PI)


def r0_2d(malla: str, x0, xi0, y0, eta0):
    m = MALLAS[malla]
    l1 = 2 * np.sin(xi0 / 2) * m.c(x0)
    l2 = 2 * np.sin(eta0 / 2) * m.c(y0)
    return float(np.hypot(l1, l2))


# ------------------------------------------------------------------------ 2D
class Operador2D:
    """Malla producto g(G_h) x g(G_h); operador = suma tensorial de dos 1D."""

    def __init__(self, N: int, malla: str = "uniforme"):
        self.o = Operador1D(N, malla)
        o = self.o
        self.N, self.h, self.malla = N, o.h, o.malla
        self.lam2 = o.lam[:, None] + o.lam[None, :]
        self.om2 = np.sqrt(np.maximum(self.lam2, 0))
        self.QT = np.ascontiguousarray(o.Q.T)

    @staticmethod
    def _rc(A, B, C):
        """A @ B @ C con A y C reales y B compleja (sin pasar A, C a complejo)."""
        return (A @ B.real @ C) + 1j * (A @ B.imag @ C)

    def a_espectro(self, U):
        o = self.o
        return self._rc(self.QT, o.sm[:, None] * U * o.sm[None, :], o.Q)

    def de_espectro(self, C):
        o = self.o
        return self._rc(o.Q, C, self.QT) / (o.sm[:, None] * o.sm[None, :])

    def dato(self, X0, Y0, xi0, eta0, gamma=None):
        o = self.o
        if gamma is None:
            gamma = o.h ** -0.9
        x0, y0 = float(o.malla.ginv(X0)), float(o.malla.ginv(Y0))
        gx = np.exp(-0.5 * gamma * (o.x - x0) ** 2) * np.exp(1j * xi0 * o.x / o.h)
        gy = np.exp(-0.5 * gamma * (o.x - y0) ** 2) * np.exp(1j * eta0 * o.x / o.h)
        return gx[:, None] * gy[None, :]

    def en_t(self, C0, t, derivada=True):
        C = C0 * np.exp(1j * self.om2 * t)
        U = self.de_espectro(C)
        Ut = self.de_espectro(1j * self.om2 * C) if derivada else None
        return U, Ut

    def energia(self, U, Ut):
        """Densidad nodal de energia; suma = energia discreta (indice [x, y])."""
        o = self.o
        m = o.m
        kin = 0.5 * m[:, None] * m[None, :] * np.abs(Ut) ** 2
        Ue = np.zeros((self.N + 2, self.N + 2), complex)
        Ue[1:-1, 1:-1] = U
        ax = np.abs(np.diff(Ue[:, 1:-1], axis=0)) ** 2 / o.hm[:, None] * m[None, :]
        ay = np.abs(np.diff(Ue[1:-1, :], axis=1)) ** 2 / o.hm[None, :] * m[:, None]
        pot = 0.25 * (ax[1:] + ax[:-1] + ay[:, 1:] + ay[:, :-1])
        pot[0, :] += 0.25 * ax[0]
        pot[-1, :] += 0.25 * ax[-1]
        pot[:, 0] += 0.25 * ay[:, 0]
        pot[:, -1] += 0.25 * ay[:, -1]
        return kin + pot

    def energia_espectral(self, C0):
        return float((self.lam2 * np.abs(C0) ** 2).sum())

    def momentos(self, e):
        o = self.o
        E = e.sum()
        px, py = e.sum(1), e.sum(0)
        return dict(E=E, X=(o.X * px).sum() / E, Y=(o.X * py).sum() / E,
                    x=(o.x * px).sum() / E, y=(o.x * py).sum() / E)
