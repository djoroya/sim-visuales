"""Casos de referencia para comprobar la versión JavaScript: tmp/referencia.json."""
import json, sys, numpy as np
sys.path.insert(0, "python"); import she
casos = []
for nombre, Ea, Eb in [("articulo", [1, 5, 7, 11, 13], [1, 5, 7, 11, 13]), ("trifasico", [], [1, 5, 7, 11, 13]), ("monofasico", [], [1, 3, 5, 7, 9])]:
    for nU in [3, 5, 7]:
        U = np.linspace(-1, 1, nU)
        for m in [0.2, 0.5, 0.8]:
            x0 = np.zeros(len(Ea) + len(Eb)); x0[0] = m
            if Ea: x0[len(Ea)] = m
            r = she.resuelve(x0, Ea, Eb, U, eps=1e-6)
            casos.append(dict(nombre=nombre, Ea=Ea, Eb=Eb, U=U.tolist(), x0=x0.tolist(), q=r["q"].tolist(), ts=r["ts"].tolist(),
                              niveles=r["niveles"].tolist(), residuo=float(np.abs(r["residuo"]).max()), brecha=float(r["brecha"])))
json.dump(casos, open("tmp/referencia.json", "w"))
print(len(casos), "casos; residuo máx", max(c["residuo"] for c in casos), "brecha máx", max(abs(c["brecha"]) for c in casos))
