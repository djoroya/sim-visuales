#!/usr/bin/env python3
"""Convierte los fotogramas elegidos en las imagenes finales.

Para este contenido (patron de discos sobre fondo liso) el PNG con paleta
comprime mejor que el WebP sin perdida, asi que se guardan los dos y se deja
elegir: el PNG es el bueno para las tarjetas y el WebP para cuando hace falta
el minimo peso.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

TAREAS = [
    ("tmp/fijas/fija0095.png", "grieta-oscuro-arranque"),
    ("tmp/fijas/fija0150.png", "grieta-oscuro-propagacion"),
    ("tmp/fijas/fija0205.png", "grieta-oscuro-final"),
    ("tmp/fijas-claro/fija0150.png", "grieta-claro-propagacion"),
    ("tmp/og/fija0150.png", "grieta-og"),
    ("tmp/poster/fija0150.png", "grieta-portada-poster"),
]


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    sal = raiz / "salida"
    sal.mkdir(exist_ok=True)
    for origen, nombre in TAREAS:
        ruta = raiz / origen
        if not ruta.exists():
            print(f"  falta {origen}, se omite")
            continue
        im = Image.open(ruta).convert("RGB")
        im.save(sal / f"{nombre}.webp", quality=72, method=6)
        im.quantize(colors=160, method=Image.FASTOCTREE).save(
            sal / f"{nombre}.png", optimize=True)
        p = (sal / f"{nombre}.png").stat().st_size / 1024
        w = (sal / f"{nombre}.webp").stat().st_size / 1024
        print(f"  {nombre:30s} {im.size[0]}x{im.size[1]}  "
              f"png {p:5.0f} KiB  webp {w:5.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
