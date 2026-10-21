"""Tiempo exterior de HortiMED (Zenodo 10.5281/zenodo.6697044, CC-BY 4.0) en el formato del visor.

El conjunto de Zenodo es la salida de una simulación con HORTISIM (15 feb – 14 ago 2018, cada 10 min);
de ahí se toma solo el tiempo exterior que la alimentó: temperatura, humedad, viento y radiación global.
El modelo GES necesita además la temperatura del cielo y la radiación directa y difusa sobre cada cara
de la cubierta, así que se derivan:

- hora solar: el reloj de los datos se desplaza para que el centro de masas de la radiación diaria
  caiga a las 12 h solares (los datos no dicen la zona horaria);
- directa/difusa: fracción difusa de Erbs (1982) con el índice de claridad;
- sobre cada cara (paredes verticales y tejados a 25°, orientadas NE, SE, SW, NW como en GES):
  directa = DNI · max(cos θ, 0), difusa isótropa = DHI · (1 + cos β)/2;
- cielo: emisividad de cielo despejado de Berdahl y Martin (1984) con el punto de rocío,
  corregida con la nubosidad de cada día como en Crawford y Duchon (1999): fracción de nubes
  1 − K_día/0,75 a partir del índice de claridad del día, interpolada entre días;
  ε = n + (1 − n)·ε_despejado y T_cielo = T · ε^¼.

Los últimos días tienen valores imposibles (humedad > 100 %, viento de 150 m/s); se cortan ahí.

Uso: python python/zenodo_clima.py tmp/zenodo/ds.csv app/public/datos/tiempo-hortimed.json
"""
import csv
import datetime as dt
import json
import sys

import numpy as np

LATITUD = 43.0                       # norte de España (supuesto: los datos no lo dicen)
INCLINACION_TEJADO = 25.0
CARAS = [(45, 90), (45, INCLINACION_TEJADO), (135, 90), (135, INCLINACION_TEJADO),
         (225, 90), (225, INCLINACION_TEJADO), (315, 90), (315, INCLINACION_TEJADO)]   # (acimut, inclinación), orden de GES


def lee(ruta):
    r = csv.reader(open(ruta))
    cab = next(r)
    filas = list(r)
    c = {k: i for i, k in enumerate(cab)}
    t = [dt.datetime.strptime(x[0], "%d-%b-%Y %H:%M:%S") for x in filas]
    col = lambda k: np.array([float(x[c[k]]) if x[c[k]] not in ("", "NaN") else np.nan for x in filas])
    return t, col("Temp") - 273.15, col("HR"), col("Wind"), col("Rad")


def sol(doy, hora_solar):
    """Declinación, elevación y acimut (desde el norte, en grados) del sol."""
    d = np.radians(23.45) * np.sin(2 * np.pi * (284 + doy) / 365)
    w = np.radians(15 * (hora_solar - 12))
    la = np.radians(LATITUD)
    sen_h = np.sin(la) * np.sin(d) + np.cos(la) * np.cos(d) * np.cos(w)
    h = np.arcsin(np.clip(sen_h, -1, 1))
    cos_az = (np.sin(d) - np.sin(h) * np.sin(la)) / np.maximum(np.cos(h) * np.cos(la), 1e-9)
    az = np.degrees(np.arccos(np.clip(cos_az, -1, 1)))
    az = np.where(w > 0, 360 - az, az)
    return h, np.radians(az)


