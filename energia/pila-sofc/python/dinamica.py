"""Pila SOFC dinámica de parámetros concentrados, con combustible mixto (H₂, CO, CH₄).

Traslación del modelo de AGRO-SOFC (SOFC_meca, Simulink), que sigue el esquema de Padullés, Ault y
McDonald (2000) ampliado a mezclas:

- Ánodo y cátodo son volúmenes isotermos bien mezclados con 7 especies (H₂, O₂, H₂O, N₂, CO, CH₄, CO₂).
  Moles: dn/dt = q_in − q_out + N₀ r(I);  presión parcial p = n R T / V;  salida por válvula q_out = K_v p.
  En el original, K_v = K/√M por especie («raiz_masa»); con «igual», la misma para todas, y entonces la
  composición del volumen es la de la salida.
- Electroquímica (Faraday): la corriente se reparte entre H₂, CO y CH₄ según su fracción en la entrada;
  n_e = 2(x_H2 + x_CO + 4 x_CH4) electrones por mol de mezcla. El CH₄ se oxida directamente (sin reformado
  interno): es la simplificación del original. El cátodo pierde I/4F de O₂ por celda.
- Tensión de Nernst de la mezcla: E₀ = ΔG/(n_e F) y E = E₀ + RT/(n_e F) Σ ν ln(p/P). Tensión termoneutra
  E_T = ΔH/(n_e F); calor generado por la pila: N₀ I (E_T − V_celda).
- Tensión de la pila: modo «original», V = N₀ E − r I (solo pérdida óhmica); modo «calibrado», por celda
  V = E − η_conc − η_ohm − η_act con los parámetros ajustados a Del Zotto et al. (2021) (celda.py,
  ajuste.py), escalados al área de celda.
"""
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

from termo import R, F, entalpia, gibbs

ESPECIES = ['H2', 'O2', 'H2O', 'N2', 'CO', 'CH4', 'CO2']
M = np.array([2.016, 31.998, 18.015, 28.014, 28.010, 16.043, 44.009]) * 1e-3     # kg/mol
ATM = 101325.0
H2, O2, H2O, N2, CO, CH4, CO2 = range(7)
AJUSTE = Path(__file__).resolve().parent.parent / 'datos' / 'celda-ajuste.json'


@dataclass
class Pila:
    N0: int = 30                    # celdas en serie
    area: float = 100.0             # cm² por celda (solo modo calibrado)
    Va: float = 0.5                 # m³
    Vc: float = 0.5
    T: float = 1023.15              # K (isoterma)
    K_an: float = 0.005             # kmol/(atm·s), constante de válvula (original: 0,005; Padullés: 0,0377)
    K_cat: float = 0.005
    valvula: str = 'raiz_masa'      # 'raiz_masa' (original) o 'igual'
    modo: str = 'calibrado'         # 'original' o 'calibrado'
    r: float = 0.15                 # Ω de toda la pila (modo original)
    celda: dict = field(default_factory=lambda: json.loads(AJUSTE.read_text())['parametros'] if AJUSTE.exists() else {})

    def kv(self, K):
        """Constantes de válvula por especie en mol/(Pa·s)."""
        K_si = K * 1e3 / ATM
        return K_si / np.sqrt(M) if self.valvula == 'raiz_masa' else np.full(7, K_si / math.sqrt(M[H2]))


def reparto(qa_in):
    """Fracciones de la entrada, electrones por mol de mezcla y coeficientes de la reacción global."""
    la = qa_in / qa_in.sum()
    a = {'H2': la[H2], 'CO': la[CO], 'CH4': la[CH4], 'O2': 0.5 * (la[H2] + la[CO] + 4 * la[CH4])}
    b = {'H2O': la[H2] + 2 * la[CH4], 'CO2': la[CO] + la[CH4]}
    ne = 2 * (la[H2] + la[CO] + 4 * la[CH4])
    return la, a, b, ne


def velocidades(I, qa_in, N0):
    """mol/s generados (+) o consumidos (−) en ánodo y cátodo por toda la pila."""
    la, a, b, ne = reparto(qa_in)
    ra, rc = np.zeros(7), np.zeros(7)
    if ne > 0 and I != 0:
        k = N0 * I / (F * ne)
        ra[H2], ra[CO], ra[CH4] = -a['H2'] * k, -a['CO'] * k, -a['CH4'] * k
        ra[H2O], ra[CO2] = b['H2O'] * k, b['CO2'] * k
        rc[O2] = -N0 * I / (4 * F)
    return ra, rc


