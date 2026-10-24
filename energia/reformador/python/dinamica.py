"""Reformador autotérmico de diésel, dinámico: una caja de gas bien mezclado sobre un catalizador.

    python python/dinamica.py        # arranque en frío y escalones: diésel, vapor y aire

Estado: moles de cada especie en el volumen de gas (combustible, CH₄, CO, CO₂, H₂, H₂O, O₂, N₂, Ar) y la
temperatura del catalizador. El combustible es «CHₓ» por átomo de carbono (diésel con 84,4 % de C y
15,6 % de H en masa: x = 2,20).

Moles (igual que el ánodo de la pila):
    dnᵢ/dt = Fᵢ,entra − Kᵥ pᵢ + Σⱼ νᵢⱼ rⱼ          (sale por una válvula: caudal proporcional a la presión)

Cinco reacciones globales (las cuatro de Creaser et al. 2011 para diésel sobre rodio, más la oxidación del H₂):
    R1 oxidación          CHₓ + (1 + x/4) O₂ → CO₂ + x/2 H₂O       r₁ = k₁ p_CHₓ p_O₂
    R2 reformado          CHₓ + H₂O → CO + (1 + x/2) H₂            r₂ = k₂ p_CHₓ p_H₂O
    R3 reformado de CH₄   CH₄ + H₂O ⇌ CO + 3 H₂                    r₃ = k₃ (p_CH₄ p_H₂O − p_CO p_H₂³ / K₃)
    R4 desplazamiento     CO + H₂O ⇌ CO₂ + H₂                      r₄ = k₄ (p_CO p_H₂O − p_CO₂ p_H₂ / K₄)
    R5 oxidación del H₂   H₂ + ½ O₂ → H₂O                          r₅ = k₅ p_H₂ p_O₂
con kⱼ = Aⱼ exp(−Eⱼ/RT) y presiones en bar. R3 y R4 son reversibles (su sentido lo decide el equilibrio:
a baja temperatura R3 va al revés y forma metano); K₃ y K₄ salen de la misma termodinámica que el modelo
de equilibrio, así que con reacciones rápidas el estado estacionario es ese equilibrio (lo comprueba
prueba_dinamica.py). E₃ y E₄ son las de Xu y Froment (1989); E₁, E₂, E₅ y todos los Aⱼ son supuestos
razonables, no ajustados a un reactor: el orden de magnitud de los tiempos, no sus valores exactos.

Energía del catalizador (domina la capacidad calorífica del sólido):
    C dT/dt = Σ_entra Fₖ (hₖ(T_entra) − hₖ(T)) − Σⱼ rⱼ ΔHⱼ(T) − UA (T − T_amb) + Q
La oxidación calienta (ΔH₁ < 0) y el reformado enfría (ΔH₂, ΔH₃ > 0): en un reformador autotérmico la
temperatura sale de ese balance.
"""
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

sys.path.insert(0, str(Path(__file__).parent))
from termo import R, entalpia, gibbs  # noqa: E402

ESPECIES = ["CHx", "CH4", "CO", "CO2", "H2", "H2O", "O2", "N2", "Ar"]
CHX, CH4, CO, CO2, H2, H2O, O2, N2, AR = range(9)
BAR = 1e5

# Diésel como CHₓ por átomo de C (84,4 % C y 15,6 % H en masa)
W_C, W_H = 0.844, 0.156
X_H = (W_H / 1.008) / (W_C / 12.011)                      # 2,20
M_COMB = (12.011 + 1.008 * X_H) * 1e-3                    # kg por mol de CHₓ
PCI = 42.8e6 * M_COMB                                     # J/mol (poder calorífico inferior del diésel)
CP_COMB = 2.3e3 * M_COMB                                  # J/(mol·K), combustible ya vaporizado
# entalpía de formación del CHₓ gaseoso que hace cuadrar el PCI: CHₓ + (1+x/4) O₂ → CO₂ + x/2 H₂O(g)
H_F_COMB = -393.522e3 + X_H / 2 * -241.826e3 + PCI         # J/mol, a 298 K


def h(especie, T):
    """Entalpía (J/mol, con la de formación). N₂ y Ar con cp constante (no reaccionan: solo importa su calor sensible)."""
    if especie == "CHx":
        return H_F_COMB + CP_COMB * (T - 298.15)
    if especie in ("N2", "Ar"):
        return (29.1 if especie == "N2" else 20.8) * (T - 298.15)
    if especie == "H2O" and T < 500:
        return entalpia("H2O", 500) - 34.0 * (500 - T)       # Shomate del vapor empieza en 500 K
    return entalpia(especie, T)


# estequiometría: filas = reacciones, columnas = ESPECIES
NU = np.zeros((5, 9))
NU[0, [CHX, O2, CO2, H2O]] = [-1, -(1 + X_H / 4), 1, X_H / 2]
NU[1, [CHX, H2O, CO, H2]] = [-1, -1, 1, 1 + X_H / 2]
NU[2, [CH4, H2O, CO, H2]] = [-1, -1, 1, 3]
NU[3, [CO, H2O, CO2, H2]] = [-1, -1, 1, 1]
NU[4, [H2, O2, H2O]] = [-1, -0.5, 1]