def main(entrada, salida):
    t, T, HR, viento, G = lee(entrada)
    malos = (T < -15) | (T > 45) | (HR < 0) | (HR > 100) | (viento > 40) | (G < 0) | (G > 1200) | np.isnan(T + HR + viento + G)
    corte = np.argmax(malos[1:]) + 1 if malos[1:].any() else len(T)
    t, T, HR, viento, G = t[:corte], T[:corte], HR[:corte], viento[:corte], G[:corte]
    HR[0] = HR[1] if malos[0] else HR[0]

    # hora solar: desfase que centra la radiación de cada día en las 12 h
    reloj = np.array([x.hour + x.minute / 60 for x in t])
    doy = np.array([x.timetuple().tm_yday for x in t])
    medios = [np.sum(reloj[doy == d] * G[doy == d]) / np.sum(G[doy == d]) for d in np.unique(doy) if G[doy == d].sum() > 0]
    desfase = round(float(np.median(medios)) - 12, 2)

    # serie horaria en hora solar, desde la primera hora en punto
    t0 = t[0] - dt.timedelta(hours=desfase)
    s = np.array([(x - t0).total_seconds() for x in t]) / 3600
    inicio = np.ceil(s[0])
    horas = np.arange(inicio, np.floor(s[-1]) + 1)
    interp = lambda v: np.interp(horas, s, v)
    T_h, HR_h, V_h, G_h = interp(T), interp(HR), interp(viento), np.maximum(interp(G), 0)
    base = dt.datetime(t0.year, 1, 1)
    abs_h = (t0 - base).total_seconds() / 3600 + horas          # horas desde el 1 de enero (hora solar)
    doy_h = np.floor(abs_h / 24) + 1
    hs = abs_h % 24

    # Erbs: fracción difusa con el índice de claridad
    h, az = sol(doy_h, hs)
    G0 = 1367 * (1 + 0.033 * np.cos(2 * np.pi * doy_h / 365)) * np.maximum(np.sin(h), 0)
    kt = np.where(G0 > 10, np.clip(G_h / np.maximum(G0, 1e-9), 0, 1), 1.0)
    fd = np.where(kt <= 0.22, 1 - 0.09 * kt,
                  np.where(kt <= 0.8, 0.9511 - 0.1604 * kt + 4.388 * kt**2 - 16.638 * kt**3 + 12.336 * kt**4, 0.165))
    DHI = G_h * fd
    DNI = np.where(np.sin(h) > 0.05, np.minimum((G_h - DHI) / np.maximum(np.sin(h), 0.05), 950), 0)
    DHI = np.where(np.sin(h) > 0.05, G_h - DNI * np.sin(h), G_h)   # lo que no cabe en la directa, a la difusa

    directa, difusa = [], []
    for acim, incl in CARAS:
        b, g = np.radians(incl), np.radians(acim)
        cos_t = np.sin(h) * np.cos(b) + np.cos(h) * np.sin(b) * np.cos(az - g)
        directa.append(DNI * np.maximum(cos_t, 0))
        difusa.append(DHI * (1 + np.cos(b)) / 2)
    a, b = 17.27, 237.7                                         # punto de rocío (Magnus)
    g_ = a * T_h / (b + T_h) + np.log(np.clip(HR_h, 1, 100) / 100)
    Td = b * g_ / (a - g_)
    eps = 0.711 + 0.56 * Td / 100 + 0.73 * (Td / 100) ** 2
    dias = np.unique(doy_h)
    K = np.array([G_h[doy_h == d].sum() / max(G0[doy_h == d].sum(), 1) for d in dias])
    nubes = np.interp(abs_h / 24, dias - 0.5, np.clip(1 - K / 0.75, 0, 1))
    eps = nubes + (1 - nubes) * eps
    T_cielo = (T_h + 273.15) * eps ** 0.25 - 273.15

    filas = np.column_stack([T_h, T_cielo, V_h, HR_h, *directa, *difusa])
    nh = len(filas)
    json.dump({
        "fuente": "HortiMED, Zenodo 10.5281/zenodo.6697044 (CC-BY 4.0)",
        "columnas": ["T_ext", "T_cielo", "viento", "HR"] + [f"directa_{k}" for k in range(8)] + [f"difusa_{k}" for k in range(8)],
        "t0": int(abs_h[0] * 3600), "filasMinuto": (nh - 1) * 60 + 1, "latitud": LATITUD, "anio": t0.year,
        "horas": [[round(float(v), 3) for v in f] for f in filas],
    }, open(salida, "w"), separators=(",", ":"))
    fin = base + dt.timedelta(hours=float(abs_h[-1]))
    print(f"{nh} horas, del {(base + dt.timedelta(hours=float(abs_h[0]))):%d %b} al {fin:%d %b %Y} (hora solar = reloj − {desfase} h); "
          f"T {T_h.min():.1f}…{T_h.max():.1f} °C; cortado en la fila {corte} de {len(malos)}")
    # comprobación: la suma de caras pesada como en GES frente a la global horizontal
    area = np.array([40, 0, 75, 135, 40, 0, 75, 135])
    sol_ges = (0.5 * area[:, None] * (np.array(directa) + np.array(difusa))).sum(0) / 500
    print(f"radiación media: global {G_h.mean():.0f} W/m², la que ve GES {sol_ges.mean():.0f} W/m²")


if __name__ == "__main__":
    main(*sys.argv[1:3])
