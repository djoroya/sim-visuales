#!/usr/bin/env python3
"""La heuristica «empujar y girar» del TFM (ec. 7.1-7.3), en CasADi.

    a_j = k [ h_r(r_j) (u_om - y_j) + h_p(phi_j) (y_j - u_om)^perp ]
    h_r(r) = -1/r + 1/r_pos          h_p(phi) = sat * (1 - cos phi_j)

donde r_j = |y_j - u_om| es la distancia del perro j al centro del rebano y
phi_j el angulo entre la direccion en la que el perro *deberia* estar y la
direccion en la que esta. El primer termino lo coloca a distancia r_pos del
rebano; el segundo lo hace girar alrededor hasta ponerse detras. Cuando ya
esta detras, phi = 0 y solo empuja.

Dos cosas que no estan en el TFM y hacen falta aqui:

  - **Tres perros.** La politica del TFM es para uno solo: todos los perros
    tendrian la misma consigna y se amontonarian detras del rebano (la fuerza
    g_pp los separaria a empujones). Se reparte el arco dando a cada perro un
    desfase psi_j: su direccion de consigna es la linea rebano->objetivo
    girada psi_j. Con tres perros, psi = (-psi_0, 0, +psi_0).

  - **La singularidad en el objetivo.** phi no esta definido cuando el rebano
    se posa justo sobre u_T. Se apaga el giro de forma continua con el factor
    sat = d/(d + d_par), igual que en `particulas/pastoreo/`.

Es la misma politica, con los mismos valores calibrados, que la version en
LAMMPS; aqui sirve de referencia y de arranque en caliente del optimizador.
"""

from __future__ import annotations

from dataclasses import dataclass

import casadi as ca
import numpy as np

from modelo import Params, media, trocea


@dataclass(frozen=True)
class Heuristica:
    k_pol: float = 2.5       # ganancia (calibrada en particulas/pastoreo/)
    r_pos: float = 45.0      # distancia a la que el perro se coloca del rebano
    d_par: float = 8.0       # regularizacion del giro cerca del objetivo
    psi: float = 0.7         # desfase angular entre perros (rad)
    eps: float = 1e-6

    def desfases(self, n_p: int) -> np.ndarray:
        if n_p == 1:
            return np.zeros(1)
        return np.linspace(-self.psi, self.psi, n_p)


def accion(z, p: Params, pol: Heuristica):
    """Devuelve la accion de los n_p perros como MX de 2*n_p x 1."""
    X, _, Y, _ = trocea(z, p)
    om = media(X)                                   # 2 x 1
    obj = ca.DM(list(p.objetivo))

    rd = Y - ca.repmat(om, 1, p.n_p)                # 2 x n_p: y_j - u_om
    r = ca.sqrt(rd[0, :] ** 2 + rd[1, :] ** 2 + pol.eps)
    h_r = -1.0 / r + 1.0 / pol.r_pos

    t = om - obj                                    # del objetivo al rebano
    tn = ca.sqrt(t[0] ** 2 + t[1] ** 2 + pol.eps)
    sat = tn / (tn + pol.d_par)

    cols = []
    for j, ps in enumerate(pol.desfases(p.n_p)):
        # direccion de consigna: la linea rebano->objetivo girada psi_j
        ex = (np.cos(ps) * t[0] - np.sin(ps) * t[1]) / tn
        ey = (np.sin(ps) * t[0] + np.cos(ps) * t[1]) / tn
        cosf = (ex * rd[0, j] + ey * rd[1, j]) / r[j]
        h_p = sat * (1.0 - cosf)
        ax = pol.k_pol * (-h_r[j] * rd[0, j] - h_p * rd[1, j])
        ay = pol.k_pol * (-h_r[j] * rd[1, j] + h_p * rd[0, j])
        cols.append(ca.vertcat(ax, ay))
    return ca.vertcat(*cols)


def func_accion(p: Params, pol: Heuristica) -> ca.Function:
    z = ca.MX.sym("z", p.n_est)
    return ca.Function("pi", [z], [accion(z, p, pol)], ["z"], ["a"])
