"""La hoja del tejado en CalculiX: curvatura real frente a la fórmula y resistencia al viento.

    python python/hoja.py termica [espesor_mm]   # ΔT de 0 a 30 K: factor de anchura → datos/hoja-termica-<s>.json
    python python/hoja.py viento [espesor_mm]    # succión y presión de viento → datos/hoja-viento-<s>.json

Hoja de 150 × 50 × s mm (por defecto 0,2) (Kanthal 230 equivalente), empotrada por el lado corto. Presión de viento
q = ½ ρ u² |Cp| con Cp = 1 (supuesto conservador para una lámina suelta en el tejado).
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import fem  # noqa: E402

L, B = 150.0, 50.0
S = float(sys.argv[2]) if len(sys.argv) > 2 else 0.2
MALLA = dict(nx=75, ny=24, nz_capa=1)
DATOS = Path(__file__).parent.parent / "datos"
T0 = 20.0


def termica():
    dTs = [2.5 * i for i in range(1, 13)]
    t = time.time()
    fem.escribe(f"tmp/hoja_termica_{S}", L, B, S, [T0 + d for d in dTs], **MALLA)
    pasos = fem.ejecuta(f"tmp/hoja_termica_{S}")
    filas = []
    for dT, p in zip(dTs, pasos):
        U = np.array(list(p["U"].values()))
        kap = fem.Bimetal().k * dT / S
        _, za = fem.arco(L, kap)
        filas.append({"dT": dT, "z_medio": float(U[:, 2].mean()), "z_min": float(U[:, 2].min()), "z_max": float(U[:, 2].max()),
                      "z_formula": float(za), "factor": float(U[:, 2].mean() / za)})
        print(f"ΔT {dT:5.1f} K: punta {U[:, 2].mean():6.2f} mm (de {U[:, 2].min():.2f} a {U[:, 2].max():.2f}), fórmula {za:6.2f} mm → ×{U[:, 2].mean() / za:.3f}")
    print(f"{time.time() - t:.0f} s")
    DATOS.mkdir(exist_ok=True)
    (DATOS / f"hoja-termica-{S}.json").write_text(json.dumps({"L": L, "b": B, "s": S, "filas": filas}, indent=1))


def von_mises(s):
    sxx, syy, szz, sxy, sxz, syz = s
    return np.sqrt(0.5 * ((sxx - syy) ** 2 + (syy - szz) ** 2 + (szz - sxx) ** 2) + 3 * (sxy ** 2 + sxz ** 2 + syz ** 2))


def viento():
    res = []
    for u in (8.0, 14.0):
        q = 0.5 * 1.2 * u ** 2 * 1e-6            # MPa
        for nombre, T, signo in (("cerrada, succión", T0, -1), ("abierta 20 K, presión", T0 + 20, +1), ("abierta 20 K, succión", T0 + 20, -1)):
            job = f"tmp/hoja_viento_{S}_{int(u)}_{nombre.split(',')[0].split()[0]}_{'p' if signo > 0 else 's'}"
            fem.escribe(job, L, B, S, [T], presion=signo * q, inc0=0.02, **MALLA)
            try:
                p = fem.ejecuta(job)
            except RuntimeError:
                print(f"{u:4.0f} m/s {nombre}: NO CONVERGE (posible cambio brusco de forma)"); res.append({"u": u, "caso": nombre, "converge": False}); continue
            z0 = np.array(list(p[0]["U"].values()))[:, 2].mean(); z1 = np.array(list(p[1]["U"].values()))[:, 2].mean()
            # tensión mecánica: la del paso con viento menos la del paso solo térmico, punto a punto
            dmax = max(von_mises(np.array(a) - np.array(b)) for e in p[1]["S"] for a, b in zip(p[1]["S"][e], p[0]["S"][e]))
            res.append({"u": u, "q_Pa": q * 1e6, "caso": nombre, "z_sin": float(z0), "z_con": float(z1), "tension_MPa": float(dmax)})
            print(f"{u:4.0f} m/s ({q * 1e6:5.0f} Pa) {nombre:24s}: punta {z0:6.2f} → {z1:6.2f} mm; tensión por el viento {dmax:6.1f} MPa")
    (DATOS / f"hoja-viento-{S}.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    {"termica": termica, "viento": viento}[sys.argv[1]]()
