#!/usr/bin/env python3
"""Empaqueta la grieta para el visor web.

Un cristal de 43.000 atomos y 240 fotogramas son 10 millones de atomo-
fotograma: no caben en la web por mucho que se comprima (el suelo son ~3
bytes por atomo y fotograma: dos de posicion y uno de color). Asi que aqui se
submuestrea: se toma uno de cada `paso` atomos en cada direccion y uno de
cada tantos fotogramas, y se dice en el README cuanto cuesta cada opcion.

Formato (little endian), fichero `.crack`:

    0   char[8]   "CRACK1\\0\\0"
    8   uint32    numero de atomos
    12  uint16    numero de fotogramas
    14  uint16    version (1)
    16  float32   x0, y0, sx, sy      caja comun
    32  float32   smin, smax          rango de tension para el color
    40  float32   paso                cuantizacion de posiciones, unidades LJ
    44  float32   t[nFotogramas]      tiempo de cada fotograma
    ..  uint8     fotograma 0: por componente, plano alto y plano bajo (uint16)
    ..  int8      resto: incrementos de posicion
    ..  uint8     tension normalizada a [0, 255]
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
from pathlib import Path

import numpy as np

from campo import suaviza

MAGIC = b"CRACK1\0\0"
A_AT = np.sqrt(3) / 2 * 2 ** (1 / 3)      # area por atomo en la red triangular


def lee_volcados(ruta: Path, cada: int = 1):
    texto = ruta.read_text()
    bloques = texto.split("ITEM: TIMESTEP\n")[1:]
    for k, b in enumerate(bloques):
        if k % cada:
            continue
        lineas = b.splitlines()
        paso = int(lineas[0])
        i = next(j for j, l in enumerate(lineas) if l.startswith("ITEM: ATOMS"))
        datos = np.array([l.split() for l in lineas[i + 1:] if l.strip()],
                         dtype=np.float64)
        yield paso, datos[np.argsort(datos[:, 0])]


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--volcado", default=str(raiz / "datos" / "grieta.lammpstrj"))
    ap.add_argument("--salida", default=str(raiz / "salida" / "grieta.crack"))
    ap.add_argument("--meta", default=str(raiz / "salida" / "grieta-meta.json"))
    ap.add_argument("--cada-frame", type=int, default=2)
    ap.add_argument("--submuestreo", type=int, default=2,
                    help="toma 1 de cada N atomos (por indice de red)")
    ap.add_argument("--paso", type=float, default=0.02,
                    help="cuantizacion de los incrementos, unidades LJ")
    ap.add_argument("--dt", type=float, default=0.004)
    ap.add_argument("--percentil", type=float, default=99.0,
                    help="percentil de tension que satura el color")
    ap.add_argument("--smax", type=float, default=None,
                    help="tension que satura el color; si no, el percentil")
    ap.add_argument("--suavizado", type=float, default=1.6,
                    help="suavizado espacial de la tension, unidades LJ")
    ap.add_argument("--recorte-y", type=float, default=7.0,
                    help="margen que se quita arriba y abajo (filas congeladas)")
    args = ap.parse_args()

    pasos, cuadros, tension = [], [], []
    for paso, datos in lee_volcados(Path(args.volcado), args.cada_frame):
        pasos.append(paso)
        xy = datos[:, 1:3]
        # el mismo suavizado espacial que las imagenes: sin el, la tension por
        # atomo es tanto ruido termico que no se ve el campo
        sg = (suaviza(xy, datos[:, 3] / A_AT, sigma=args.suavizado)
              if args.suavizado > 0 else datos[:, 3] / A_AT)
        cuadros.append(xy)
        tension.append(sg)
    pos = np.array(cuadros)
    sig = np.array(tension)
    nfr, nat0, _ = pos.shape

    # fuera las filas congeladas: su tension es artificial (fix setforce) y
    # saturaria el color en los bordes
    if args.recorte_y > 0:
        y = pos[0][:, 1]
        dentro = (y > y.min() + args.recorte_y) & (y < y.max() - args.recorte_y)
        pos = pos[:, dentro]
        sig = sig[:, dentro]
        nat0 = int(dentro.sum())

    # submuestreo regular SOBRE LA RED, no sobre el indice: se queda una
    # subred triangular de parametro 2a, que se ve igual de ordenada. Tomar
    # uno de cada N por indice dejaria huecos irregulares, que cantan.
    if args.submuestreo > 1:
        a0 = 2 ** (1 / 6)
        p0 = pos[0]
        fila = np.round((p0[:, 1] - p0[:, 1].min()) / (a0 * np.sqrt(3) / 2))
        col = np.round((p0[:, 0] - p0[:, 0].min()) / a0)
        k = int(round(np.sqrt(args.submuestreo)))
        sel = np.where((fila % k == 0) & (col % k == 0))[0]
        pos = pos[:, sel]
        sig = sig[:, sel]
    nat = pos.shape[1]
    print(f"{nfr} fotogramas x {nat} atomos (de {nat0})")

    mn = pos.reshape(-1, 2).min(axis=0)
    mx = pos.reshape(-1, 2).max(axis=0)
    tam = np.maximum(mx - mn, 1e-3)
    paso = float(args.paso)

    objetivo = np.round((pos - mn) / paso).astype(np.int32)
    if objetivo[0].max() > 65535:
        raise SystemExit("el primer fotograma no cabe en 16 bits: sube --paso")

    q = objetivo[0].copy()
    deltas = np.empty((nfr - 1, nat, 2), dtype=np.int8)
    saturados = 0
    for f in range(1, nfr):
        d = np.clip(objetivo[f] - q, -127, 127)
        saturados += int((np.abs(objetivo[f] - q) > 127).sum())
        deltas[f - 1] = d.astype(np.int8)
        q = q + d
    rec = np.cumsum(np.vstack([objetivo[0][None], deltas]), axis=0)
    err = float(np.abs(mn + rec * paso - pos).max())
    print(f"error de reconstruccion {err:.4f}; incrementos saturados {saturados}")

    # el color satura en un percentil alto: la singularidad de la punta se
    # lleva todo el rango si se usa el maximo
    smin = 0.0
    smax = args.smax if args.smax else float(np.percentile(sig, args.percentil))
    col = np.clip((sig - smin) / (smax - smin) * 255.0, 0, 255).astype(np.uint8)

    tiempos = np.array(pasos) * args.dt
    trozos = [MAGIC, struct.pack("<IHH", nat, nfr, 1),
              struct.pack("<4f", *mn, *tam),
              struct.pack("<2f", smin, smax),
              struct.pack("<f", paso),
              tiempos.astype("<f4").tobytes()]
    q0 = objetivo[0].astype(np.uint16)
    for c in range(2):
        trozos.append((q0[:, c] >> 8).astype(np.uint8).tobytes())
        trozos.append((q0[:, c] & 0xFF).astype(np.uint8).tobytes())
    for f in range(nfr - 1):
        for c in range(2):
            trozos.append(deltas[f, :, c].tobytes())
    trozos.append(col.tobytes())
    crudo = b"".join(trozos)

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(crudo)
    comp = gzip.compress(crudo, 9)

    Path(args.meta).write_text(json.dumps({
        "atomos": int(nat), "atomosSimulados": int(nat0), "fotogramas": int(nfr),
        "t": [round(float(v), 3) for v in tiempos],
        "sigmaMax": round(smax, 4), "unidad": "LJ",
        "errorReconstruccion": err,
    }, separators=(",", ":")))

    print(f"{len(crudo) / 1024:.0f} KiB ({len(comp) / 1024:.0f} KiB con gzip)"
          f"  ->  {len(comp) / nfr / nat:.2f} bytes por atomo y fotograma")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
