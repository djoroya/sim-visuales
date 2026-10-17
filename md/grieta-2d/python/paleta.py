#!/usr/bin/env python3
"""Mapa de color de la tension: azul profundo -> ambar.

Es el mismo que usa el visor web, definido aqui una sola vez para que la
imagen fija y la animacion salgan identicas. Se construye interpolando en
espacio Lab unos pocos puntos de control, de forma que la luminosidad crezca
de forma monotona: asi funciona tambien para quien no distingue bien los
colores y al imprimirlo en gris sigue leyendose.

Los extremos son los de la marca: el azul #14519b y un ambar calido #f59e0b.
"""

from __future__ import annotations

import numpy as np

# puntos de control (posicion, color), de frio a caliente
CONTROL = [
    (0.00, "#0b1f3a"),   # azul marino casi negro: sin tension
    (0.28, "#14519b"),   # el azul de la marca
    (0.52, "#3f8fc4"),   # azul claro
    (0.72, "#c9b07a"),   # arena
    (0.88, "#f59e0b"),   # ambar de la marca
    (1.00, "#fde68a"),   # ambar claro: la punta
]


def _rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float) / 255.0


def _a_lab(rgb):
    """sRGB -> Lab (D65), vectorizado sobre la ultima dimension."""
    m = rgb > 0.04045
    lin = np.where(m, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805],
                  [0.2126, 0.7152, 0.0722],
                  [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    d = 6 / 29
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


def _de_lab(lab):
    d = 6 / 29
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(f > d, f ** 3, 3 * d ** 2 * (f - 4 / 29))
    xyz = xyz * np.array([0.95047, 1.0, 1.08883])
    M = np.array([[3.2406, -1.5372, -0.4986],
                  [-0.9689, 1.8758, 0.0415],
                  [0.0557, -0.2040, 1.0570]])
    lin = xyz @ M.T
    m = lin > 0.0031308
    rgb = np.where(m, 1.055 * np.abs(lin) ** (1 / 2.4) - 0.055, 12.92 * lin)
    return np.clip(rgb, 0, 1)


def tabla(n: int = 256) -> np.ndarray:
    """Devuelve la paleta como enteros (n, 3) de 0 a 255."""
    xs = np.array([c[0] for c in CONTROL])
    lab = _a_lab(np.array([_rgb(c[1]) for c in CONTROL]))
    t = np.linspace(0, 1, n)
    interp = np.stack([np.interp(t, xs, lab[:, k]) for k in range(3)], axis=-1)
    # luminosidad estrictamente creciente, que es lo que hace legible el mapa
    interp[:, 0] = np.maximum.accumulate(interp[:, 0])
    return np.round(_de_lab(interp) * 255).astype(np.uint8)


def css(n: int = 12) -> str:
    """La misma paleta como lista de colores hex, para el visor."""
    t = tabla(n)
    return ", ".join("'#%02x%02x%02x'" % tuple(c) for c in t)


if __name__ == "__main__":
    t = tabla(256)
    L = _a_lab(t / 255.0)[:, 0]
    print("paleta de 256 pasos; luminosidad de %.1f a %.1f, monotona: %s"
          % (L[0], L[-1], bool(np.all(np.diff(L) >= -1e-9))))
    print(css(10))
