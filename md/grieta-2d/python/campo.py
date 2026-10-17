#!/usr/bin/env python3
"""Suavizado espacial de un campo por atomo.

La tension por atomo que da LAMMPS es muy ruidosa: el virial instantaneo de
un solo atomo fluctua mucho mas que el campo macroscopico que se quiere ver.
El promedio temporal (fix ave/atom) quita parte, pero lo que de verdad hace
legible el campo es promediar en el espacio, que es lo que hace cualquier
programa de visualizacion de dinamica molecular.

Se hace con una rejilla en vez de buscando vecinos: se reparten los atomos en
celdas, se promedia por celda, se convoluciona la rejilla con una gaussiana
separable y se devuelve el valor interpolado en cada atomo. Es O(N) y no
necesita scipy.
"""

from __future__ import annotations

import numpy as np


def _gauss1d(sigma_celdas: float):
    r = max(1, int(np.ceil(3 * sigma_celdas)))
    x = np.arange(-r, r + 1)
    k = np.exp(-0.5 * (x / sigma_celdas) ** 2)
    return k / k.sum()


def _convolve(m, k, eje):
    r = (len(k) - 1) // 2
    pad = [(0, 0), (0, 0)]
    pad[eje] = (r, r)
    ext = np.pad(m, pad, mode="edge")
    sal = np.zeros_like(m)
    for i, w in enumerate(k):
        corte = [slice(None), slice(None)]
        corte[eje] = slice(i, i + m.shape[eje])
        sal += w * ext[tuple(corte)]
    return sal


def rejilla(xy: np.ndarray, valor: np.ndarray, celda: float = 1.4,
            sigma: float = 1.6, sigma_dens: float | None = None):
    """Igual que `suaviza`, pero devuelve la rejilla (campo, densidad, limites).

    Sirve para pintar el campo como una imagen continua en vez de atomo a
    atomo: para un fondo de pagina se ve mas limpio y, sobre todo, un video
    de un campo suave pesa una fraccion de lo que pesa uno lleno de discos.
    """
    mn = xy.min(axis=0)
    mx = xy.max(axis=0)
    nx = max(3, int(np.ceil((mx[0] - mn[0]) / celda)) + 1)
    ny = max(3, int(np.ceil((mx[1] - mn[1]) / celda)) + 1)
    ix = np.clip(((xy[:, 0] - mn[0]) / celda).astype(int), 0, nx - 1)
    iy = np.clip(((xy[:, 1] - mn[1]) / celda).astype(int), 0, ny - 1)
    suma = np.zeros((nx, ny))
    cuenta = np.zeros((nx, ny))
    np.add.at(suma, (ix, iy), valor)
    np.add.at(cuenta, (ix, iy), 1.0)
    k = _gauss1d(sigma / celda)
    suma = _convolve(_convolve(suma, k, 0), k, 1)
    peso = _convolve(_convolve(cuenta, k, 0), k, 1)
    campo = np.where(peso > 1e-9, suma / np.maximum(peso, 1e-9), 0.0)
    # la densidad lleva su propio suavizado, mucho menor: si se difumina
    # tanto como el campo, el hueco de la grieta se rellena y desaparece
    kd = _gauss1d(max(sigma_dens if sigma_dens else celda * 0.6, 0.3) / celda)
    dens = _convolve(_convolve(cuenta, kd, 0), kd, 1)
    lim = (mn[0], mn[0] + nx * celda, mn[1], mn[1] + ny * celda)
    return campo, dens, lim


def suaviza(xy: np.ndarray, valor: np.ndarray, celda: float = 1.4,
            sigma: float = 1.6) -> np.ndarray:
    """Devuelve el campo suavizado en la posicion de cada atomo.

    `celda` es el lado de la rejilla y `sigma` el ancho del suavizado, ambos
    en unidades de longitud (no de celdas).
    """
    mn = xy.min(axis=0)
    mx = xy.max(axis=0)
    nx = max(3, int(np.ceil((mx[0] - mn[0]) / celda)) + 1)
    ny = max(3, int(np.ceil((mx[1] - mn[1]) / celda)) + 1)
    ix = np.clip(((xy[:, 0] - mn[0]) / celda).astype(int), 0, nx - 1)
    iy = np.clip(((xy[:, 1] - mn[1]) / celda).astype(int), 0, ny - 1)

    suma = np.zeros((nx, ny))
    cuenta = np.zeros((nx, ny))
    np.add.at(suma, (ix, iy), valor)
    np.add.at(cuenta, (ix, iy), 1.0)

    k = _gauss1d(sigma / celda)
    suma = _convolve(_convolve(suma, k, 0), k, 1)
    cuenta = _convolve(_convolve(cuenta, k, 0), k, 1)
    campo = np.where(cuenta > 1e-9, suma / np.maximum(cuenta, 1e-9), 0.0)
    return campo[ix, iy]
