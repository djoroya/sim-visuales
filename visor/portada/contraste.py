#!/usr/bin/env python3
"""Mide el contraste del texto de la portada sobre cada diapositiva.

Recompone la banda como la ve el visitante (recorte `cover` con el foco de la
diapositiva y el velo de Hero.astro encima) a varios anchos de ventana y da
el peor contraste en la zona del texto. Para las diapositivas con video mide
el poster y una muestra de fotogramas del propio video (el contraste tiene
que cumplirse en todo el bucle, no solo en el primer fotograma).

El listón es el de la grieta, que es la que fijo el velo: 6,7:1 para el texto
claro (#e8eef6). Se da tambien el del ambar del antetitulo (#f59e0b, 13 px en
mayusculas), que solo va arriba del bloque de texto.

    python contraste.py            # todas
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image

import comun

PUBLICO = comun.WEB / "public" / "sims"
# (nombre, poster, video o None, foco) -- el mismo foco que en Hero.astro
DIAPOSITIVAS = [
    ("grieta", PUBLICO / "grieta/portada/grieta-portada-fija.png", None, (0.72, 0.65)),
    ("pastoreo", PUBLICO / "portada/pastoreo/pastoreo-poster.png",
     PUBLICO / "portada/pastoreo/pastoreo.webm", (0.80, 0.50)),
    ("nanohilo", PUBLICO / "portada/nanohilo/nanohilo-poster.png",
     PUBLICO / "portada/nanohilo/nanohilo.webm", (0.72, 0.50)),
]
LISTON = 6.7


def fotogramas(video: Path, n: int = 12):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i",
                        str(video), "-vf", f"fps={n}/6", str(Path(d) / "m%03d.png")],
                       check=True)
        for f in sorted(Path(d).glob("m*.png")):
            yield Image.open(f).copy()


def main() -> int:
    mal = 0
    for nombre, poster, video, foco in DIAPOSITIVAS:
        imgs = [("poster", Image.open(poster))]
        if nombre == "grieta":
            # el otro extremo del zoom lento (6 %, con origen en el foco)
            im = imgs[0][1]
            w, h = im.size
            z = im.resize((int(w * 1.06), int(h * 1.06)), Image.LANCZOS)
            ox, oy = int((z.size[0] - w) * foco[0]), int((z.size[1] - h) * foco[1])
            imgs.append(("zoom 6 %", z.crop((ox, oy, ox + w, oy + h))))
        if video:
            imgs += [(f"video {k}", f) for k, f in enumerate(fotogramas(video))]
        peor_t, peor_w, donde = 99.0, 99.0, ""
        for etiqueta, im in imgs:
            for ancho, (ct, cw) in comun.mide(im, foco=foco).items():
                if ct < peor_t:
                    peor_t, donde = ct, f"{etiqueta}, {ancho} px"
                peor_w = min(peor_w, cw)
        estado = "ok" if peor_t >= LISTON - 0.05 else "NO CUMPLE"
        mal += estado != "ok"
        print(f"{nombre:10s} texto {peor_t:5.2f}:1  ambar {peor_w:5.2f}:1  "
              f"(peor: {donde})  {estado}")
    return 1 if mal else 0


if __name__ == "__main__":
    raise SystemExit(main())
