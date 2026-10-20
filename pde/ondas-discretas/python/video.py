#!/usr/bin/env python3
"""Monta el video de portada: bucle sin costura, dos tamanos, poster.

El bucle dura medio periodo del rodeo (los dos haces van en fases opuestas,
asi que a T/2 la escena se repite). La unica diferencia entre el final y el
principio es lo poco que el paquete se ensancha en ese medio periodo; se
disimula fundiendo los ultimos fotogramas con los de tiempo negativo
(p0015 ... p0001), que son exactamente los que preceden a t = 0: al acabar
el fundido la imagen es la de t = -dt y el siguiente fotograma es t = 0.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]


def funde(carpeta: Path, destino: Path, n_f: int, ancho: int) -> int:
    imgs = sorted(carpeta.glob("f*.png"))
    pre = {int(p.stem[1:]): p for p in carpeta.glob("p*.png")}
    n_f = min(n_f, len(pre))
    destino.mkdir(parents=True, exist_ok=True)
    for v in destino.glob("*.png"):
        v.unlink()
    n = len(imgs)
    for i, ruta in enumerate(imgs):
        a = Image.open(ruta).convert("RGB")
        k = i - (n - n_f)          # 0 .. n_f-1 en la cola
        if k >= 0:
            b = Image.open(pre[n_f - k]).convert("RGB")   # t = -(n_f - k) dt
            a = Image.blend(a, b, (k + 1) / (n_f + 1))
        if a.width != ancho:
            a = a.resize((ancho, round(a.height * ancho / a.width)), Image.LANCZOS)
        a.save(destino / f"f{i:04d}.png")
    return n


def codifica(tmp: Path, sal: Path, nombre: str, fps: int, crf_webm: int, crf_mp4: int):
    comun = ["-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(tmp / "f%04d.png")]
    subprocess.run(["nice", "ffmpeg", *comun, "-c:v", "libvpx-vp9", "-crf", str(crf_webm),
                    "-b:v", "0", "-row-mt", "1", "-threads", "4", "-deadline", "good",
                    "-cpu-used", "1", "-pix_fmt", "yuv420p", "-an",
                    str(sal / f"{nombre}.webm")], check=True)
    subprocess.run(["nice", "ffmpeg", *comun, "-c:v", "libx264", "-crf", str(crf_mp4),
                    "-preset", "veryslow", "-threads", "4", "-profile:v", "high",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
                    str(sal / f"{nombre}.mp4")], check=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default=str(RAIZ / "tmp" / "portada"))
    ap.add_argument("--salida", default=str(RAIZ / "salida"))
    ap.add_argument("--nombre", default="ondas-rodeo-portada")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--fundido", type=int, default=15)
    ap.add_argument("--crf-webm", type=int, default=31)
    ap.add_argument("--crf-mp4", type=int, default=24)
    args = ap.parse_args()

    sal = Path(args.salida)
    sal.mkdir(parents=True, exist_ok=True)
    frames = Path(args.frames)
    for ancho, sufijo, dcrf in ((2400, "", 0), (1200, "-1200", -4)):
        tmp = RAIZ / "tmp" / f"bucle{sufijo or '-2400'}"
        n = funde(frames, tmp, args.fundido, ancho)
        nombre = args.nombre + sufijo
        codifica(tmp, sal, nombre, args.fps, args.crf_webm + dcrf, args.crf_mp4 + dcrf)
        print(f"{ancho} px: {n} fotogramas ({n / args.fps:.1f} s), fundido {args.fundido}")
        for f in (f"{nombre}.webm", f"{nombre}.mp4"):
            print(f"  {f}  {(sal / f).stat().st_size / 1024:.0f} KiB")
        # poster = primer fotograma del bucle (el que se ve antes de arrancar)
        p = Image.open(tmp / "f0000.png").convert("RGB")
        p.save(sal / f"{nombre}-poster.png", optimize=True)
        p.save(sal / f"{nombre}-poster.webp", quality=88, method=6)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
