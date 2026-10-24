"""Comprobaciones del reformador dinámico.

    python python/prueba_dinamica.py

1. Límite de reacciones rápidas: isotermo y con las reacciones mil veces más rápidas, el estado
   estacionario tiene que ser el equilibrio de equilibrio.py (comprobado con la literatura en valida_literatura.py),
   en casos sin hollín (el modelo dinámico no lo tiene).
2. Conservación de átomos en un transitorio con escalones: lo que hay dentro cambia en lo que entra
   menos lo que sale, átomo a átomo.
3. Balance de energía en el estacionario adiabático: la entalpía que entra es la que sale más las pérdidas.
"""
import sys
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

sys.path.insert(0, str(Path(__file__).parent))
import dinamica as d  # noqa: E402
from equilibrio import ESPECIES as ESP_EQ, equilibrio  # noqa: E402
from termo import R  # noqa: E402

# átomos (C, H, O, N, Ar) de cada especie del modelo dinámico
A = np.zeros((5, 9))
A[0, [d.CHX, d.CH4, d.CO, d.CO2]] = 1
A[1, [d.CHX, d.CH4, d.H2, d.H2O]] = [d.X_H, 4, 2, 2]
A[2, [d.CO, d.CO2, d.H2O, d.O2]] = [1, 2, 1, 2]
A[3, d.N2] = 2
A[4, d.AR] = 1
ok = True

# 1. límite de reacciones rápidas frente al equilibrio
print("1. Estacionario con reacciones rápidas frente al equilibrio (fracciones molares, puntos %):")
casos = [(1023.15, 4e-3, 7e-3), (923.15, 5e-3, 6e-3), (1123.15, 3.5e-3, 8e-3), (873.15, 6e-3, 5e-3)]
peor = 0
for T, vapor, aire in casos:
    ref = d.Reformador(isoterma=True, k_ref=tuple(1e3 * k for k in d.Reformador().k_ref))
    e = d.Entradas(vapor=vapor, aire=aire)
    sol = d.simular(ref, 40, lambda t: e, T0=T, puntos=2)
    F, y = d.salida(ref, sol.y[:, -1])
    b = A @ e.caudales()
    neq = equilibrio(b, T, P=F.sum() / ref.Kv)                       # a la presión del reactor (bar)
    yeq = neq / neq.sum()
    if yeq[ESP_EQ.index("C")] > 1e-6:
        print(f"   {T - 273.15:.0f} °C: el equilibrio forma hollín, se salta"); continue
    mapa = {s: y[d.ESPECIES.index(s)] for s in ("CH4", "CO", "CO2", "H2", "H2O", "N2", "Ar")}
    dif = max(abs(mapa[s] - yeq[ESP_EQ.index(s)]) for s in mapa)
    resto = y[d.CHX] + y[d.O2]
    peor = max(peor, dif)
    print(f"   {T - 273.15:.0f} °C, vapor {vapor * 1e3:.1f} y aire {aire * 1e3:.1f} mmol/s: diferencia máx. {100 * dif:.4f}; CHₓ + O₂ sin reaccionar {100 * resto:.2e} %")
ok &= peor < 1e-3

# 2. conservación de átomos en un transitorio (con la T libre y escalones)
ref = d.Reformador()
def entradas(t):
    e = d.Entradas()
    if t > 200: e.combustible = 3.2e-3
    if t > 400: e.vapor = 3.0e-3
    if t > 600: e.aire = 9.0e-3
    return e
x0 = np.r_[np.zeros(9), 900.0]; x0[d.N2] = 1e5 * ref.V / (R * 900.0)
def aumentada(t, z):
    x = z[:10]
    dx = d.derivadas(t, x, ref, entradas)
    F_out, _ = d.salida(ref, x)
    return np.r_[dx, A @ entradas(t).caudales(), A @ F_out]
sol = solve_ivp(aumentada, (0, 800), np.r_[x0, np.zeros(10)], method="LSODA", rtol=1e-10, atol=1e-14, max_step=1.0)
z = sol.y[:, -1]
dentro = A @ z[:9] - A @ x0[:9]
balance = dentro - (z[10:15] - z[15:20])
rel = np.abs(balance).max() / np.abs(z[10:15]).max()
print(f"2. Conservación de C, H, O, N, Ar en 800 s con escalones: desequilibrio {rel:.1e} de lo que entra")
ok &= rel < 1e-6

# 3. balance de energía en el estacionario
e = d.Entradas()
sol = d.simular(ref, 200000, lambda t: e, puntos=2)       # la constante de tiempo térmica es de ~2 h
x = sol.y[:, -1]; T = x[9]
F_out, _ = d.salida(ref, x)
F_in = e.caudales()
entra = sum(F_in[i] * d.h(s, e.T_entra) for i, s in enumerate(d.ESPECIES))
sale = sum(F_out[i] * d.h(s, T) for i, s in enumerate(d.ESPECIES))
perd = ref.UA * (T - ref.T_amb)
cierre = abs(entra - sale - perd) / (F_in[d.CHX] * d.PCI)
print(f"3. Estacionario adiabático a {T - 273.15:.1f} °C: entalpía entra − sale − pérdidas = {cierre:.1e} del PCI que entra")
ok &= cierre < 1e-6
print("Todo correcto." if ok else "HAY FALLOS.")
