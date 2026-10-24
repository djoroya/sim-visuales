"""Reformador de diésel (o de cualquier CₙHₘ) en equilibrio químico.

    python python/equilibrio.py            # ejemplo: un caso y un barrido de temperatura

A la salida del reformador el gas se supone en equilibrio a su temperatura: entre todas las mezclas de
CH₄, CO, CO₂, H₂, H₂O, N₂, Ar y grafito (hollín) que conservan los átomos que entran, la que tiene la
energía de Gibbs mínima,

    G/RT = Σ_gas nᵢ (gᵢ/RT + ln(nᵢ/n_gas · P/P°)) + n_C g_C/RT,   con  A·n = b  (C, H, O, N, Ar),  n ≥ 0.

Es lo mismo que imponer los tres equilibrios del reformado (CH₄ + H₂O ⇌ CO + 3H₂), el desplazamiento del
agua (CO + H₂O ⇌ CO₂ + H₂) y el del hollín (CH₄ ⇌ C + 2H₂, o 2CO ⇌ C + CO₂), pero el hollín aparece solo
cuando toca, sin decidirlo a mano. El problema es convexo: un mínimo, y SLSQP lo encuentra en pocas
iteraciones.

Termodinámica: gases con Shomate (NIST, `termo.py`); grafito con la tabla JANAF (C-002, referencia).
"""
import math
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent))
from termo import R, gibbs  # noqa: E402

GASES = ["CH4", "CO", "CO2", "H2", "H2O", "N2", "Ar"]
ESPECIES = GASES + ["C"]
# átomos de cada especie: C, H, O, N, Ar
ATOMOS = np.array([
    [1, 1, 1, 0, 0, 0, 0, 1],   # C
    [4, 0, 0, 2, 2, 0, 0, 0],   # H
    [0, 1, 2, 0, 1, 0, 0, 0],   # O
    [0, 0, 0, 0, 0, 2, 0, 0],   # N
    [0, 0, 0, 0, 0, 0, 1, 0],   # Ar
], float)

# Grafito, JANAF C-002: T (K), H − H(298) (kJ/mol), S (J/(mol·K)).
_JANAF_C = np.array([
    [298.15, 0.0, 5.740], [400, 1.039, 8.713], [500, 2.365, 11.662], [600, 3.943, 14.533],
    [700, 5.716, 17.263], [800, 7.637, 19.826], [900, 9.672, 22.221], [1000, 11.795, 24.457],
    [1100, 13.989, 26.548], [1200, 16.240, 28.506], [1300, 18.539, 30.346], [1400, 20.879, 32.080],
    [1500, 23.253, 33.718], [1600, 25.658, 35.270],
])


def gibbs_grafito(T):
    """J/mol, con el mismo convenio que Shomate (H de formación del grafito = 0, S absoluta)."""
    if not 298.15 <= T <= 1600:
        raise ValueError(f"T fuera de la tabla del grafito: {T} K")
    H = np.interp(T, _JANAF_C[:, 0], _JANAF_C[:, 1]) * 1e3
    S = np.interp(T, _JANAF_C[:, 0], _JANAF_C[:, 2])
    return H - T * S


def _g_rt(T):
    """g/RT de cada especie (gases a 1 bar)."""
    return np.array([gibbs(e, T) for e in GASES if e not in ("N2", "Ar")] + [0.0, 0.0] + [gibbs_grafito(T)]) / (R * T)
    # N₂ y Ar no reaccionan: su g da igual (sus moles están fijados por los balances de N y Ar)


def equilibrio(b, T, P=1.0):
    """Moles de equilibrio [CH4, CO, CO2, H2, H2O, N2, Ar, C] para unos átomos b = [C, H, O, N, Ar] (mol),
    a T (K) y P (bar)."""
    b = np.asarray(b, float)
    g = _g_rt(T)
    ng = len(GASES)
    escala = max(b.sum(), 1e-12)
    bb = b / escala                                  # se trabaja con ~1 mol en total

    def G(n):
        ngas = n[:ng]; tot = ngas.sum()
        ln = np.log(np.maximum(ngas, 1e-30) / max(tot, 1e-30) * P)
        return float(ngas @ (g[:ng] + ln) + n[ng] * g[ng])

    def dG(n):
        ngas = n[:ng]; tot = ngas.sum()
        return np.r_[g[:ng] + np.log(np.maximum(ngas, 1e-30) / max(tot, 1e-30) * P), g[ng]]

    # punto de partida factible: C en CO/CO₂, H en H₂/H₂O, sin hollín
    n0 = np.full(ng + 1, 1e-6)
    n0[5], n0[6] = bb[3] / 2, bb[4]
    o = bb[2]; c = bb[0]
    n0[1] = min(c, o); o -= n0[1]; c -= n0[1]
    n0[2] = min(c, o / 1) if o > 0 else 0; o -= n0[2]
    n0[7] = max(c - n0[2], 0)
    n0[4] = max(min(o, bb[1] / 2), 1e-6); n0[3] = max(bb[1] / 2 - n0[4], 1e-6)
    res = minimize(G, n0, jac=dG, method="SLSQP", bounds=[(0, None)] * (ng + 1),
                   constraints={"type": "eq", "fun": lambda n: ATOMOS @ n - bb, "jac": lambda n: ATOMOS},
                   options={"ftol": 1e-14, "maxiter": 500})
    if not res.success:
        raise RuntimeError(res.message)
    return res.x * escala


def atomos_diesel(caudal_diesel, vapor_combustible, aire_combustible, wC=0.844, wH=0.156):
    """Átomos (mol/s) que entran: diésel (fracciones másicas de C e H), vapor y aire, con relaciones
    másicas vapor/combustible y aire/combustible."""
    mC, mH = 12.011e-3, 1.008e-3
    nC = caudal_diesel * wC / mC
    nH = caudal_diesel * wH / mH
    vapor = caudal_diesel * vapor_combustible / 18.015e-3
    aire = caudal_diesel * aire_combustible / 28.96e-3          # aire seco: 78,08 % N₂, 20,95 % O₂, 0,93 % Ar
    return np.array([nC, nH + 2 * vapor, vapor + 2 * 0.2095 * aire, 2 * 0.7808 * aire, 0.0093 * aire])


X_DIESEL = (0.156 / 1.008) / (0.844 / 12.011)          # H/C del diésel: CH₂,₂₀


def hay_hollin(sc, o2c, T, x=X_DIESEL):
    """¿Forma grafito el equilibrio de CHₓ con S/C moles de vapor y O₂/C moles de O₂ (en aire) por átomo de C?"""
    aire = o2c / 0.2095
    b = np.array([1.0, x + 2 * sc, sc + 2 * o2c, 2 * 0.7808 * aire, 0.0093 * aire])
    return equilibrio(b, T)[ESPECIES.index("C")] > 1e-6


def sc_minima(o2c, T, x=X_DIESEL, tope=4.0):
    """Frontera del hollín: la mínima S/C sin grafito (bisección)."""
    a, b = 0.0, tope
    for _ in range(30):
        m = (a + b) / 2
        a, b = (m, b) if hay_hollin(m, o2c, T, x) else (a, m)
    return b


if __name__ == "__main__":
    b = atomos_diesel(1e-3, 1.5, 3.0)
    for Tc in (500, 600, 700, 800, 900):
        n = equilibrio(b, Tc + 273.15)
        y = n / n.sum()
        print(f"{Tc} °C  " + "  ".join(f"{e} {100 * v:5.1f}" for e, v in zip(ESPECIES, y)))
