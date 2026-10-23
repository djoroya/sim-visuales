"""Curvas tensión–corriente de una celda SOFC en banco de ensayos, a JSON.

Fuente (CC BY 4.0): L. Del Zotto, A. Monforti Ferrario, A. Hatunoglu, A. Dell'Era (2021),
«Resistance, utilization factor curve and polarization curve of test campaign», Zenodo,
doi:10.5281/zenodo.5763484. Datos del artículo «Experimental Procedures & First Results of an
Innovative Solid Oxide Fuel Cell Test Rig: Parametric Analysis and Stability Test», Energies 14,
2038 (2021).

    python python/datos_delzotto.py tmp/zenodo-delzotto/"DATA 2 article Energies 14-02038.xlsx"

Escribe datos/delzotto-iv.json: una curva por hoja «BC_SP_02_IV_…» con temperatura, fracción de H₂
del ánodo (el resto es N₂, sin humidificar), caudales de ánodo y cátodo (ml/min), λ del aire y los
puntos (I en A, V en V, utilización de combustible). El área activa es 3,5 cm² (ASR = R · 3,5).
Lee el .xlsx directamente (zip + XML), sin dependencias.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
AREA_CM2 = 3.5


def celdas(z, ruta, compartidas):
    """{referencia: valor} de una hoja (texto o número como cadena)."""
    out = {}
    for c in ET.fromstring(z.read(ruta)).iter('{%s}c' % NS['m']):
        v = c.findtext('m:v', '', NS)
        if c.get('t') == 's' and v:
            v = compartidas[int(v)]
        out[c.get('r')] = v
    return out


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def leer(xlsx):
    z = zipfile.ZipFile(xlsx)
    compartidas = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))
                   for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    # El orden de las hojas no es el de los ficheros sheetN.xml: la correspondencia está en las relaciones.
    R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    hojas = [(s.get('name'), 'xl/' + rels[s.get(R)].lstrip('/').removeprefix('xl/'))
             for s in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS)]
    curvas = []
    for nombre, ruta in hojas:
        if not nombre.startswith('BC_SP_02_IV_'):
            continue
        c = celdas(z, ruta, compartidas)
        # Cabecera (desde la columna B): fila 3 «gas | % | ml/min | gas | % | ml/min | λ | nominal | real»,
        # fila 4 «H2 | x | ml/min | Air | 1 | ml/min | T | °C», fila 6 «Total | 1 | ml/min | Total …».
        x_h2, q_h2 = num(c.get('C4')), num(c.get('D4'))
        q_an, q_aire = num(c.get('D6')), num(c.get('G4'))
        temp = float(re.search(r'_(\d+)C$', nombre).group(1))  # la celda varía entre hojas; el nombre no
        m = re.match(r'O2_([\d.]+)_', re.sub(r'^BC_SP_02_IV_', '', nombre))
        lam = float(m.group(1)) if m else None  # solo en los barridos de aire (del nombre de la hoja)
        puntos = []
        for fila in range(9, 200):
            I, V, fu = num(c.get(f'B{fila}')), num(c.get(f'D{fila}')), num(c.get(f'U{fila}'))
            if I is None or V is None:
                if puntos:
                    break
                continue
            puntos.append([round(I, 6), round(V, 6), None if fu is None else round(fu, 6)])
        caso = re.sub(r'^BC_SP_02_IV_', '', nombre)
        curvas.append({
            'caso': caso, 'T_C': temp, 'x_H2': x_h2, 'q_anodo_ml_min': q_an, 'q_H2_ml_min': q_h2,
            'q_aire_ml_min': q_aire, 'lambda_aire': lam, 'area_cm2': AREA_CM2,
            'puntos_I_V_FU': puntos,
        })
    return curvas


if __name__ == '__main__':
    curvas = leer(sys.argv[1])
    salida = Path(__file__).resolve().parent.parent / 'datos' / 'delzotto-iv.json'
    salida.write_text(json.dumps({
        'fuente': 'Del Zotto, Monforti Ferrario, Hatunoglu, Dell\'Era (2021), Zenodo doi:10.5281/zenodo.5763484 (CC BY 4.0)',
        'nota': 'Celda de 3,5 cm²; ánodo H₂ + N₂ seco; cátodo aire. Puntos: [I (A), V (V), utilización de combustible].',
        'curvas': curvas,
    }, ensure_ascii=False, indent=1))
    for k in curvas:
        p = k['puntos_I_V_FU']
        print(f"{k['caso']:>16}  T={k['T_C']:.0f} °C  H2={k['x_H2']:.2f}  aire={k['q_aire_ml_min']:.0f} ml/min  λ={k['lambda_aire'] or '–'}  "
              f"{len(p)} puntos  OCV={p[0][1]:.3f} V  Imax={p[-1][0]:.1f} A  Vmin={p[-1][1]:.3f} V  FUmax={p[-1][2]}")
    print(f'{len(curvas)} curvas →', salida)