def nernst(T, qa_in, pa, pc):
    """E por celda (V), E₀ y tensión termoneutra E_T de la mezcla, con presiones en Pa."""
    la, a, b, ne = reparto(qa_in)
    G = (a['H2'] * gibbs('H2', T) + a['CO'] * gibbs('CO', T) + a['CH4'] * gibbs('CH4', T) + a['O2'] * gibbs('O2', T)
         - b['H2O'] * gibbs('H2O', T) - b['CO2'] * gibbs('CO2', T))
    H = (a['H2'] * entalpia('H2', T) + a['CO'] * entalpia('CO', T) + a['CH4'] * entalpia('CH4', T) + a['O2'] * entalpia('O2', T)
         - b['H2O'] * entalpia('H2O', T) - b['CO2'] * entalpia('CO2', T))
    E0, ET = G / (F * ne), H / (F * ne)
    termino = 0.0
    for coef, p in ((a['H2'], pa[H2]), (a['CO'], pa[CO]), (a['CH4'], pa[CH4]), (a['O2'], pc[O2]),
                    (-b['H2O'], pa[H2O]), (-b['CO2'], pa[CO2])):
        if coef != 0 and p > 0:          # como el original: una especie ausente no entra en la suma
            termino += coef * math.log(p / ATM)
    return E0 + R * T / (ne * F) * termino, E0, ET


def tension(pila: Pila, I, qa_in, pa, pc):
    """Tensión de la pila (V), por celda y desglose de pérdidas (V por celda)."""
    E, E0, ET = nernst(pila.T, qa_in, pa, pc)
    if pila.modo == 'original':
        V = pila.N0 * E - pila.r * I
        return {'V': V, 'V_celda': V / pila.N0, 'E': E, 'E0': E0, 'ET': ET, 'eta_ohm': pila.r * I / pila.N0, 'eta_act': 0.0, 'eta_conc': 0.0}
    c, T, A = pila.celda, pila.T, pila.area
    j = I / A
    arr = lambda ref, e, s: ref * math.exp(s * e / R * (1 / T - 1 / 1023.15))  # noqa: E731
    r_cm2 = arr(c['R_ohm'] * c['area'], c['E_ohm'], +1)                         # Ω·cm²
    j0 = arr(c['j0'], c['E_act'], -1)
    eta_ohm = j * r_cm2
    eta_act = R * T / F * math.asinh(j / (2 * j0))
    # Concentración: el combustible y los productos tienen que atravesar el ánodo (equivale al paso 1 con H₂).
    ptot = pa.sum()
    xf = (pa[H2] + pa[CO] + 4 * pa[CH4]) / ptot
    xp = (pa[H2O] + pa[CO2]) / ptot
    d = j / c['jL']
    eta_conc = R * T / (2 * F) * math.log(xf / (xf - d) * (xp + d) / xp) if xf > d and xp > 0 else float('inf')
    Vc = E - eta_ohm - eta_act - eta_conc
    return {'V': pila.N0 * Vc, 'V_celda': Vc, 'E': E, 'E0': E0, 'ET': ET, 'eta_ohm': eta_ohm, 'eta_act': eta_act, 'eta_conc': eta_conc}


def simular(pila: Pila, t_fin, I_de_t, qa_de_t, qc_de_t, n0=None, puntos=400, rtol=1e-9):
    """Integra los moles de ánodo y cátodo. I_de_t, qa_de_t, qc_de_t: funciones del tiempo (A, mol/s por especie)."""
    kva, kvc = pila.kv(pila.K_an), pila.kv(pila.K_cat)
    RT = R * pila.T

    def f(t, n):
        na, nc = n[:7], n[7:]
        pa, pc = na * RT / pila.Va, nc * RT / pila.Vc
        qa, qc = qa_de_t(t), qc_de_t(t)
        ra, rc = velocidades(I_de_t(t), qa, pila.N0)
        return np.concatenate([qa - kva * pa + ra, qc - kvc * pc + rc])

    if n0 is None:
        n0 = np.concatenate([qa_de_t(0) / kva * pila.Va / RT, qc_de_t(0) / kvc * pila.Vc / RT])  # régimen sin corriente
    t = np.linspace(0, t_fin, puntos)
    sol = solve_ivp(f, (0, t_fin), n0, method='LSODA', t_eval=t, rtol=rtol, atol=1e-14, max_step=t_fin / 200)
    return sol
