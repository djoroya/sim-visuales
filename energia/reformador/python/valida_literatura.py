"""Validación del equilibrio con fuentes públicas.

    python python/valida_literatura.py

1. Termodinámica: K del reformado (CH₄ + H₂O ⇌ CO + 3H₂) y del desplazamiento del agua
   (CO + H₂O ⇌ CO₂ + H₂) con los Shomate de termo.py, frente a las que salen de las energías de Gibbs
   de formación de las tablas JANAF (NIST-JANAF, 4.ª ed., 1998: C-067, C-093, C-095, H-064), que son
   una fuente independiente.
2. Hollín: la mínima relación vapor/carbono (S/C) para que el equilibrio no forme grafito con un
   diésel CH₂,₂₀ a 1 bar, frente a lo publicado:
   - Parmar, Kundu y Karan (2009), J. Power Sources 194, 1007–1020: en reformado con vapor hace falta
     S/C ≈ 2 entre 400 y 800 °C; en autotérmico a 750 °C con O₂/C de 0,125 a 0,25, S/C > 1,25.
   - Ahmed y Föger, recogido en la misma revisión: sin hollín con S/C 1,8 y O₂/C 0,25, o con
     S/C 1,5 y O₂/C 0,5.
"""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from equilibrio import hay_hollin, sc_minima  # noqa: E402
from termo import R, gibbs  # noqa: E402

# ΔfG° (kJ/mol) de NIST-JANAF; el H₂ es la referencia (0)
JANAF_T = [700, 800, 900, 1000, 1100, 1200]
JANAF_DFG = {
    "CH4": [-12.643, -2.115, 8.616, 19.492, 30.472, 41.524],
    "CO": [-173.518, -182.497, -191.416, -200.275, -209.075, -217.819],
    "CO2": [-395.398, -395.586, -395.748, -395.886, -396.001, -396.098],
    "H2O": [-208.812, -203.496, -198.083, -192.590, -187.033, -181.425],
}
ok = True

print("1. Constantes de equilibrio: Shomate (termo.py) frente a JANAF")
print("   T (K)   K_reformado (bar²)        K_desplazamiento")
peor = 0
for i, T in enumerate(JANAF_T):
    j = {e: v[i] * 1e3 for e, v in JANAF_DFG.items()}
    g = {e: gibbs(e, T) for e in ("CH4", "CO", "CO2", "H2", "H2O")}
    k3 = [math.exp(-(d["CO"] + 3 * d.get("H2", 0) - d["CH4"] - d["H2O"]) / (R * T)) for d in (g, {**j, "H2": 0})]
    k4 = [math.exp(-(d["CO2"] + d.get("H2", 0) - d["CO"] - d["H2O"]) / (R * T)) for d in (g, {**j, "H2": 0})]
    e3, e4 = k3[0] / k3[1] - 1, k4[0] / k4[1] - 1
    peor = max(peor, abs(e3), abs(e4))
    print(f"   {T:5d}   {k3[0]:10.4g} / {k3[1]:<10.4g}   {k4[0]:7.4g} / {k4[1]:<7.4g}  ({100 * e3:+.3f} %, {100 * e4:+.3f} %)")
print(f"   diferencia máxima {100 * peor:.3f} %")
ok &= peor < 1e-3


print("\n2. Mínima S/C sin hollín (diésel CH₂,₂₀, 1 bar)")
print("   Reformado con vapor (Parmar: S/C ≈ 2 entre 400 y 800 °C):")
sc_vapor = {}
for T_c in (400, 500, 600, 700, 800):
    sc_vapor[T_c] = sc_minima(0.0, T_c + 273.15)
    print(f"     {T_c} °C: S/C > {sc_vapor[T_c]:.2f}")
ok &= max(sc_vapor.values()) < 2.2                     # con S/C 2 no hay hollín en todo el intervalo

print("   Autotérmico a 750 °C:")
casos = [(0.125, "Parmar: S/C > 1,25 basta en 0,125–0,25"), (0.25, "Parmar: > 1,25; Ahmed y Föger: 1,8 sin hollín"),
         (0.5, "Ahmed y Föger: 1,5 sin hollín")]
for o2c, lit in casos:
    sc = sc_minima(o2c, 750 + 273.15)
    print(f"     O₂/C {o2c}: S/C > {sc:.2f}   ({lit})")
    ok &= sc < 1.25 if o2c <= 0.25 else sc < 1.5
ok &= not hay_hollin(1.8, 0.25, 1023.15) and not hay_hollin(1.5, 0.5, 1023.15)
print("Todo correcto." if ok else "HAY FALLOS.")
