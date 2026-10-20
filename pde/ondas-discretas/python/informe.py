#!/usr/bin/env python3
"""Resume los json de la escalera en salida/validacion.md."""

from __future__ import annotations

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SAL = RAIZ / "salida"


def lee(n):
    return json.loads((SAL / f"escalera-{n}.json").read_text())


def e(x):
    return "—" if x is None else f"{x:.1e}"


def main():
    L = ["# Validación: ondas discretas y rayos", "",
         "Generado por `python/informe.py` a partir de `salida/escalera-*.json` "
         "(`./run.sh escalera`). Errores en coordenada física, dominio (−1, 1).", ""]

    op = lee("operador")
    L += ["## 0. Operador", "",
          "Autovalores de M⁻¹K en malla uniforme frente a 4/h² sin²(ξ/2), ξ = kπh/2:", ""]
    L += [f"- N = {n}: error relativo máximo {v['max_err_rel_autovalor']:.0e}"
          for n, v in op["resultados"].items()]

    t = lee("tiempo")
    L += ["", "## 1. Integración en tiempo", "",
          "La semidiscreta se integra **exactamente** (autovectores, rama e^{+iωt}). "
          f"Deriva de energía en T = 5: {t['deriva_energia_exacta']:.0e}. Contraste con el "
          "leapfrog del artículo (g1, ξ₀ = 7π/15, N = 400):", "",
          "| dt | ‖u_lf − u_ex‖/‖u_ex‖ en T | máx. diferencia del centro |", "|---|---|---|"]
    L += [f"| {f['cfl']} h | {f['dif_rel_u_T']:.2e} | {f['max_dif_centro']:.1e} |"
          for f in t["leapfrog"]]
    L += ["", f"Orden observado {t['orden_observado']:.2f} (esperado 2). " + t["nota"][0].upper() + t["nota"][1:]]

    d = lee("dispersion")
    L += ["", "## 2. Velocidad de grupo (malla uniforme)", "",
          f"Pendiente del centro de energía en t ∈ [0, 0,4] para {len(d['filas'])} "
          f"frecuencias ξ₀ ∈ [0,05π, 1,95π], N = {d['N']}, frente a −cos(ξ₀/2): "
          f"**error máximo {d['max_error']:.1e}**, medio {d['error_medio']:.1e}. "
          "En ξ₀ = π la velocidad medida es 0 (la continua sería −1 para todo ξ₀)."]

    r = lee("rayos1d")
    L += ["", "## 3. Centro de energía frente al rayo (1D, N = 1600, T = 5)", "",
          "«Lejos del borde»: el rayo a más de 5 anchuras del paquete de x = ±1 "
          "(durante la reflexión el paquete se solapa consigo mismo y el centro "
          "no es una buena medida).", "",
          "| caso | fenómeno | error máx. | error máx. lejos del borde | error medio | ξ máx. lejos del borde | rango del rayo |",
          "|---|---|---|---|---|---|---|"]
    for c in r["casos"]:
        L.append(f"| {c['caso']} | {c['fenomeno']} | {e(c['max_err_X'])} | "
                 f"{e(c['max_err_X_lejos_borde'])} | {e(c['medio_err_X'])} | "
                 f"{e(c['max_err_xi_lejos_borde'])} | "
                 f"[{c['rango_X_rayo'][0]:+.2f}, {c['rango_X_rayo'][1]:+.2f}] |")
    L += ["", "En todos los casos la energía discreta se conserva a ~1e-14 y el "
          "hamiltoniano del rayo a ≲1e-10. Ojo: los casos con x₀ = 0 y ξ₀ = π dan "
          "error ~1e-14 **por simetría** (el dato es simétrico respecto a x = 0); no "
          "prueban nada más que eso. La prueba fuerte de que el paquete no se mueve "
          "es la velocidad medida en ξ₀ ≈ π (sección 2) y la silla de la sección 4."]

    q = lee("equilibrio")["resultados"]
    L += ["", "## 4. El equilibrio (0, π): centro en g1, silla en g2", "",
          f"- g1: autovalores de la linealización {', '.join(q['g1']['autovalores_linealizacion'])} "
          f"(±i√2, como en el artículo). Periodo de un paquete con ξ₀ = 14π/15: "
          f"{q['g1']['periodo_xi0=14pi/15_paquete']} medido, "
          f"{q['g1']['periodo_xi0=14pi/15_rayo']} del rayo, "
          f"{q['g1']['periodo_linealizado']} linealizado. El paquete en (0, π) no se "
          f"dispersa: anchura {q['g1']['anchura_inicial']} → {q['g1']['anchura_final']} "
          f"(máx. {q['g1']['anchura_max']}).",
          f"- g2: autovalores {', '.join(q['g2']['autovalores_linealizacion'])} (±1/2). "
          f"El paquete se ensancha exponencialmente con tasa "
          f"**{q['g2']['tasa_crecimiento_anchura']}** (teórica 0,5): anchura "
          f"{q['g2']['anchura_inicial']} → {q['g2']['anchura_final']} en T = 8."]

    c = lee("convergencia")
    L += ["", "## 5. Convergencia al refinar (1D)", "",
          "γ = h^−0,9: el haz se estrecha como h^0,45 en x y h^0,55 en ξ. Error medio "
          "lejos del borde:", "",
          "| caso | " + " | ".join(f"N = {n}" for n in c["casos"][0]["N"]) + " | orden |",
          "|---|" + "---|" * (len(c["casos"][0]["N"]) + 1)]
    for f in c["casos"]:
        L.append(f"| {f['caso']} | " + " | ".join(f"{x:.1e}" for x in f["err_medio_lejos_borde"])
                 + f" | {f['orden_medio']} |")
    L += ["", "Orden ≈ 0,9–1,1, coherente con un sesgo del centro de orden "
          "(anchura en x)² + (anchura en ξ)² ~ h^0,9."]

    r2 = lee("rayos2d")
    L += ["", "## 6. Dos dimensiones (N = 400)", "",
          f"Rodeo: dato (0, {r2['Y_rodeo']:.4f}, π/2, π) en g1 — la y inicial es el punto de "
          "retorno de la misma órbita que recorre x, tan(arccos(2^−1/4)), la del post. "
          f"Periodo del rayo {r2['periodo_rodeo_rayo']:.4f}.", "",
          "| caso | fenómeno | T | error máx. | lejos del borde | error medio |",
          "|---|---|---|---|---|---|"]
    for f in r2["casos"]:
        L.append(f"| {f['caso']} | {f['fenomeno']} | {f['T']:.2f} | {e(f['max_err'])} | "
                 f"{e(f['max_err_lejos_borde'])} | {e(f['medio_err'])} |")
    L += ["", "La suma nodal de la densidad de energía coincide con la energía espectral "
          "a 1e-8 en todos los casos. En el rodeo (dos vueltas) el error crece con el "
          "tiempo: el paquete se **cizalla** a lo largo de la órbita porque cada "
          "componente de su espectro tiene un periodo algo distinto (se ve en "
          "`ondas-explicativa.png`, panel c). Su centro sigue al rayo y el error baja "
          "al refinar (sección 7)."]

    c2 = lee("conv2d")
    L += ["", "## 7. Convergencia del rodeo (una vuelta)", "",
          "| N | h | error medio | error máx. |", "|---|---|---|---|"]
    for n, h, a, b in zip(c2["N"], c2["h"], c2["err_medio"], c2["err_max"]):
        L.append(f"| {n} | {h:.2e} | {a:.1e} | {b:.1e} |")
    L += ["", f"Orden {c2['orden_medio']} (medio), {c2['orden_max']} (máximo)."]

    (SAL / "validacion.md").write_text("\n".join(L) + "\n")
    print("  salida/validacion.md")


if __name__ == "__main__":
    main()
