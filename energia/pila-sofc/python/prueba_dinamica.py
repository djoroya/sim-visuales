"""Comprobaciones del modelo dinámico (dinamica.py).

    python python/prueba_dinamica.py

1. Solución exacta: con H₂ + H₂O en el ánodo, aire en el cátodo y un escalón de corriente, cada presión
   parcial es una exponencial de primer orden con τ = V/(K_v R T). La integración tiene que reproducirla.
2. Conservación de átomos con biogás reformado (H₂, CO, CH₄, CO₂, H₂O) y escalones de carga: lo que entra
   = lo que sale + lo acumulado, para H, C, O y N (los iones O²⁻ pasan del cátodo al ánodo).
3. Coherencia con el paso 1: en régimen permanente, con el ensayo de Del Zotto (3,5 cm², H₂ 50 % + N₂,
   2 % de agua, aire 250 ml/min) y válvulas iguales, la tensión es la de la celda calibrada (celda.py).
"""
import json
import math
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from dinamica import ATM, Pila, simular, tension, velocidades, H2, O2, H2O, N2, CO, CH4, CO2  # noqa: E402
from termo import R, F  # noqa: E402
import celda  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
ok = True


def informa(nombre, valor, limite, unidad=''):
    global ok
    bien = valor <= limite
    ok &= bien
    print(f"{'✔' if bien else '✘'} {nombre}: {valor:.3g}{unidad} (límite {limite:g}{unidad})")


# --- 1. Solución exacta de primer orden ---------------------------------------------------------
pila = Pila(modo='original', T=1023.15)
qa = np.zeros(7); qa[H2], qa[H2O] = 0.5, 0.02          # mol/s
qc = np.zeros(7); qc[O2], qc[N2] = 0.2095 * 4, 0.7808 * 4
I1 = 1500.0                                             # A desde t = 0
sol = simular(pila, 3.0, lambda t: I1, lambda t: qa, lambda t: qc, puntos=300)
RT = R * pila.T
kva, kvc = pila.kv(pila.K_an), pila.kv(pila.K_cat)
ra, rc = velocidades(I1, qa, pila.N0)
peor = 0.0
for k, (vol, kv, q, r, off) in {'H2': (pila.Va, kva, qa, ra, 0), 'H2O': (pila.Va, kva, qa, ra, 0), 'O2': (pila.Vc, kvc, qc, rc, 7)}.items():
    i = {'H2': H2, 'H2O': H2O, 'O2': O2}[k]
    tau = vol / (kv[i] * RT)
    n_ini, n_fin = q[i] / kv[i] * vol / RT, (q[i] + r[i]) / kv[i] * vol / RT
    exacta = n_fin + (n_ini - n_fin) * np.exp(-sol.t / tau)
    err = np.max(np.abs(sol.y[off + i] - exacta)) / abs(n_fin - n_ini)
    peor = max(peor, err)
    print(f'   {k}: τ = {tau:.4f} s, presión de {n_ini*RT/vol/ATM:.3f} a {n_fin*RT/vol/ATM:.3f} atm')
informa('1. Escalón frente a la exponencial exacta (error relativo al salto)', peor, 1e-6)

# --- 2. Conservación de átomos con biogás reformado y escalones de carga -----------------------
pila = Pila(modo='calibrado', N0=30, area=100)
qa = np.array([0.30, 0, 0.12, 0, 0.10, 0.05, 0.08]) * 0.05   # H₂, CO, CH₄, H₂O, CO₂ (mol/s)
qc = np.zeros(7); qc[O2], qc[N2] = 0.2095 * 0.4, 0.7808 * 0.4
I_t = lambda t: 10.0 if t < 1 else (25.0 if t < 2 else 15.0)  # noqa: E731
sol = simular(pila, 3.0, I_t, lambda t: qa, lambda t: qc, puntos=3001)
ATOMOS = {'H': [2, 0, 2, 0, 0, 4, 0], 'C': [0, 0, 0, 0, 1, 1, 1], 'O': [0, 2, 1, 0, 1, 0, 2], 'N': [0, 0, 0, 2, 0, 0, 0]}
t = sol.t
RTa, RTc = R * pila.T / pila.Va, R * pila.T / pila.Vc
peor = 0.0
for el, cuenta in ATOMOS.items():
    c = np.array(cuenta, float)
    entra = (qa @ c + qc @ c) * t
    sale_t = (pila.kv(pila.K_an) * (sol.y[:7].T * RTa)) @ c + (pila.kv(pila.K_cat) * (sol.y[7:].T * RTc)) @ c
    sale = np.concatenate([[0], np.cumsum(0.5 * (sale_t[1:] + sale_t[:-1]) * np.diff(t))])
    dentro = sol.y[:7].T @ c + sol.y[7:].T @ c
    err = np.max(np.abs(entra - sale - (dentro - dentro[0]))) / entra[-1]
    peor = max(peor, err)
    print(f'   {el}: desequilibrio máximo {err:.2e} de lo que entra')
informa('2. Conservación de H, C, O y N (trapecios sobre la salida)', peor, 1e-6)
fin = tension(pila, I_t(t[-1]), qa, sol.y[:7, -1] * RTa, sol.y[7:, -1] * RTc)
print(f"   régimen final (15 A): V = {fin['V']:.2f} V, {fin['V_celda']:.3f} V/celda, E_T = {fin['ET']:.3f} V, "
      f"calor = {pila.N0 * 15 * (fin['ET'] - fin['V_celda']):.0f} W, eléctrica = {fin['V'] * 15:.0f} W")

# --- 3. Coherencia con la celda calibrada del paso 1 --------------------------------------------
p1 = celda.Parametros(**json.loads((RAIZ / 'datos' / 'celda-ajuste.json').read_text())['parametros'])
q_an, q_aire, x_h2, T = 150.0, 250.0, 0.5, 1023.15
n_an = q_an * celda.ML_MIN_A_MOL_S
qa = np.zeros(7); qa[H2], qa[N2] = x_h2 * n_an, (1 - x_h2) * n_an
qa[H2O] = p1.x_agua / (1 - p1.x_agua) * n_an
qc = np.zeros(7); qc[O2], qc[N2] = 0.2095 * q_aire * celda.ML_MIN_A_MOL_S, 0.7905 * q_aire * celda.ML_MIN_A_MOL_S
# Válvulas iguales y K tal que la presión total del ánodo sea 1 atm sin corriente
K = qa.sum() / ATM * math.sqrt(2.016e-3) * ATM / 1e3
pila = Pila(modo='calibrado', N0=1, area=p1.area, T=T, Va=1e-5, Vc=1e-5, valvula='igual', K_an=K,
            K_cat=qc.sum() / ATM * math.sqrt(2.016e-3) * ATM / 1e3)
peor = 0.0
for I in (0.5, 1.0, 2.0):
    sol = simular(pila, 5.0, lambda t: I, lambda t: qa, lambda t: qc, puntos=50)
    pa, pc = sol.y[:7, -1] * R * T / pila.Va, sol.y[7:, -1] * R * T / pila.Vc
    vd = tension(pila, I, qa, pa, pc)['V']
    vc = celda.punto(I, T, q_an, x_h2, q_aire, p1)['V']
    peor = max(peor, abs(vd - vc))
    print(f'   I = {I:.1f} A: dinámica {vd:.5f} V, celda {vc:.5f} V')
informa('3. Régimen permanente frente a la celda del paso 1', peor * 1000, 0.5, ' mV')

print('\nTodo correcto.' if ok else '\nHAY FALLOS.')
sys.exit(0 if ok else 1)
