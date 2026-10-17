#!/usr/bin/env python3
"""Empaqueta las dos trayectorias (heuristica y optima) para el visor.

Es el formato `.herd` de `particulas/pastoreo/` con una escena mas: las dos
simulaciones comparten individuos, caja y objetivo, asi que todo eso va una
sola vez y detras van los dos bloques de posiciones.

Formato (little endian), fichero `.herd2`:

    0   char[8]   "HERD2\\0\\0\\0"
    8   uint32    numero de individuos
    12  uint16    numero de fotogramas
    14  uint8     numero de escenas
    15  uint8     version del formato (2)
    16  float32   x0, y0, sx, sy      caja comun
    32  float32   xT, yT              objetivo
    40  uint8     tipo de cada individuo (0 oveja, 1 perro)
    ..  uint8     por escena: por fotograma y componente (x, y), plano de
                  bytes altos y plano de bytes bajos

Reconstruccion:  x = x0 + (alto*256 + bajo) * sx / 65535.

Dos planos separados en vez de uint16 entrelazado porque el byte alto casi no
cambia entre individuos vecinos y gzip lo aprovecha; el bajo es ruido y no se
comprime, pero tampoco estorba.

Las series temporales (tiempo, distancia, dispersion, esfuerzo) van en un
JSON aparte, una entrada por escena.
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
from pathlib import Path

import numpy as np

from modelo import Params, medidas_np

MAGIA = b"HERD2\0\0\0"
RAIZ = Path(__file__).resolve().parents[1]


def posiciones(Z: np.ndarray, p: Params) -> np.ndarray:
    """n_est x (N+1) -> (N+1) x n_ind x 2, ovejas primero y luego perros."""
    no, npr = p.n_o, p.n_p
    X = Z[: 2 * no, :].reshape(2, no, -1, order="F")
    Y = Z[4 * no: 4 * no + 2 * npr, :].reshape(2, npr, -1, order="F")
    todo = np.concatenate([X, Y], axis=1)          # 2 x n_ind x T
    return np.transpose(todo, (2, 1, 0))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", default=str(RAIZ / "tmp" / "grande.npz"))
    ap.add_argument("--resumen", default=str(RAIZ / "salida" / "escalera-grande.json"))
    ap.add_argument("--escena", action="append", default=[], metavar="SPEC",
                    help="escena extra, 'titulo=fichero.npz:clave:resumen.json'; "
                         "si no se pasa ninguna se exportan la heuristica y el "
                         "optimo de --entrada")
    ap.add_argument("--salida", default=str(RAIZ / "salida" / "pastoreo-optimo.herd2"))
    ap.add_argument("--meta", default=str(RAIZ / "salida" / "pastoreo-optimo-meta.json"))
    ap.add_argument("--n", type=int, default=150, help="fotogramas a exportar")
    ap.add_argument("--margen", type=float, default=40.0)
    args = ap.parse_args()

    datos = np.load(args.entrada)
    res = json.loads(Path(args.resumen).read_text())
    p = Params(n_o=res["n_o"], n_p=res["n_p"])
    ma = res["malla"]

    TITULOS = {"heuristica": "heurística «empujar y girar»",
               "optimo": "control óptimo (CasADi + IPOPT)"}
    escenas = []
    if args.escena:
        for spec in args.escena:
            titulo, resto = spec.split("=", 1)
            fichero, clave, rjson = resto.split(":")
            d = np.load(fichero)
            letra = "" if clave == "Z" else "h"
            escenas.append((titulo, d[clave], d["A" + letra],
                            json.loads(Path(rjson).read_text())[
                                "heuristica" if letra else "optimo_res"]))
    else:
        escenas = [(TITULOS["heuristica"], datos["Zh"], datos["Ah"],
                    res["heuristica"]),
                   (TITULOS["optimo"], datos["Z"], datos["A"], res["optimo_res"])]
    nfr_total = escenas[0][1].shape[1]
    idx = np.unique(np.linspace(0, nfr_total - 1, min(args.n, nfr_total))
                    .round().astype(int))
    n = idx.size
    tiempos = idx * ma["dt"]

    pos = [posiciones(Z, p)[idx] for _, Z, _, _ in escenas]
    todas = np.concatenate([q.reshape(-1, 2) for q in pos], axis=0)
    obj = np.asarray(p.objetivo)
    mn = np.minimum(todas.min(axis=0) - args.margen, obj - args.margen)
    mx = np.maximum(todas.max(axis=0) + args.margen, obj + args.margen)
    # caja cuadrada: los dos paneles comparten encuadre y el visor dibuja en un
    # lienzo cuadrado, asi que cuadrar aqui evita margenes muertos alla
    lado = float(np.maximum(mx - mn, 1e-3).max())
    centro = (mn + mx) / 2
    mn, tam = centro - lado / 2, np.array([lado, lado])

    n_ind = p.n_o + p.n_p
    tipos = np.concatenate([np.zeros(p.n_o, np.uint8), np.ones(p.n_p, np.uint8)])
    trozos = [MAGIA, struct.pack("<IHBB", n_ind, n, len(escenas), 2),
              struct.pack("<4f", *mn, *tam), struct.pack("<2f", *obj),
              tipos.tobytes()]
    err = 0.0
    for q in pos:
        c = np.clip(((q - mn) / tam * 65535.0).round(), 0, 65535).astype(np.uint16)
        err = max(err, float(np.abs(mn + c / 65535.0 * tam - q).max()))
        for f in range(n):
            for comp in range(2):
                col = c[f, :, comp]
                trozos.append((col >> 8).astype(np.uint8).tobytes())
                trozos.append((col & 0xFF).astype(np.uint8).tobytes())
    crudo = b"".join(trozos)
    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    Path(args.salida).write_bytes(crudo)
    comprimido = gzip.compress(crudo, 9)

    meta = {"individuos": n_ind, "ovejas": p.n_o, "perros": p.n_p,
            "fotogramas": n, "objetivo": obj.tolist(),
            "t": [round(float(v), 2) for v in tiempos],
            "errorCuantizacion": err, "escenas": []}
    for nombre, Z, A, resumen in escenas:
        med = medidas_np(Z, p)
        # esfuerzo acumulado hasta cada fotograma, normalizado como en el coste
        paso = ma["dt"] * (A ** 2).sum(axis=0)
        acum = np.concatenate([[0.0], np.cumsum(paso)])
        meta["escenas"].append({
            "nombre": nombre,
            "titulo": nombre,
            "distancia": [round(float(v), 1) for v in med["distancia"][idx]],
            "dispersion": [round(float(v), 1) for v in med["dispersion"][idx]],
            "esfuerzo": [round(float(v), 1) for v in acum[idx]],
            "resumen": resumen,
        })
    Path(args.meta).write_text(json.dumps(meta, separators=(",", ":")))

    print(f"{len(crudo) / 1024:.0f} KiB ({len(comprimido) / 1024:.0f} KiB con gzip)"
          f" + meta {Path(args.meta).stat().st_size / 1024:.0f} KiB")
    print(f"{n} fotogramas x {n_ind} individuos x {len(escenas)} escenas; "
          f"error de cuantizacion {err:.3f} unidades")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
