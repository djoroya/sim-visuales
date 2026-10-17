#!/usr/bin/env python3
"""Monta el video de portada: bucle sin costura y compresion.

El encuadre sigue a la punta de la grieta, asi que el primer fotograma y el
ultimo se parecen mucho: basta fundir los ultimos con los primeros para que
el bucle no tenga corte. Eso se hace aqui con Pillow, antes de llamar a
ffmpeg.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

from PIL import Image


def funde(carpeta: Path, destino: Path, n_fundido: int) -> int:
    imgs = sorted(carpeta.glob("f*.png"))
    destino.mkdir(parents=True, exist_ok=True)
    for v in destino.glob("*.png"):
        v.unlink()
    n = len(imgs)
    for i, ruta in enumerate(imgs):
        salida = destino / f"f{i:04d}.png"
        k = i - (n - n_fundido)
        if k >= 0:
            # se mezcla con el fotograma equivalente del principio
            a = Image.open(ruta).convert("RGB")
            b = Image.open(imgs[k]).convert("RGB")
            Image.blend(a, b, (k + 1) / (n_fundido + 1)).save(salida)
        else:
            shutil.copy(ruta, salida)
    return n


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=str(raiz / "tmp" / "portada"))
    ap.add_argument("--tmp", default=str(raiz / "tmp" / "portada-bucle"))
    ap.add_argument("--salida", default=str(raiz / "salida"))
    ap.add_argument("--nombre", default="grieta-portada")
    ap.add_argument("--fps", type=int, default=25)
    ap.add_argument("--fundido", type=int, default=12)
    ap.add_argument("--crf-webm", type=int, default=40)
    ap.add_argument("--crf-mp4", type=int, default=32)
    args = ap.parse_args()

    tmp = Path(args.tmp)
    n = funde(Path(args.frames), tmp, args.fundido)
    print(f"{n} fotogramas, {args.fundido} fundidos para cerrar el bucle")

    sal = Path(args.salida)
    sal.mkdir(parents=True, exist_ok=True)
    comun = ["-y", "-loglevel", "error", "-framerate", str(args.fps),
             "-i", str(tmp / "f%04d.png")]
    subprocess.run(["ffmpeg", *comun, "-c:v", "libvpx-vp9", "-crf",
                    str(args.crf_webm), "-b:v", "0", "-row-mt", "1",
                    "-deadline", "good", "-cpu-used", "1", "-pix_fmt",
                    "yuv420p", "-an", str(sal / f"{args.nombre}.webm")],
                   check=True)
    subprocess.run(["ffmpeg", *comun, "-c:v", "libx264", "-crf",
                    str(args.crf_mp4), "-preset", "veryslow", "-profile:v",
                    "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-an", str(sal / f"{args.nombre}.mp4")], check=True)

    for f in (f"{args.nombre}.webm", f"{args.nombre}.mp4"):
        print(f"  {f}  {(sal / f).stat().st_size / 1024:.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
