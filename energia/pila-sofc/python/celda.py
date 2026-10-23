"""Celda SOFC en régimen permanente: Nernst con la composición de salida menos pérdidas óhmica y de activación.

El ánodo y el cátodo son volúmenes bien mezclados, como en el modelo de parámetros concentrados de
AGRO-SOFC (Padullés et al., 2000): lo que sale tiene la composición de lo que hay dentro. Con H₂ como
combustible, por cada 2F de carga se consume 1 mol de H₂, se produce 1 de H₂O y se gasta ½ de O₂.

    V = E_Nernst(interfaz) − I·R_ohm(T) − η_act(I, T)
    E_Nernst = E₀(T) + (RT/2F) ln( x_H2 · √x_O2 / x_H2O )   con el H₂ y el H₂O en la interfaz del ánodo:
    x_H2,int = x_H2 − j/j_L,  x_H2O,int = x_H2O + j/j_L    (difusión por el poro; j_L corriente límite
                                                            a x_H2 = 1: la pérdida de concentración)
    η_act = (RT/F) asinh( j / 2 j₀(T) )         (Butler–Volmer simétrica, n = 2, α = ½)
    R_ohm(T), j₀(T): Arrhenius alrededor de 750 °C

Caudales en ml/min normales (0 °C, 1 atm), como en el banco de Del Zotto et al. (2021).
"""
import math
from dataclasses import dataclass

from termo import R, F, oxidacion_h2

ML_MIN_A_MOL_S = 1e-3 / 60 / 22.414      # ml/min normales → mol/s
X_O2_AIRE = 0.2095
T_REF = 1023.15                           # 750 °C


@dataclass
class Parametros:
    x_agua: float = 0.02         # agua efectiva a la entrada del ánodo (fugas): ~2 % según la tensión en vacío
    R_ohm: float = 0.10          # Ω a 750 °C (celda de 3,5 cm²)
    E_ohm: float = 60e3          # J/mol, energía de activación de la conducción iónica
    j0: float = 0.20             # A/cm² a 750 °C
    jL: float = 3.0              # A/cm², corriente límite de difusión del ánodo con H₂ puro
    E_act: float = 100e3         # J/mol
    area: float = 3.5            # cm²


def arrhenius(valor_ref, energia, T, signo):
    return valor_ref * math.exp(signo * energia / R * (1 / T - 1 / T_REF))


def punto(I, T, q_anodo, x_h2, q_aire, p: Parametros):
    """Tensión y desglose para una corriente I (A). Devuelve None si el combustible o el aire no alcanzan."""
    n_an = q_anodo * ML_MIN_A_MOL_S
    n_agua = p.x_agua / (1 - p.x_agua) * n_an
    n_tot = n_an + n_agua                                  # la reacción no cambia los moles del ánodo
    n_h2 = x_h2 * n_an - I / (2 * F)
    n_h2o = n_agua + I / (2 * F)
    n_aire = q_aire * ML_MIN_A_MOL_S
    n_o2 = X_O2_AIRE * n_aire - I / (4 * F)
    if n_h2 <= 0 or n_o2 <= 0:
        return None
    j = I / p.area
    x_h2s, x_h2os = n_h2 / n_tot, n_h2o / n_tot
    x_h2i, x_h2oi = x_h2s - j / p.jL, x_h2os + j / p.jL    # en la interfaz, tras difundir por el ánodo
    x_o2s = n_o2 / (n_aire - I / (4 * F))
    if x_h2i <= 0:
        return None
    E0 = -oxidacion_h2(T)[0] / (2 * F)
    E_salida = E0 + R * T / (2 * F) * math.log(x_h2s * math.sqrt(x_o2s) / x_h2os)
    E = E0 + R * T / (2 * F) * math.log(x_h2i * math.sqrt(x_o2s) / x_h2oi)
    r_ohm = arrhenius(p.R_ohm, p.E_ohm, T, +1)
    j0 = arrhenius(p.j0, p.E_act, T, -1)
    eta_ohm = I * r_ohm
    eta_act = R * T / F * math.asinh(I / p.area / (2 * j0))
    return {
        'V': E - eta_ohm - eta_act, 'E': E_salida, 'E0': E0, 'eta_conc': E_salida - E,
        'eta_ohm': eta_ohm, 'eta_act': eta_act,
        'utilizacion': (I / (2 * F)) / (x_h2 * n_an),
    }
