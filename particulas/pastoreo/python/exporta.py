#!/usr/bin/env python3
"""Empaqueta la trayectoria del pastoreo para el visor web.

Aqui son 31 individuos y unos cientos de fotogramas, asi que no hace falta
nada sofisticado: posiciones cuantizadas a 16 bits sobre la caja comun, con
el byte alto y el bajo en planos separados para que gzip tenga algo que
morder. El fichero entero son unas decenas de KiB.

Formato (little endian), fichero `.herd`:

    0   char[8]   "HERD1\\0\\0\\0"
    8   uint32    numero de individuos
    12  uint16    numero de fotogramas
    14  uint16    version del formato (1)
    16  float32   x0, y0, sx, sy      caja comun
    32  float32   xT, yT              objetivo
    40  uint8     tipo de cada individuo (0 oveja, 1 perro)
    ..  uint8     posiciones: por fotograma y componente (x, y), plano de
                  bytes altos y plano de bytes bajos

Reconstruccion:  x = x0 + (alto*256 + bajo) * sx / 65535.

Las series temporales (tiempo, distancia al objetivo, dispersion) van en un
JSON aparte, que es lo que lee la interfaz.
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
from pathlib import Path

import numpy as np

MAGIC = b"HERD1\0\0\0"


def lee_volcado(ruta: Path):
    """Devuelve (tiempos, posiciones (F, N, 2), tipos (N,))."""
    pasos, cuadros, tipos = [], [], None
    with open(ruta) as fh:
        texto = fh.read()
    bloques = texto.split("ITEM: TIMESTEP\n")[1:]
    for b in bloques:
        lineas = b.splitlines()
        pasos.append(int(lineas[0]))
        i = next(k for k, l in enumerate(lineas) if l.startswith("ITEM: ATOMS"))
        datos = np.array([l.split() for l in lineas[i + 1:] if l.strip()],
                         dtype=np.float64)
        datos = datos[np.argsort(datos[:, 0])]        # por id
        if tipos is None:
            tipos = (datos[:, 1] == 2).astype(np.uint8)   # tipo 2 = perro
        cuadros.append(datos[:, 2:4])
    return np.array(pasos), np.array(cuadros), tipos


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--volcado", default=str(raiz / "datos" / "pastoreo.lammpstrj"))
    ap.add_argument("--medidas", default=str(raiz / "datos" / "pastoreo-medidas.txt"))
    ap.add_argument("--salida", default=str(raiz / "salida" / "pastoreo.herd"))
    ap.add_argument("--meta", default=str(raiz / "salida" / "pastoreo-meta.json"))
    ap.add_argument("--n", type=int, default=300, help="fotogramas a exportar")
    ap.add_argument("--dt", type=float, default=0.01)
    ap.add_argument("--objetivo", type=float, nargs=2, default=[0.0, 0.0])
    ap.add_argument("--margen", type=float, default=30.0)
    args = ap.parse_args()

    pasos, pos, tipos = lee_volcado(Path(args.volcado))
    nfr_total, npart, _ = pos.shape
    idx = np.unique(np.linspace(0, nfr_total - 1, min(args.n, nfr_total))
                    .round().astype(int))
    pos = pos[idx]
    tiempos = pasos[idx] * args.dt
    n = idx.size
    print(f"{nfr_total} volcados de {npart} individuos -> {n} fotogramas")

    mn = pos.reshape(-1, 2).min(axis=0) - args.margen
    mx = pos.reshape(-1, 2).max(axis=0) + args.margen
    # el objetivo tiene que caber en el encuadre aunque el rebano no pase por el
    obj = np.array(args.objetivo)
    mn = np.minimum(mn, obj - args.margen)
    mx = np.maximum(mx, obj + args.margen)
    tam = np.maximum(mx - mn, 1e-3)

    q = np.clip(((pos - mn) / tam * 65535.0).round(), 0, 65535).astype(np.uint16)
    trozos = [MAGIC, struct.pack("<IHH", npart, n, 1),
              struct.pack("<4f", *mn, *tam),
              struct.pack("<2f", *obj),
              tipos.tobytes()]
    for f in range(n):
        for c in range(2):
            col = q[f, :, c]
            trozos.append((col >> 8).astype(np.uint8).tobytes())
            trozos.append((col & 0xFF).astype(np.uint8).tobytes())
    crudo = b"".join(trozos)

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(crudo)
    comprimido = gzip.compress(crudo, 9)

    rec = mn + q.astype(np.float64) / 65535.0 * tam
    err = float(np.abs(rec - pos).max())

    # --- series temporales para la interfaz ---------------------------------
    med = np.loadtxt(args.medidas)
    # se toman las medidas en los mismos instantes que los fotogramas
    j = np.searchsorted(med[:, 0], tiempos)
    j = np.clip(j, 0, len(med) - 1)
    meta = {
        "individuos": int(npart),
        "ovejas": int((tipos == 0).sum()),
        "fotogramas": n,
        "t": [round(float(v), 3) for v in tiempos],
        "distancia": [round(float(v), 2) for v in med[j, 1]],
        "dispersion": [round(float(v), 1) for v in med[j, 2]],
        "objetivo": [float(obj[0]), float(obj[1])],
        "errorCuantizacion": err,
    }
    Path(args.meta).write_text(json.dumps(meta, separators=(",", ":")))

    print(f"{len(crudo) / 1024:.1f} KiB ({len(comprimido) / 1024:.1f} KiB con gzip)"
          f" + meta {Path(args.meta).stat().st_size / 1024:.1f} KiB")
    print(f"error maximo de cuantizacion: {err:.4f} unidades de longitud")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
