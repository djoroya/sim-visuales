"""Datos para el visor en JavaScript.

    python python/referencia.py

- datos/hollin.json: frontera del hollín en equilibrio (la mínima S/C sin grafito) en función de O₂/C y de
  la temperatura, para el mapa del visor.
- datos/referencia-js.json: una trayectoria del modelo dinámico con escalones (LSODA, tolerancias finas),
  con la que prueba/compara.mjs comprueba que el navegador calcula lo mismo.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import dinamica as d  # noqa: E402
from equilibrio import sc_minima  # noqa: E402

DATOS = Path(__file__).parent.parent / "datos"
O2C = [round(x, 2) for x in np.arange(0, 1.001, 0.05)]
T_C = list(range(400, 1001, 50))


def mapa_hollin():
    return {"o2c": O2C, "T_C": T_C,
            "sc_min": [[round(sc_minima(o, T + 273.15), 4) for o in O2C] for T in T_C]}


# escalones de la referencia: (t desde el que vale, combustible, S/C, O₂/C) con combustible en mol/s
ESCALONES = [(0, 2.5e-3, 1.6, 0.587), (1500, 2.5e-3, 1.0, 0.587), (3000, 3.5e-3, 1.0, 0.45), (4500, 2.0e-3, 2.2, 0.7)]


def entradas(t):
    _, comb, sc, o2c = [e for e in ESCALONES if t >= e[0]][-1]
    return d.Entradas(combustible=comb, vapor=sc * comb, aire=o2c * comb / 0.2095)


def trayectoria():
    ref = d.Reformador()
    t = np.arange(0, 6001, 10.0)
    x0 = np.r_[np.zeros(9), 673.15]; x0[d.N2] = 1e5 * ref.V / (d.R * 673.15)
    from scipy.integrate import solve_ivp
    # se integra tramo a tramo para que el integrador no salte los escalones
    xs, x = [], x0
    cortes = [e[0] for e in ESCALONES] + [t[-1]]
    for a, b in zip(cortes[:-1], cortes[1:]):
        tt = t[(t >= a) & (t <= b)]
        sol = solve_ivp(d.derivadas, (a, b), x, args=(ref, entradas), method="LSODA", t_eval=tt, rtol=1e-10, atol=1e-14)
        xs += [sol.y[:, k] for k in range(sol.y.shape[1]) if not (xs and k == 0)]
        x = sol.y[:, -1]
    serie = []
    for ti, xi in zip(t, xs):
        _, y = d.salida(ref, xi)
        serie.append({"t": float(ti), "T": float(xi[9]), "y": [float(v) for v in y]})
    return {"escalones": ESCALONES, "x0": x0.tolist(), "serie": serie}


if __name__ == "__main__":
    import time
    t0 = time.time()
    (DATOS / "referencia-js.json").write_text(json.dumps(trayectoria()))
    print(f"referencia-js.json: {time.time() - t0:.1f} s")
    t0 = time.time()
    (DATOS / "hollin.json").write_text(json.dumps(mapa_hollin()))
    print(f"hollin.json: {time.time() - t0:.1f} s")
