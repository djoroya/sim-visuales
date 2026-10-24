"""Termodinámica de los gases de la pila: ecuaciones de Shomate con los coeficientes del NIST WebBook.

    H [kJ/mol] = A t + B t²/2 + C t³/3 + D t⁴/4 − E/t + F          (incluye la entalpía de formación)
    S [J/(mol K)] = A ln t + B t + C t²/2 + D t³/3 − E/(2 t²) + G
    G [J/mol] = 1000 H − T S,  con t = T/1000

Fuente: NIST Chemistry WebBook, SRD 69, «Gas phase thermochemistry data» de cada especie.
"""
import math

# especie: [(T_min, T_max, [A, B, C, D, E, F, G, H])]; H es la entalpía de formación a 298 K (kJ/mol)
SHOMATE = {
    'H2': [(298, 1000, [33.066178, -11.363417, 11.432816, -2.772874, -0.158558, -9.980797, 172.707974, 0.0]),
           (1000, 2500, [18.563083, 12.257357, -2.859786, 0.268238, 1.977990, -1.147438, 156.288133, 0.0])],
    'O2': [(100, 700, [31.32234, -20.23531, 57.866445, -36.50624, -0.007374, -8.903471, 246.7945, 0.0]),
           (700, 2000, [30.03235, 8.772972, -3.988133, 0.788313, -0.741599, -11.32468, 236.1663, 0.0])],
    'H2O': [(500, 1700, [30.09200, 6.832514, 6.793435, -2.534480, 0.082139, -250.8810, 223.3967, -241.8264])],
    'CO': [(298, 1300, [25.56759, 6.096130, 4.054656, -2.671301, 0.131021, -118.0089, 227.3665, -110.5271])],
    'CH4': [(298, 1300, [-0.703029, 108.4773, -42.52157, 5.862788, 0.678565, -76.84376, 158.7163, -74.87310])],
    'CO2': [(298, 1200, [24.99735, 55.18696, -33.69137, 7.948387, -0.136638, -403.6075, 228.2431, -393.5224])],
}
R = 8.31446261815324    # J/(mol K)
F = 96485.33212         # C/mol


def _coef(especie, T):
    for lo, hi, c in SHOMATE[especie]:
        if lo <= T <= hi:
            return c
    raise ValueError(f'{especie}: T = {T} K fuera del rango de Shomate')


def entalpia(especie, T):
    """J/mol, incluida la de formación."""
    A, B, C, D, E, Fc, G, H = _coef(especie, T)
    t = T / 1000
    return 1000 * (A * t + B * t**2 / 2 + C * t**3 / 3 + D * t**4 / 4 - E / t + Fc)


def entropia(especie, T):
    A, B, C, D, E, Fc, G, H = _coef(especie, T)
    t = T / 1000
    return A * math.log(t) + B * t + C * t**2 / 2 + D * t**3 / 3 - E / (2 * t**2) + G


def gibbs(especie, T):
    return entalpia(especie, T) - T * entropia(especie, T)


def oxidacion_h2(T):
    """ΔG y ΔH (J/mol) de H₂ + ½ O₂ → H₂O(g); E₀ = −ΔG/2F y la tensión termoneutra −ΔH/2F."""
    dG = gibbs('H2O', T) - gibbs('H2', T) - 0.5 * gibbs('O2', T)
    dH = entalpia('H2O', T) - entalpia('H2', T) - 0.5 * entalpia('O2', T)
    return dG, dH


if __name__ == '__main__':
    for T in (973.15, 1000, 1023.15, 1073.15):
        dG, dH = oxidacion_h2(T)
        print(f'T = {T:7.2f} K  ΔG = {dG/1e3:8.2f} kJ/mol  E₀ = {-dG/(2*F):.4f} V  E_termoneutra = {-dH/(2*F):.4f} V')
