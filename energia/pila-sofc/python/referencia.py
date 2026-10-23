"""Punto de diseño del visor y trayectorias de referencia para comprobar el núcleo en JavaScript.

    python python/referencia.py

Escribe datos/pila-visor.json (la pila que verá el visitante) y datos/referencia-js.json (lo que el
JavaScript tiene que reproducir: curvas de la celda y una simulación con escalones de carga).

La pila del visor: 30 celdas de 100 cm² a 750 °C (la temperatura de la calibración), biogás reformado
(45 % H₂, 10 % CO, 5 % CH₄, 20 % CO₂, 20 % H₂O) con caudal para un 70 % de utilización a 40 A, aire con
λ = 4 (exceso para refrigerar), ánodo y cátodo de 2 L y una salida por compartimento («igual»: sale la
composición de dentro) con la constante que da 1 atm al caudal nominal. Con las del original (0,5 m³,
K = 0,005 kmol/(atm·s)) el ánodo quedaría casi en vacío; ver README.
"""
import json
import math
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from dinamica import ATM, M, Pila, reparto, simular, tension, H2, O2, H2O, N2, CO, CH4, CO2  # noqa: E402
from termo import F, R  # noqa: E402
import celda  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
N0, AREA, T = 30, 100.0, 1023.15
I_NOM, UTIL, LAMBDA = 40.0, 0.70, 4.0
FRACCION = np.array([0.45, 0, 0.20, 0, 0.10, 0.05, 0.20])          # biogás reformado (orden ESPECIES)

la, a, b, ne = reparto(FRACCION)
q_comb = N0 * I_NOM / (F * ne) / UTIL                                # mol/s de mezcla
q_aire = LAMBDA * N0 * I_NOM / (4 * F) / 0.2095
qa = FRACCION * q_comb
qc = np.zeros(7); qc[O2], qc[N2] = 0.2095 * q_aire, 0.7905 * q_aire
# K en kmol/(atm·s) referido al H₂ (así lo define Pila.kv con válvula «igual»): 1 atm al caudal nominal
K_an = q_comb / ATM * math.sqrt(M[H2]) * ATM / 1e3
K_cat = q_aire / ATM * math.sqrt(M[H2]) * ATM / 1e3
pila = Pila(modo='calibrado', N0=N0, area=AREA, T=T, Va=2e-3, Vc=2e-3, valvula='igual', K_an=K_an, K_cat=K_cat)


def escalones(t):
    return 0.0 if t < 5 else 30.0 if t < 25 else 45.0 if t < 45 else 20.0


if __name__ == '__main__':
    RT = R * T
    sol = simular(pila, 60.0, escalones, lambda t: qa, lambda t: qc, puntos=121, rtol=1e-10)
    serie = []
    for k, t in enumerate(sol.t):
        pa, pc = sol.y[:7, k] * RT / pila.Va, sol.y[7:, k] * RT / pila.Vc
        I = escalones(t)
        v = tension(pila, I, qa, pa, pc)
        serie.append({'t': float(t), 'I': I, 'V': v['V'], 'V_celda': v['V_celda'], 'E': v['E'], 'ET': v['ET'],
                      'eta_conc': v['eta_conc'], 'eta_ohm': v['eta_ohm'], 'eta_act': v['eta_act'],
                      'pa': (pa / ATM).tolist(), 'pc': (pc / ATM).tolist(),
                      'calor_W': N0 * I * (v['ET'] - v['V_celda']), 'electrica_W': v['V'] * I})
    p1 = celda.Parametros(**json.loads((RAIZ / 'datos' / 'celda-ajuste.json').read_text())['parametros'])
    curvas = []
    for Tc, x in ((700, 0.5), (750, 0.25), (800, 0.9)):
        pts = []
        for I in np.arange(0, 3.01, 0.25):
            r = celda.punto(float(I), Tc + 273.15, 150, x, 250, p1)
            if r:
                pts.append([float(I), r['V'], r['eta_conc'], r['eta_ohm'], r['eta_act']])
        curvas.append({'T_C': Tc, 'x_H2': x, 'q_anodo': 150, 'q_aire': 250, 'puntos_I_V_conc_ohm_act': pts})
    tau_an = pila.Va / (pila.kv(K_an)[0] * RT)
    diseno = {
        'nota': 'Pila del visor (python/referencia.py). Caudales en mol/s, K en kmol/(atm·s) referida al H₂.',
        'N0': N0, 'area_cm2': AREA, 'T_K': T, 'Va_m3': pila.Va, 'Vc_m3': pila.Vc, 'valvula': pila.valvula,
        'K_an': K_an, 'K_cat': K_cat, 'I_nominal_A': I_NOM, 'utilizacion_nominal': UTIL, 'lambda_aire': LAMBDA,
        'fraccion_combustible': dict(zip(['H2', 'O2', 'H2O', 'N2', 'CO', 'CH4', 'CO2'], FRACCION.tolist())),
        'q_combustible_mol_s': q_comb, 'q_aire_mol_s': q_aire, 'celda': p1.__dict__,
    }
    (RAIZ / 'datos' / 'pila-visor.json').write_text(json.dumps(diseno, ensure_ascii=False, indent=1))
    (RAIZ / 'datos' / 'referencia-js.json').write_text(json.dumps({'serie': serie, 'curvas_celda': curvas}, indent=0))
    fin = {k: serie[-1][k] for k in ('V', 'V_celda', 'calor_W', 'electrica_W')}
    print(f'combustible {q_comb*1e3:.2f} mmol/s, aire {q_aire*1e3:.1f} mmol/s, τ ánodo ≈ {tau_an:.2f} s')
    for t_ver in (4.5, 24.5, 44.5, 60):
        s = min(serie, key=lambda s: abs(s['t'] - t_ver))
        print(f"t={s['t']:5.1f} s  I={s['I']:4.0f} A  V={s['V']:6.2f} V ({s['V_celda']:.3f}/celda)  P={s['electrica_W']:6.0f} W  calor={s['calor_W']:6.0f} W  pH2={s['pa'][0]:.3f} atm")
