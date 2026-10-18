#!/usr/bin/env python3
"""Imagen fija de la portada, en sus dos tamanos.

El encuadre lo fija python/render.py con --frac-punta y --frac-grieta: la
grieta entra por la izquierda a tres cuartos de altura y la punta queda a la
derecha, para que el titular tenga sitio en la mitad izquierda y en la franja
central. Como la web le aplica un zoom lento, en el 5 % de los bordes no hay
nada que importe perder.
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
TAREAS = [
    ("tmp/pf/fija0150.png", "grieta-portada-fija"),
    ("tmp/pf1200/fija0150.png", "grieta-portada-fija-1200"),
]
CALIDAD = 92


def main() -> int:
    sal = RAIZ / "salida"
    sal.mkdir(exist_ok=True)
    for origen, nombre in TAREAS:
        ruta = RAIZ / origen
        if not ruta.exists():
            print(f"  falta {origen}, se omite")
            continue
        im = Image.open(ruta).convert("RGB")
        im.save(sal / f"{nombre}.webp", quality=CALIDAD, method=6)
        im.quantize(colors=200, method=Image.FASTOCTREE).save(
            sal / f"{nombre}.png", optimize=True)
        w = (sal / f"{nombre}.webp").stat().st_size / 1024
        p = (sal / f"{nombre}.png").stat().st_size / 1024
        print(f"  {nombre:28s} {im.size[0]}x{im.size[1]}  "
              f"webp {w:5.0f} KiB  png {p:5.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
