#!/usr/bin/env python3
"""Empaqueta una trayectoria de LAMMPS en un binario compacto para la web.

De los volcados de LAMMPS saca un numero reducido de fotogramas que cubren
toda la traccion y los guarda asi:

  - el primer fotograma, con las posiciones cuantizadas a 16 bits;
  - los demas, como incrementos respecto al anterior en un byte con signo.

Entre dos fotogramas un atomo se mueve decimas de angstrom, asi que los
incrementos son numeros pequenos y muy repetidos: ahi es donde el fichero
se vuelve ligero (un uint16 por coordenada y fotograma ocupaba el triple
despues de comprimir). El incremento se calcula contra la posicion que va a
reconstruir el visor, no contra la exacta, de modo que el error no se acumula.

Formato (little endian), fichero `.nw`:

    0   char[8]   "NWIRE2\\0\\0"
    8   uint32    numero de atomos
    12  uint16    numero de fotogramas
    14  uint16    version del formato (2)
    16  float32   x0, y0, z0       esquina de la caja comun, en A
    28  float32   paso             angstroms por unidad de cuantizacion
    32  float32   lx0, lxfin       longitud del hilo al principio y al final
    40  float32   eps[nFotogramas] deformacion ingenieril de cada fotograma
    ..  uint8     fotograma 0: por componente (x, y, z), plano de bytes altos
                  y plano de bytes bajos de la posicion cuantizada
    ..  int8      fotogramas 1..n-1: por componente, un incremento por atomo
    ..  uint8     tipos CNA, nAtomos por fotograma
                  (1 fcc, 2 hcp, 3 bcc, 4 icosaedrico, 5 desconocido)

Reconstruccion:  q[0] = alto*256 + bajo ;  q[f] = q[f-1] + d[f] ;
                 x = x0 + q * paso.
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
from pathlib import Path

import numpy as np

MAGIC = b"NWIRE2\0\0"


def ordena(rutas):
    """Por numero de paso: ordenar los nombres como texto los descoloca
    en cuanto el paso pasa de cinco cifras."""
    return sorted(rutas, key=lambda r: int(r.name.split(".")[1]))


def lee_frame(ruta: Path):
    with open(ruta) as fh:
        texto = fh.read()
    cabecera, cuerpo = texto.split("ITEM: ATOMS", 1)
    lineas = cabecera.splitlines()
    i = next(k for k, l in enumerate(lineas) if l.startswith("ITEM: BOX BOUNDS"))
    xlo, xhi = (float(v) for v in lineas[i + 1].split()[:2])
    datos = np.fromstring(cuerpo.split("\n", 1)[1], dtype=np.float64, sep=" ")
    datos = datos.reshape(-1, 5)
    return datos[:, 1:4].astype(np.float64), datos[:, 4].astype(np.uint8), xlo, xhi


def roto(pos_x: np.ndarray, xlo: float, xhi: float, rodaja: float = 5.0) -> bool:
    """Hay rotura cuando dos rodajas seguidas se quedan sin atomos.

    Las rodajas tienen que ser mas anchas que la distancia entre planos
    atomicos (a0/2 = 1,8 A, y mas cuando el hilo esta estirado), o el propio
    cristal perfecto parece lleno de huecos."""
    nbins = max(8, int((xhi - xlo) / rodaja))
    hist, _ = np.histogram(pos_x, bins=nbins, range=(xlo, xhi))
    vacias = hist == 0
    return bool(np.any(vacias[:-1] & vacias[1:]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="datos/frames")
    ap.add_argument("--salida", default="salida/trayectoria.nw")
    ap.add_argument("--control", default="datos/control.json")
    ap.add_argument("--n", type=int, default=80, help="fotogramas a exportar")
    ap.add_argument("--patron", default="*.lammpstrj",
                    help="volcados; el numero de paso va tras el primer punto")
    ap.add_argument("--paso", type=float, default=0.07,
                    help="angstroms por unidad de cuantizacion")
    ap.add_argument("--cola", type=int, default=8,
                    help="fotogramas que se conservan despues de la rotura")
    args = ap.parse_args()

    rutas = ordena(Path(args.frames).glob(args.patron))
    if not rutas:
        raise SystemExit("no hay volcados que exportar")

    # --- 1) leer todo y localizar la rotura ---------------------------------
    todo = [lee_frame(r) for r in rutas]
    nat = todo[0][0].shape[0]
    rotos = np.where([roto(p[:, 0], lo, hi) for p, _, lo, hi in todo])[0]
    i_rot = int(rotos[0]) if rotos.size else len(todo) - 1
    i_fin = min(len(todo) - 1, i_rot + args.cola)
    print(f"{len(todo)} volcados de {nat} atomos; "
          f"{'rotura en el ' + str(i_rot) if rotos.size else 'sin rotura detectada'}"
          f", se exporta hasta el {i_fin}")

    idx = np.unique(np.linspace(0, i_fin, min(args.n, i_fin + 1)).round().astype(int))
    n = idx.size

    # --- 2) centrar la rotura en el encuadre --------------------------------
    pf, _, lof, hif = todo[idx[-1]]
    lxf = hif - lof
    hist, bordes = np.histogram((pf[:, 0] - lof) / lxf, bins=60, range=(0, 1))
    suave = np.convolve(np.r_[hist, hist, hist], np.ones(5) / 5, "same")[60:120]
    k = int(np.argmin(suave))
    desplaza = (0.5 * (bordes[k] + bordes[k + 1]) + 0.5) % 1.0

    # --- 3) trayectorias continuas (sin saltos por el borde periodico) ------
    pos = np.empty((n, nat, 3))
    tipos = np.empty((n, nat), dtype=np.uint8)
    eps = np.empty(n, dtype=np.float32)
    lx0 = todo[0][3] - todo[0][2]
    s_prev = None
    vueltas = np.zeros(nat)
    for j, i in enumerate(idx):
        p, t, lo, hi = todo[i]
        lx = hi - lo
        s = np.mod((p[:, 0] - lo) / lx - desplaza, 1.0)
        if s_prev is not None:
            # un atomo que sale por un extremo y entra por el otro se sigue
            # dibujando donde estaba: asi su incremento no es de media caja
            vueltas -= np.round(s - s_prev)
        s_prev = s.copy()
        pos[j, :, 0] = (s + vueltas - 0.5) * lx
        pos[j, :, 1:] = p[:, 1:]
        tipos[j] = t
        eps[j] = lx / lx0 - 1.0

    pos[:, :, 1] -= 0.5 * (pos[0, :, 1].min() + pos[0, :, 1].max())
    pos[:, :, 2] -= 0.5 * (pos[0, :, 2].min() + pos[0, :, 2].max())

    mn = pos.reshape(-1, 3).min(axis=0)
    paso = float(args.paso)

    # --- 4) cuantizar: primero absoluto, despues incrementos ----------------
    objetivo = np.round((pos - mn) / paso).astype(np.int32)
    if objetivo[0].max() > 65535:
        raise SystemExit("el primer fotograma no cabe en 16 bits: sube --paso")

    q = objetivo[0].copy()
    deltas = np.empty((n - 1, nat, 3), dtype=np.int8)
    saturados = 0
    for f in range(1, n):
        d = np.clip(objetivo[f] - q, -127, 127)
        saturados += int((np.abs(objetivo[f] - q) > 127).sum())
        deltas[f - 1] = d.astype(np.int8)
        q = q + d

    # reconstruccion identica a la del visor, para medir el error de verdad
    rec = np.empty_like(objetivo)
    rec[0] = objetivo[0]
    for f in range(1, n):
        rec[f] = rec[f - 1] + deltas[f - 1]
    recon = mn + rec * paso
    err = float(np.abs(recon - pos).max())
    print(f"paso {paso} A; error maximo de reconstruccion {err * 1000:.1f} mA; "
          f"incrementos saturados: {saturados} de {(n - 1) * nat * 3}")

    # --- 5) escribir --------------------------------------------------------
    trozos = [MAGIC, struct.pack("<IHH", nat, n, 2),
              struct.pack("<4f", *mn, paso),
              struct.pack("<2f", lx0, lx0 * (1.0 + float(eps[-1]))),
              eps.astype("<f4").tobytes()]
    q0 = objetivo[0].astype(np.uint16)
    for c in range(3):
        trozos.append((q0[:, c] >> 8).astype(np.uint8).tobytes())
        trozos.append((q0[:, c] & 0xFF).astype(np.uint8).tobytes())
    for f in range(n - 1):
        for c in range(3):
            trozos.append(deltas[f, :, c].tobytes())
    trozos.append(tipos.tobytes())
    crudo = b"".join(trozos)

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(crudo)
    comprimido = gzip.compress(crudo, 9)
    destino.with_suffix(".nw.gz").write_bytes(comprimido)

    rng = np.random.default_rng(7)
    muestras = [{"frame": int(f), "atomo": int(a),
                 "x": float(recon[f, a, 0]), "y": float(recon[f, a, 1]),
                 "z": float(recon[f, a, 2]), "tipo": int(tipos[f, a])}
                for f, a in zip(rng.integers(0, n, 6), rng.integers(0, nat, 6))]
    Path(args.control).write_text(json.dumps(
        {"nAtomos": nat, "nFrames": n, "errorReconstruccion": err,
         "muestras": muestras}, indent=1))

    print(f"{n} fotogramas x {nat} atomos  ->  {len(crudo) / 1024:.0f} KiB "
          f"({len(comprimido) / 1024:.0f} KiB con gzip)")
    print(f"deformacion de {eps[0] * 100:.1f} % a {eps[-1] * 100:.1f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