T_REF = 1023.15


def keq(T):
    """K₃ (bar²) y K₄ (—) con la termodinámica del modelo de equilibrio (Shomate, 1 bar)."""
    T = max(T, 500.0)                                         # por debajo, las reacciones están paradas
    g = {e: gibbs(e, T) for e in ("CH4", "H2O", "CO", "H2", "CO2")}
    dg3 = g["CO"] + 3 * g["H2"] - g["CH4"] - g["H2O"]
    dg4 = g["CO2"] + g["H2"] - g["CO"] - g["H2O"]
    return math.exp(-dg3 / (R * T)), math.exp(-dg4 / (R * T))


@dataclass
class Reformador:
    V: float = 0.5e-3                     # m³ de gas
    C: float = 3000.0                     # J/K: catalizador y carcasa
    UA: float = 0.2                       # W/K: pérdidas al ambiente (aislado: ~5 % del calor)
    T_amb: float = 298.15
    Kv: float = 0.03                      # mol/(s·bar): válvula de salida (≈ 1 bar al caudal nominal)
    # k(T_REF) en mol/(s·bar²) y energías de activación (J/mol)
    k_ref: tuple = (500.0, 20.0, 2.0, 20.0, 500.0)
    E: tuple = (60e3, 110e3, 240.1e3, 67.1e3, 60e3)
    isoterma: bool = False                # para las pruebas: T fija

    def k(self, T):
        return np.array([kr * math.exp(-E / R * (1 / T - 1 / T_REF)) for kr, E in zip(self.k_ref, self.E)])


@dataclass
class Entradas:
    """Caudales (mol/s) y temperaturas de lo que entra; Q: calefactor (W)."""
    combustible: float = 2.5e-3            # mol de CHₓ/s (≈ 1,5 kW de diésel)
    vapor: float = 4.0e-3
    aire: float = 7.0e-3
    T_entra: float = 673.15
    Q: float = 0.0

    def caudales(self):
        F = np.zeros(9)
        F[CHX], F[H2O] = self.combustible, self.vapor
        F[O2], F[N2], F[AR] = 0.2095 * self.aire, 0.7808 * self.aire, 0.0093 * self.aire
        return F


def velocidades(ref: Reformador, n, T):
    p = np.maximum(n, 0) * R * T / ref.V / BAR
    K3, K4 = keq(T)
    k = ref.k(T)
    return np.array([
        k[0] * p[CHX] * p[O2],
        k[1] * p[CHX] * p[H2O],
        k[2] * (p[CH4] * p[H2O] - p[CO] * p[H2] ** 3 / K3),
        k[3] * (p[CO] * p[H2O] - p[CO2] * p[H2] / K4),
        k[4] * p[H2] * p[O2],
    ])


def derivadas(t, x, ref: Reformador, entradas_de_t):
    n, T = x[:9], x[9]
    e = entradas_de_t(t)
    F = e.caudales()
    p = np.maximum(n, 0) * R * T / ref.V / BAR
    r = velocidades(ref, n, T)
    dn = F - ref.Kv * p + NU.T @ r
    if ref.isoterma:
        return np.r_[dn, 0.0]
    hT = np.array([h(s, T) for s in ESPECIES])
    hin = np.array([h(s, e.T_entra) for s in ESPECIES])
    dH = NU @ hT                                           # ΔHⱼ(T)
    dT = (F @ (hin - hT) - r @ dH - ref.UA * (T - ref.T_amb) + e.Q) / ref.C
    return np.r_[dn, dT]


def simular(ref: Reformador, t_fin, entradas_de_t, x0=None, T0=673.15, puntos=600):
    """Por defecto arranca lleno de nitrógeno y con el catalizador precalentado a T0 (lo hace un quemador
    de arranque: a 400 °C la oxidación ya se enciende y el reformador se calienta solo)."""
    if x0 is None:
        x0 = np.r_[np.zeros(9), T0]
        x0[N2] = 1e5 * ref.V / (R * T0)
    return solve_ivp(derivadas, (0, t_fin), x0, args=(ref, entradas_de_t), method="LSODA",
                     t_eval=np.linspace(0, t_fin, puntos), rtol=1e-8, atol=1e-12)


def salida(ref: Reformador, x):
    """Caudales de salida (mol/s) y fracciones molares."""
    n, T = x[:9], x[9]
    F = ref.Kv * np.maximum(n, 0) * R * T / ref.V / BAR
    return F, F / F.sum()


if __name__ == "__main__":
    ref = Reformador()
    base = Entradas()

    def entradas(t):
        e = Entradas(**base.__dict__)
        if t >= 600: e.vapor = 3.0e-3                        # menos vapor
        if t >= 900: e.aire = 9.0e-3                         # más aire
        return e

    sol = simular(ref, 1200, entradas)
    for t_ver in (30, 120, 300, 590, 890, 1190):
        k = int(np.argmin(abs(sol.t - t_ver)))
        F, y = salida(ref, sol.y[:, k])
        print(f"t={sol.t[k]:6.0f} s  T={sol.y[9, k] - 273.15:6.1f} °C  " + "  ".join(f"{s} {100 * v:4.1f}" for s, v in zip(ESPECIES, y) if v > 0.002))
