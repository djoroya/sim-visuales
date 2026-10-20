#!/usr/bin/env python3
"""Renders para la portada y figuras para el tutorial.

    python/render.py video   [--etiqueta final]   bucle 3:1, WebM VP9 + MP4 H.264
    python/render.py poster                       fotograma fijo, WebP + PNG
    python/render.py figura                       (b) frente a (c), estatica

Lo que se pinta es la "huella" del sistema, e = sqrt((y/Y)^2 + (z/Z)^2): la
temperatura y la memoria, cada una en su escala. Al principio domina y (los
focos calientes); en cuanto se difunden, queda z, que no difunde. El cuadrado
de control se mueve por la zona central y acaba apagandolo todo; con el
cuadrado quieto (figura) la memoria se queda clavada en estructuras finas
pegadas a su borde.

El bucle: 0,5 s de aparicion de los focos (el cuadrado espera en el centro) y
4,5 s de la solucion optima, que acaba con todo apagado y el cuadrado de vuelta
en el centro y parado (lo pide el coste). El ultimo fotograma es, por tanto, el
primero: ciclo con reinicio suave, sin ida y vuelta (vease el README).
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import ListedColormap
from matplotlib.patches import FancyBboxPatch

RAIZ = Path(__file__).resolve().parents[1]
TMP, SALIDA = RAIZ / "tmp", RAIZ / "salida"
FFMPEG = "/usr/bin/ffmpeg"

FONDO = "#0d1f36"
AZUL = "#14519b"
AMBAR = "#f59e0b"


# --- color -----------------------------------------------------------------------

def _hex(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0


def _a_lineal(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _a_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def _oklab(rgb):
    l = _a_lineal(rgb)
    M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    return M2 @ np.cbrt(M1 @ l)


def _desde_oklab(lab):
    M2i = np.linalg.inv(np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                                  [1.9779984951, -2.4285922050, 0.4505937099],
                                  [0.0259040371, 0.7827717662, -0.8086757660]]))
    M1i = np.linalg.inv(np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                                  [0.2119034982, 0.6806995451, 0.1073969566],
                                  [0.0883024619, 0.2817188376, 0.6299787005]]))
    return _a_srgb(M1i @ ((M2i @ lab) ** 3))


def mapa_color(n=512) -> ListedColormap:
    """Fondo -> azul #14519b -> ambar #f59e0b.

    Del fondo al azul en linea recta; del azul al ambar en OKLCh girando el
    tono por el lado del violeta (azul, violeta, rosa, naranja, ambar), que es
    el camino que no pasa por el gris barroso del punto medio en RGB.
    """
    f, a, m = _oklab(_hex(FONDO)), _oklab(_hex(AZUL)), _oklab(_hex(AMBAR))

    def lch(lab):
        return np.array([lab[0], np.hypot(lab[1], lab[2]), np.arctan2(lab[2], lab[1])])

    La, Lm = lch(a), lch(m)
    h0, h1 = La[2], Lm[2]
    # azul ~263 grados, ambar ~70: se sube de tono pasando por 0 (violeta,
    # rosa, naranja); por el otro lado se pasaria por cian y verde
    if h1 < h0:
        h1 += 2 * np.pi
    cols = []
    corte = 0.28
    for s in np.linspace(0, 1, n):
        if s < corte:
            u = s / corte
            lab = f + (a - f) * u
        else:
            u = (s - corte) / (1 - corte)
            L = La[0] + (Lm[0] - La[0]) * u
            C = La[1] + (Lm[1] - La[1]) * u + 0.06 * np.sin(np.pi * u)
            hh = h0 + (h1 - h0) * u
            lab = np.array([L, C * np.cos(hh), C * np.sin(hh)])
        cols.append(_desde_oklab(lab))
    return ListedColormap(np.array(cols), name="djoroya")


CMAP = mapa_color()


# --- datos -------------------------------------------------------------------------

def carga(etiqueta: str, caso: str):
    D = np.load(TMP / f"{etiqueta}-{caso}.npz")
    res = json.loads(str(D["res"]))
    return {k: D[k] for k in ("y", "z", "d", "F")}, res


def con_borde(A):
    """Anade el borde Dirichlet (ceros): n x n -> (n+2) x (n+2)."""
    B = np.zeros((A.shape[0] + 2, A.shape[1] + 2), A.dtype)
    B[1:-1, 1:-1] = A
    return B


def huella(y, z, Y, Z, gamma=0.6):
    e = np.sqrt((y / Y) ** 2 + (z / Z) ** 2)
    return np.clip(e, 0, 1) ** gamma


def interp(A, s):
    """A[k] en el indice fraccionario s (lineal)."""
    k = int(np.floor(s))
    k = min(max(k, 0), len(A) - 2)
    w = s - k
    return (1 - w) * A[k] + w * A[k + 1]


def suave(u):
    u = np.clip(u, 0, 1)
    return u * u * (3 - 2 * u)


# --- escena ----------------------------------------------------------------------------

class Escena:
    """Figura de tamano exacto en pixeles con el dominio a la derecha."""

    def __init__(self, ancho, alto, x_centro=0.765, lado_rel=0.80, lado_ctrl=0.3):
        self.W, self.H = ancho, alto
        self.fig = plt.figure(figsize=(ancho / 100, alto / 100), dpi=100, facecolor=FONDO)
        L = lado_rel * alto / ancho            # lado del dominio en fracciones de ancho
        self.ax = self.fig.add_axes([x_centro - L / 2, (1 - lado_rel) / 2, L, lado_rel])
        self.ax.set_facecolor(FONDO)
        self.ax.set_xlim(-0.02, 1.02)
        self.ax.set_ylim(-0.02, 1.02)
        self.ax.axis("off")
        self.im = self.ax.imshow(np.zeros((3, 3)), origin="lower", extent=(0, 1, 0, 1),
                                 cmap=CMAP, vmin=0, vmax=1, interpolation="bicubic")
        lw = max(1.0, alto / 400)
        # marco del dominio, muy tenue
        self.ax.add_patch(plt.Rectangle((0, 0), 1, 1, fill=False, ec="#ffffff",
                                        alpha=0.10, lw=lw * 0.8))
        self.lc = lado_ctrl
        self.caja = FancyBboxPatch((0, 0), lado_ctrl, lado_ctrl,
                                   boxstyle="round,pad=0,rounding_size=0.03",
                                   fill=True, fc=(1, 1, 1, 0.05), ec=(1, 1, 1, 0.9),
                                   lw=lw * 1.6)
        self.ax.add_patch(self.caja)
        self.estela, = self.ax.plot([], [], color=AMBAR, lw=lw * 1.4, alpha=0.55,
                                    solid_capstyle="round")
        self.punto, = self.ax.plot([], [], "o", color="#ffffff", ms=lw * 3)

    def pinta(self, campo, d, estela=None, alfa_caja=1.0):
        self.im.set_data(con_borde(campo).T)
        self.caja.set_x(d[0] - self.lc / 2)
        self.caja.set_y(d[1] - self.lc / 2)
        self.caja.set_edgecolor((1, 1, 1, 0.9 * alfa_caja))
        self.caja.set_facecolor((1, 1, 1, 0.05 * alfa_caja))
        self.punto.set_data([d[0]], [d[1]])
        self.punto.set_alpha(0.9 * alfa_caja)
        if estela is not None and len(estela) > 1:
            self.estela.set_data(estela[:, 0], estela[:, 1])
        else:
            self.estela.set_data([], [])
        self.fig.canvas.draw()
        buf = np.asarray(self.fig.canvas.buffer_rgba())[..., :3]
        return np.ascontiguousarray(buf)


def escalas(datos):
    """Y, Z comunes: el maximo de y0 y el de la memoria libre / del caso (b)."""
    Y = float(np.abs(datos["y"][0]).max())
    Z = float(np.abs(datos["z"]).max())
    return Y, 0.8 * Z


def linea_tiempo(datos, fps=30, t_aparece=0.5, t_sim=4.5, t_cola=0.25):
    """Lista de (campo, d, estela) por fotograma."""
    y, z, d = datos["y"], datos["z"], datos["d"]
    K = len(y) - 1
    Y, Z = escalas(datos)
    n_ap = int(round(fps * t_aparece))
    n_sim = int(round(fps * t_sim))
    n_cola = int(round(fps * t_cola))
    e0 = huella(y[0], z[0], Y, Z)
    cuadros = []
    for i in range(n_ap):
        s = suave((i + 1) / n_ap)
        cuadros.append((s * e0, d[0], None))
    for i in range(n_sim):
        u = i / (n_sim - 1)
        s = u * K
        e = huella(interp(y, s), interp(z, s), Y, Z)
        dd = interp(d, s)
        k = int(np.floor(s))
        ini = max(0, k - int(0.3 * K))
        est = np.vstack([d[ini:k + 1], dd[None]])
        # cola: el residuo final (pequeno) se funde a cero y el cuadrado se
        # coloca exactamente en d(0), para que el ultimo cuadro sea el primero
        resto = n_sim - 1 - i
        if resto < n_cola:
            w = suave(1 - resto / n_cola)
            e = (1 - w) * e
            dd = (1 - w) * dd + w * d[0]
            est = est[int(w * len(est)):] if w < 1 else None
        cuadros.append((e, dd, est))
    return cuadros


def codifica(frames_fn, ancho, alto, n, fps, base: Path):
    """Escribe los fotogramas en bruto y codifica WebM VP9 (2 pasadas) y MP4."""
    crudo = TMP / f"{base.name}.rgb"
    with open(crudo, "wb") as f:
        for i in range(n):
            f.write(frames_fn(i).tobytes())
    ent = ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{ancho}x{alto}",
           "-r", str(fps), "-i", str(crudo)]
    crf_vp9 = "30" if ancho >= 2000 else "30"
    vp9 = ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", crf_vp9, "-pix_fmt", "yuv420p",
           "-row-mt", "1", "-tile-columns", "2", "-threads", "1", "-an",
           "-deadline", "good", "-cpu-used", "1"]
    log = str(TMP / f"{base.name}-vp9")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *ent, *vp9, "-pass", "1",
                    "-passlogfile", log, "-f", "null", "/dev/null"], check=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *ent, *vp9, "-pass", "2",
                    "-passlogfile", log, str(base.with_suffix(".webm"))], check=True)
    crf_264 = "21" if ancho >= 2000 else "20"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *ent, "-c:v", "libx264",
                    "-preset", "veryslow", "-crf", crf_264, "-pix_fmt", "yuv420p",
                    "-tune", "animation", "-threads", "1", "-movflags", "+faststart",
                    "-an", str(base.with_suffix(".mp4"))], check=True)
    crudo.unlink()
    for ext in (".webm", ".mp4"):
        f = base.with_suffix(ext)
        print(f"  {f.relative_to(RAIZ)}  {f.stat().st_size / 1024:.0f} KB")


def video(a):
    datos, _ = carga(a.etiqueta, "c")
    fps = 30
    cuadros = linea_tiempo(datos, fps)
    for ancho, alto in ((2400, 800), (1200, 400)):
        esc = Escena(ancho, alto)
        base = SALIDA / f"calor-memoria-{ancho}x{alto}"
        print(f"video {ancho}x{alto}: {len(cuadros)} fotogramas a {fps} fps")
        codifica(lambda i: esc.pinta(*cuadros[i]), ancho, alto, len(cuadros), fps, base)
        plt.close(esc.fig)


def poster(a):
    datos, _ = carga(a.etiqueta, "c")
    cuadros = linea_tiempo(datos)
    i = int(a.avance * len(cuadros))
    for ancho, alto in ((2400, 800), (1200, 400)):
        esc = Escena(ancho, alto)
        img = esc.pinta(*cuadros[i])
        base = SALIDA / f"calor-memoria-poster-{ancho}x{alto}"
        plt.imsave(base.with_suffix(".png"), img)
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(base.with_suffix(".png")),
                        "-c:v", "libwebp", "-quality", "88", str(base.with_suffix(".webp"))],
                       check=True)
        for ext in (".png", ".webp"):
            f = base.with_suffix(ext)
            print(f"  {f.relative_to(RAIZ)}  {f.stat().st_size / 1024:.0f} KB")
        plt.close(esc.fig)


def figura(a):
    """(b) frente a (c): memoria z en 4 instantes y normas en el tiempo."""
    b, rb = carga(a.etiqueta, "b")
    c, rc = carga(a.etiqueta, "c")
    try:
        aa, ra = carga(a.etiqueta, "a")
    except FileNotFoundError:
        aa, ra = None, None
    Y, Z = escalas(b)
    K = len(b["y"]) - 1
    T = rc["T"]
    ks = [0, int(0.2 * K), int(0.45 * K), int(0.7 * K), K]
    plt.rcParams.update({"text.color": "#e6edf5", "axes.labelcolor": "#e6edf5",
                         "xtick.color": "#9fb0c4", "ytick.color": "#9fb0c4",
                         "axes.edgecolor": "#3a4f6b", "font.size": 11})
    fig = plt.figure(figsize=(15, 7.6), facecolor=FONDO)
    gs = fig.add_gridspec(2, len(ks) + 1, width_ratios=[1] * len(ks) + [1.55],
                          wspace=0.08, hspace=0.18, left=0.04, right=0.98,
                          top=0.9, bottom=0.08)
    for r, (D, nombre) in enumerate(((b, "(b) control fijo"), (c, "(c) control móvil"))):
        for j, k in enumerate(ks):
            ax = fig.add_subplot(gs[r, j])
            ax.set_facecolor(FONDO)
            e = huella(D["y"][k], D["z"][k], Y, Z)
            ax.imshow(con_borde(e).T, origin="lower", extent=(0, 1, 0, 1), cmap=CMAP,
                      vmin=0, vmax=1, interpolation="bicubic")
            dk = D["d"][k]
            ax.add_patch(FancyBboxPatch((dk[0] - 0.15, dk[1] - 0.15), 0.3, 0.3,
                                        boxstyle="round,pad=0,rounding_size=0.03",
                                        fill=False, ec="white", lw=1.4))
            if r == 1 and k > 0:
                ax.plot(D["d"][:k + 1, 0], D["d"][:k + 1, 1], color=AMBAR, lw=1.2, alpha=0.7)
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)
            ax.set_xticks([])
            ax.set_yticks([])
            if r == 0:
                ax.set_title(f"t = {k / K * T:.2f}", fontsize=11)
            if j == 0:
                ax.set_ylabel(nombre, fontsize=12)
    ax = fig.add_subplot(gs[:, -1])
    ax.set_facecolor(FONDO)
    t = np.linspace(0, T, K + 1)
    h2 = (1.0 / (b["y"].shape[1] + 1)) ** 2

    def nor(A):
        return np.sqrt(h2 * (A.astype(float) ** 2).sum(axis=(1, 2)))

    zr = rc["z_ref"]
    y0 = nor(b["y"][:1])[0]
    if aa is not None:
        ax.semilogy(t, nor(aa["y"]) / y0, color="#9fb0c4", lw=1.6, ls=":",
                    label="(a) sin memoria: temperatura")
    ax.semilogy(t, nor(b["y"]) / y0, color=AZUL, lw=2, ls="--", label="(b) fijo: temperatura")
    ax.semilogy(t, nor(b["z"]) / zr, color=AZUL, lw=2.4, label="(b) fijo: memoria")
    ax.semilogy(t, nor(c["y"]) / y0, color=AMBAR, lw=2, ls="--", label="(c) móvil: temperatura")
    ax.semilogy(t, nor(c["z"]) / zr, color=AMBAR, lw=2.4, label="(c) móvil: memoria")
    ax.set_xlabel("t")
    ax.set_ylim(1e-3, 3)
    ax.grid(alpha=0.15, which="both")
    ax.legend(loc="lower left", frameon=False, fontsize=9.5)
    ax.set_title("|y(t)|/|y₀|   y   |z(t)|/|z_libre(T)|", fontsize=11)
    fig.suptitle("Calor con memoria: con el control quieto, la memoria se queda clavada junto a su borde; moviéndolo, se apaga",
                 fontsize=14, color="#ffffff")
    for ext in ("png", "webp"):
        f = SALIDA / f"comparacion-b-c.{ext}"
        fig.savefig(f, dpi=130, facecolor=FONDO)
        print(f"  {f.relative_to(RAIZ)}  {f.stat().st_size / 1024:.0f} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("que", choices=["video", "poster", "figura"])
    ap.add_argument("--etiqueta", default="final")
    ap.add_argument("--avance", type=float, default=0.42)
    a = ap.parse_args()
    {"video": video, "poster": poster, "figura": figura}[a.que](a)


if __name__ == "__main__":
    main()
