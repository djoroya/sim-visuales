#!/usr/bin/env python3
"""Piezas comunes a los bucles de la portada: paleta, cierre del bucle,
compresion, poster y medida de contraste.

Cada simulacion tiene su script (grieta.py, pastoreo.py, nanohilo.py) que solo
sabe dibujar sus fotogramas a 2400x800 en una carpeta; todo lo demas pasa por
aqui para que las diapositivas salgan iguales de nitidas, de ligeras y con el
mismo velo de contraste.

Por que se renderiza siempre a 2400 y la version de 1200 sale reescalando:
el reescalado con Lanczos de un fotograma nitido da bordes mas limpios que
volver a dibujar a la mitad (los discos de matplotlib a 3-4 px se ven
facetados), y ademas es la mitad de trabajo.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parent
SIM = RAIZ.parents[1]                       # proyectos/sim-visuales
WEB = SIM.parent / "personalpage" / "web"     # sim-visuales y personalpage, juntos en laboral/
DESTINO_WEB = WEB / "public" / "sims" / "portada"
TMP = RAIZ / "tmp"

ANCHO, ALTO = 2400, 800
FPS = 24

# --- paleta de la marca (src/styles/global.css) -----------------------------
NAVY = "#0d1f36"
NAVY_HONDO = "#081627"      # el fondo del render de la grieta, algo mas hondo
WARM = "#f59e0b"
AZUL = "#14519b"
AZUL_CLARO = "#3f8fc4"
TEXTO = "#e8eef6"


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0


# --- bucle sin costura ------------------------------------------------------

def cierra_bucle(origen: Path, destino: Path, n_fundido: int) -> int:
    """Funde los ultimos `n_fundido` fotogramas con los primeros.

    El fotograma n-n_fundido+k se mezcla con el k con peso (k+1)/(n_fundido+1):
    al llegar al final la imagen ya es casi el fotograma 0, y como el bucle
    vuelve al 0 no hay salto. Es el mismo truco de md/grieta-2d/python/video.py.
    """
    imgs = sorted(origen.glob("f*.png"))
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    n = len(imgs)
    for i, ruta in enumerate(imgs):
        k = i - (n - n_fundido)
        sal = destino / f"f{i:04d}.png"
        if k >= 0:
            a = Image.open(ruta).convert("RGB")
            b = Image.open(imgs[k]).convert("RGB")
            Image.blend(a, b, (k + 1) / (n_fundido + 1)).save(sal)
        else:
            shutil.copy(ruta, sal)
    return n


# --- compresion -------------------------------------------------------------

def _ffmpeg(*args: str) -> None:
    subprocess.run(["nice", "-n", "10", "ffmpeg", "-hide_banner", "-y",
                    "-loglevel", "error", *args], check=True)


def codifica(fotogramas: Path, nombre: str, crf_webm: dict, crf_mp4: dict,
             fps: int = FPS) -> dict:
    """Escribe <nombre>.webm/.mp4 (2400x800) y <nombre>-1200.webm/.mp4.

    VP9 en dos pasadas con calidad constante: a igual peso da bastante mas
    detalle que una sola pasada, que es justo lo que fallo en el primer video
    de la portada. `-threads 4` porque en esta maquina corren optimizaciones
    largas que no hay que frenar.
    """
    sal = TMP / "salida"
    sal.mkdir(parents=True, exist_ok=True)
    entrada = ["-framerate", str(fps), "-i", str(fotogramas / "f%04d.png")]
    pesos = {}
    for ancho, sufijo in ((ANCHO, ""), (ANCHO // 2, "-1200")):
        escala = ["-vf", f"scale={ancho}:-2:flags=lanczos"] if ancho != ANCHO else []
        base = sal / f"{nombre}{sufijo}"
        log = str(TMP / f"vp9-{nombre}{sufijo}")
        vp9 = ["-c:v", "libvpx-vp9", "-crf", str(crf_webm[ancho]), "-b:v", "0",
               "-row-mt", "1", "-threads", "4", "-tile-columns", "2",
               "-g", "240", "-pix_fmt", "yuv420p", "-an"]
        _ffmpeg(*entrada, *escala, *vp9, "-pass", "1", "-passlogfile", log,
                "-deadline", "good", "-cpu-used", "4", "-f", "null", "/dev/null")
        _ffmpeg(*entrada, *escala, *vp9, "-pass", "2", "-passlogfile", log,
                "-deadline", "good", "-cpu-used", "1",
                "-auto-alt-ref", "1", "-lag-in-frames", "25",
                str(base) + ".webm")
        _ffmpeg(*entrada, *escala, "-c:v", "libx264", "-crf", str(crf_mp4[ancho]),
                "-preset", "veryslow", "-tune", "animation", "-profile:v", "high",
                "-threads", "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-an", str(base) + ".mp4")
        for ext in ("webm", "mp4"):
            f = Path(f"{base}.{ext}")
            pesos[f.name] = f.stat().st_size
    for f in TMP.glob(f"vp9-{nombre}*"):
        f.unlink()
    return pesos


def poster(fotograma: Path, nombre: str, calidad: int = 90) -> dict:
    """El primer fotograma del bucle, en WebP y PNG, a los dos tamanos.

    Tiene que ser el fotograma 0 exacto: el `<video>` se pinta encima del
    poster cuando ya puede reproducir, y si no coinciden se nota el cambio.
    """
    sal = TMP / "salida"
    sal.mkdir(parents=True, exist_ok=True)
    im = Image.open(fotograma).convert("RGB")
    pesos = {}
    for ancho, sufijo in ((ANCHO, ""), (ANCHO // 2, "-1200")):
        x = im if ancho == im.size[0] else im.resize(
            (ancho, ancho * im.size[1] // im.size[0]), Image.LANCZOS)
        w = sal / f"{nombre}{sufijo}.webp"
        p = sal / f"{nombre}{sufijo}.png"
        x.save(w, quality=calidad, method=6)
        x.quantize(colors=200, method=Image.FASTOCTREE).save(p, optimize=True)
        pesos[w.name] = w.stat().st_size
        pesos[p.name] = p.stat().st_size
    return pesos


def publica(nombre: str, carpeta: str) -> None:
    """Copia los ficheros de `nombre` a public/sims/portada/<carpeta>/."""
    dest = DESTINO_WEB / carpeta
    dest.mkdir(parents=True, exist_ok=True)
    for f in (TMP / "salida").glob(f"{nombre}*"):
        if f.suffix in (".webm", ".mp4", ".webp", ".png"):
            shutil.copy(f, dest / f.name)


def informe(pesos: dict) -> None:
    for k in sorted(pesos):
        print(f"  {k:38s} {pesos[k] / 1024:7.1f} KiB")


# --- contraste ---------------------------------------------------------------
#
# Reproduce el velo de Hero.astro (.hero-velo) y la geometria de la banda
# (alto clamp(26rem, 32vw, 34rem), imagen en `object-fit: cover` con
# `object-position` en el foco) para medir el contraste del texto sobre el
# fondo real que ve el visitante, a varios anchos de ventana.

VELO_H = [(0.00, 0.10), (0.40, 0.10), (0.56, 0.45), (0.66, 0.28), (1.00, 0.18)]
VELO_V = [(0.00, 0.32), (0.32, 0.0), (1.00, 0.42)]


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminancia(img: np.ndarray) -> np.ndarray:
    l = _lin(img)
    return 0.2126 * l[..., 0] + 0.7152 * l[..., 1] + 0.0722 * l[..., 2]


def contraste(a: float, b: np.ndarray) -> np.ndarray:
    hi, lo = np.maximum(a, b), np.minimum(a, b)
    return (hi + 0.05) / (lo + 0.05)


def _perfil(puntos, n):
    xs, vs = zip(*puntos)
    return np.interp(np.linspace(0, 1, n), xs, vs)


def banda(img: Image.Image, ancho_ventana: int, foco=(0.72, 0.65)) -> np.ndarray:
    """La banda tal cual se ve: recorte `cover` con el foco y velo encima."""
    rem = 16
    alto = int(round(min(max(26 * rem, 0.32 * ancho_ventana), 34 * rem)))
    w, h = img.size
    s = max(ancho_ventana / w, alto / h)
    iw, ih = int(round(w * s)), int(round(h * s))
    x = img.convert("RGB").resize((iw, ih), Image.LANCZOS)
    # object-position: el foco queda donde dice su porcentaje del sobrante
    ox = int(round((iw - ancho_ventana) * foco[0]))
    oy = int(round((ih - alto) * foco[1]))
    a = np.asarray(x, float)[oy:oy + alto, ox:ox + ancho_ventana] / 255.0
    navy = rgb(NAVY)
    av = _perfil(VELO_V, alto)[:, None, None]
    a = a * (1 - av) + navy * av             # capa de abajo: la vertical
    ah = _perfil(VELO_H, ancho_ventana)[None, :, None]
    a = a * (1 - ah) + navy * ah             # capa de arriba: la horizontal
    return a


def zona_texto(ancho_ventana: int, alto: int):
    """Caja donde hay texto: del borde de `.wrap` (64rem centrado, 1,25rem de
    relleno) al 56 % de la banda, que es hasta donde llega el titular con
    22ch; en vertical, el bloque centrado sin los 4rem de relleno."""
    rem = 16
    izq = max(0, (ancho_ventana - 64 * rem) // 2) + int(1.25 * rem)
    der = int(0.56 * ancho_ventana)
    return izq, der, 4 * rem, alto - 4 * rem


def mide(img: Image.Image, anchos=(1100, 1280, 1440, 1920, 2560),
         foco=(0.72, 0.65)) -> dict:
    """Contraste minimo del texto claro (#e8eef6) y del ambar del antetitulo
    en la zona de texto. Se suaviza 2 px antes de buscar el maximo: un
    trazo de letra cubre varios pixeles, y un pixel suelto mas claro no
    cambia la legibilidad."""
    lt = float(luminancia(rgb(TEXTO)))
    lw = float(luminancia(rgb(WARM)))
    res = {}
    for W in anchos:
        b = banda(img, W, foco)
        H = b.shape[0]
        x0, x1, y0, y1 = zona_texto(W, H)
        z = Image.fromarray((b[y0:y1, x0:x1] * 255).round().astype(np.uint8))
        z = np.asarray(z.filter(ImageFilter.GaussianBlur(2)), float) / 255.0
        lmax = float(luminancia(z).max())
        res[W] = (float(contraste(lt, lmax)), float(contraste(lw, lmax)))
    return res
