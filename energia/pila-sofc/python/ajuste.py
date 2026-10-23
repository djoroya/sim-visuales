"""Ajusta la celda a las curvas de Del Zotto et al. (2021) y la comprueba con datos que no ha visto.

    python python/ajuste.py

Entrena con las 16 curvas de 750 y 800 °C (5 fracciones de H₂ y 3 caudales de aire) y predice las 8
de 700 °C. Escribe datos/celda-ajuste.json.

Qué se fija y qué se ajusta:
- El agua efectiva del ánodo sale de la tensión en vacío (mediana de los ensayos con x_H2 ≤ 0,5, donde
  es estable): ~2 %, coherente con una pequeña fuga.
- La resistencia óhmica no se ajusta: las curvas I–V no separan la pérdida óhmica de la de activación
  (a corriente alta las dos son casi rectas; haría falta impedancia). Ajustada libre se va a 0,001 Ω.
  Se fija un valor típico de electrolito de YSZ: 0,15 Ω·cm² a 750 °C y 80 kJ/mol.
- Se ajustan 3 parámetros: j₀ y su energía de activación, y la corriente límite de difusión j_L.
"""
import json
import math
import sys
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(Path(__file__).parent))
from celda import Parametros, punto  # noqa: E402
from termo import F, R, oxidacion_h2  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
datos = json.loads((RAIZ / 'datos' / 'delzotto-iv.json').read_text())['curvas']
NOMBRES = ['j0', 'E_act', 'jL']
ESCALA = np.array([0.1, 1e4, 1.0])
ASR_OHM, E_OHM = 0.15, 80e3          # Ω·cm² a 750 °C y J/mol (YSZ, valor típico)


def agua_efectiva():
    xs = []
    for c in datos:
        if c['x_H2'] <= 0.5:
            T = c['T_C'] + 273.15
            ocv = c['puntos_I_V_FU'][0][1]
            E0 = -oxidacion_h2(T)[0] / (2 * F)
            xw = c['x_H2'] * math.sqrt(0.2095) * math.exp(-(ocv - E0) * 2 * F / (R * T))
            xs.append(xw / (1 + xw))
    return float(np.median(xs))


BASE = replace(Parametros(), x_agua=agua_efectiva(), R_ohm=ASR_OHM / Parametros().area, E_ohm=E_OHM)


def parametros(v):
    return replace(BASE, **dict(zip(NOMBRES, (v * ESCALA).tolist())))


def residuos(v, curvas):
    p = parametros(v)
    out = []
    for c in curvas:
        T = c['T_C'] + 273.15
        for I, V, _ in c['puntos_I_V_FU']:
            r = punto(I, T, c['q_anodo_ml_min'], c['x_H2'], c['q_aire_ml_min'], p)
            out.append((r['V'] if r else 0.0) - V)
    return np.array(out)


def informe(curvas, p, titulo):
    filas, todos = [], []
    for c in curvas:
        e = residuos(np.array([getattr(p, k) for k in NOMBRES]) / ESCALA, [c]) * 1000  # mV
        todos.extend(e)
        filas.append({'caso': c['caso'], 'T_C': c['T_C'], 'rmse_mV': float(np.sqrt(np.mean(e**2))), 'max_mV': float(np.max(np.abs(e)))})
    todos = np.array(todos)
    print(f'{titulo}: {len(curvas)} curvas, {len(todos)} puntos · RMSE {np.sqrt(np.mean(todos**2)):.1f} mV · máx {np.max(np.abs(todos)):.1f} mV')
    for f in filas:
        print(f"   {f['caso']:>14}  RMSE {f['rmse_mV']:5.1f} mV  máx {f['max_mV']:5.1f} mV")
    return {'rmse_mV': float(np.sqrt(np.mean(todos**2))), 'max_mV': float(np.max(np.abs(todos))), 'curvas': filas}


if __name__ == '__main__':
    entreno = [c for c in datos if c['T_C'] in (750, 800)]
    prueba = [c for c in datos if c['T_C'] == 700]
    sol = least_squares(residuos, np.array([2.0, 10.0, 3.0]), args=(entreno,), bounds=([0.001, 0, 0.05], [50, 30, 50]))
    p = parametros(sol.x)
    print('Parámetros (fijos: x_agua, R_ohm, E_ohm; ajustados: j0, E_act, jL):')
    for k in ['x_agua', 'R_ohm', 'E_ohm', 'j0', 'E_act', 'jL']:
        print(f'   {k:>7} = {getattr(p, k):.5g}')
    a = informe(entreno, p, 'Entrenamiento (750 y 800 °C)')
    b = informe(prueba, p, 'Prueba (700 °C, sin ver)')
    # Desglose a 750 °C, 50 % H₂, 2 A: de dónde sale la caída de tensión
    r = punto(2.0, 1023.15, 150, 0.5, 250, p)
    print(f"Desglose a 750 °C, 50 % H₂, 2 A: E = {r['E']:.3f} V, concentración {r['eta_conc']*1000:.0f} mV, óhmica {r['eta_ohm']*1000:.0f} mV, activación {r['eta_act']*1000:.0f} mV → V = {r['V']:.3f} V")
    (RAIZ / 'datos' / 'celda-ajuste.json').write_text(json.dumps({
        'fuente_datos': 'Del Zotto et al. (2021), doi:10.5281/zenodo.5763484 (CC BY 4.0)',
        'parametros': asdict(p), 'entrenamiento': a, 'prueba_700C': b,
    }, ensure_ascii=False, indent=1))
