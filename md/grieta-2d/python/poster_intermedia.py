#!/usr/bin/env python3
"""Poster de la version intermedia: el primer fotograma del bucle.

Tiene que ser el primero y no uno cualquiera, para que al arrancar el video
no se note el salto desde la imagen de carga.
"""

from pathlib import Path

from PIL import Image

raiz = Path(__file__).resolve().parents[1]
origen = raiz / "tmp" / "intermedia" / "f0000.png"
sal = raiz / "salida"
if not origen.exists():
    raise SystemExit(f"falta {origen}; genera antes los fotogramas")

im = Image.open(origen).convert("RGB")
im.save(sal / "grieta-portada-intermedia-poster.webp", quality=80, method=6)
im.quantize(colors=128, method=Image.FASTOCTREE).save(
    sal / "grieta-portada-intermedia-poster.png", optimize=True)
for ext in ("webp", "png"):
    p = sal / f"grieta-portada-intermedia-poster.{ext}"
    print(f"  {p.name}  {p.stat().st_size / 1024:.0f} KiB")
