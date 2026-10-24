#!/usr/bin/env python3
"""Bucles de portada grabados desde una escena web (Three.js): pila SOFC y grulla.

    node fotogramas.mjs <url ?portada> tmp/crudo-<nombre> 144 24 '<opciones>'
    ../../.venv/bin/python navegador.py <nombre> [--fundido N]
    ../../.venv/bin/python -c "import comun; comun.publica('<nombre>', '<carpeta>')"

La escena dibuja cada fotograma de forma exacta para un instante t (sin reloj), así que el bucle
sale igual cada vez. Si la escena ya es periódica en 6 s (la pila), no hace falta fundido; si no
(la grulla, que se pliega), se funden los últimos N fotogramas con los primeros.
"""
import argparse
from pathlib import Path

import comun

p = argparse.ArgumentParser()
p.add_argument("nombre")
p.add_argument("--fundido", type=int, default=0)
p.add_argument("--niebla", default="", help="'a,b': azul de la marca hasta a (fracción del ancho) y fundido hasta b")
p.add_argument("--crf", type=int, default=0, help="suma a los CRF por defecto (más = más ligero)")
a = p.parse_args()
crudo = comun.TMP / f"crudo-{a.nombre}"
if a.niebla:
    # Escenas que llenan todo el encuadre (el invernadero por dentro): la mitad izquierda se funde
    # con el azul de la portada, donde va el titular. Suave (smoothstep) para que no haya bandas.
    import numpy as np
    from PIL import Image
    x0, x1 = (float(v) for v in a.niebla.split(","))
    u = np.clip((np.linspace(0, 1, comun.ANCHO) - x0) / (x1 - x0), 0, 1)
    alfa = (1 - u * u * (3 - 2 * u))[None, :, None]
    navy = comun.rgb(comun.NAVY)[None, None, :] * 255
    dest = comun.TMP / f"niebla-{a.nombre}"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(crudo.glob("f*.png")):
        im = np.asarray(Image.open(f).convert("RGB"), float)
        Image.fromarray((im * (1 - alfa) + navy * alfa).round().astype(np.uint8)).save(dest / f.name)
    crudo = dest
pesos = comun.poster(crudo / "f0000.png", f"{a.nombre}-poster")
bucle = crudo
if a.fundido:
    bucle = comun.TMP / f"bucle-{a.nombre}"
    comun.cierra_bucle(crudo, bucle, a.fundido)
pesos |= comun.codifica(bucle, a.nombre, crf_webm={2400: 40 + a.crf, 1200: 38 + a.crf}, crf_mp4={2400: 28 + a.crf, 1200: 26 + a.crf})
comun.informe(pesos)
