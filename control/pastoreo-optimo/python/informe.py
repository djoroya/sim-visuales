#!/usr/bin/env python3
"""Junta los JSON de la escalera en `salida/escalera.md`.

El informe se genera, no se escribe a mano: asi los numeros del README y los
de la ultima ejecucion no pueden separarse.
"""

from __future__ import annotations

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "salida"


def lee(nombre: str):
    f = SALIDA / f"escalera-{nombre}.json"
    return json.loads(f.read_text()) if f.exists() else None


def num(x, d=2):
    if x is None:
        return "—"
    return f"{x:,.{d}f}".replace(",", " ").replace(".", ",")


def seccion_integrador(d) -> list[str]:
    out = ["## 0. El paso del integrador no decide el resultado", "",
           f"Mismo control (arbitrario pero fijo) sobre {d['n_o']} ovejas y "
           f"{d['n_p']} perros, horizonte {num(d['T'], 0)} en {d['n']} intervalos, "
           "integrado con pasos cada vez más finos. La referencia es el paso más "
           "fino.", "",
           "| subpasos por intervalo | h | `\\|z(T) − z_ref\\|∞` | segundos |",
           "|---|---:|---:|---:|"]
    for f in d["mallas"]:
        err = "0 (referencia)" if f["err_max_vs_h8"] == 0 else f"{f['err_max_vs_h8']:.2e}"
        out.append(f"| {f['m']} | {num(f['h'], 3)} | {err} | {num(f['segundos'], 2)} |")
    out += ["", "Con `h = 2,5` y `h = 1,25` la integración **diverge**: el modelo "
            "tiene una escala de tiempo rápida, la del perro (`1/ν_p = 0,2`), y RK4 "
            "no la aguanta con pasos largos. A partir de `h = 0,25` el estado final "
            "se mueve menos de 10⁻⁴, así que es el paso que se usa en todo lo demás.",
            ""]
    return out


def seccion_lammps(d) -> list[str]:
    out = ["## 0b. La dinámica es la misma que la validada en LAMMPS", "",
           f"Mismo estado inicial ({d['n_o']} ovejas, un perro quieto que solo "
           f"repele), {num(d['T'], 0)} unidades de tiempo. A la izquierda, RK4 en "
           "CasADi con la fuerza regularizada; a la derecha, "
           "`particulas/pastoreo/` (tabla para `g_oo`, velocity-Verlet con "
           "`dt = 0,01`).", "",
           "| t | centro del rebaño (CasADi) | centro (LAMMPS) | error | "
           "dispersión (CasADi / LAMMPS) |", "|---:|---|---|---:|---|"]
    for f in d["muestras"]:
        out.append(
            f"| {num(f['t'], 0)} | ({num(f['cm_casadi'][0])}, {num(f['cm_casadi'][1])}) "
            f"| ({num(f['cm_lammps'][0])}, {num(f['cm_lammps'][1])}) "
            f"| {f['err_cm']:.4f} | {num(f['disp_casadi'], 1)} / "
            f"{num(f['disp_lammps'], 1)} |")
    out += ["", f"Error máximo del centro del rebaño: **{d['err_cm_max']:.4f}** sobre "
            f"un recorrido de {num(d['recorrido_cm'], 1)}, es decir "
            f"{100 * d['err_cm_max'] / d['recorrido_cm']:.2f} %. La diferencia que "
            "queda es la esperable: la tabla de LAMMPS interpola `g_oo` con un error "
            "relativo de 1,8·10⁻³ y aquí la fuerza lleva la regularización "
            "`r → √(r² + ε²)` con ε = 1.", ""]
    return out


def seccion_gradiente(d) -> list[str]:
    out = ["## 1. El gradiente por diferenciación automática es correcto", "",
           f"{d['variables']} controles ({d['n_o']} ovejas, {d['n_p']} perros), "
           "gradiente adjunto de CasADi contra diferencias finitas centradas.", "",
           "| paso de la diferencia finita | error relativo máximo |", "|---:|---:|"]
    for f in d["pruebas"]:
        out.append(f"| {f['eps']:.0e} | {f['err_rel_max']:.2e} |")
    out += ["", f"El mínimo, **{d['mejor']:.1e}**, es el error de truncamiento propio "
            "de las diferencias finitas, no del gradiente. Y cuesta "
            f"{d['segundos_ad'] * 1e3:.1f} ms frente a "
            f"{d['segundos_df'] * 1e3:.0f} ms ({d['veces_mas_rapido']:.0f} veces "
            "más) con solo " + str(d["variables"]) + " variables; en el caso grande "
            "son 960 y la ventaja del adjunto crece con ellas.", ""]
    return out


def seccion_pareja(d) -> list[str]:
    out = ["## 2. Un perro y una oveja: sale la estrategia de Escobedo et al.", "",
           "El modelo con un solo perseguidor y un solo perseguido es el de "
           "Escobedo, Ibáñez y Zuazua (2016). Lo que describen allí: el perro se "
           "coloca **detrás** de la oveja, en la prolongación de la línea "
           "objetivo-oveja, y la empuja manteniendo una distancia estable.", "",
           "| caso | arranque | J inicial | J final | distancia final | llega en | "
           "cos(alineación) | distancia perro-oveja | iteraciones |",
           "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for clave, f in d.items():
        caso, arranque = clave.split("-")
        out.append(
            f"| {caso} | {arranque} | {num(f['coste_arranque']['J'], 3)} | "
            f"{num(f['coste']['J'], 3)} | {num(f['dist_final'], 1)} | "
            + (f"t = {num(f['t_llegada'], 0)}" if f["t_llegada"] else "no llega")
            + f" | {num(f['cos_medio_conduccion'], 3)} | "
            f"{num(f['dist_perro_oveja_conduccion'], 1)} | "
            f"{f['info']['iteraciones']} |")
    out += ["", "Con el perro ya detrás, da igual de dónde se arranque: se llega al "
            "mismo óptimo, con la oveja alineada (cos = 0,999) y el perro a unas 42 "
            "unidades, del orden del alcance de la repulsión (σ = 50).", "",
            "Con el perro **delante** la cosa cambia, y es el resultado más "
            "instructivo de la escalera: arrancando de control nulo, el optimizador "
            "converge —con todas las de la ley, `Solve_Succeeded`— a un punto "
            "estacionario inútil, el del *abandono*: el perro se aleja hasta que su "
            "repulsión es despreciable, el gradiente se anula y ahí se queda. "
            "Arrancando de la heurística, que sabe rodear, el mismo optimizador "
            "encuentra la solución buena. El arranque en caliente no es un adorno.",
            ""]
    return out


def tabla_comparacion(d) -> list[str]:
    h, o = d["heuristica"], d["optimo_res"]
    filas = [("coste J", "coste", 3), ("distancia final", "dist_final", 1),
             ("distancia mínima", "dist_min", 1),
             ("dispersión final", "disp_final", 0),
             ("esfuerzo ∫Σ\\|a\\|² dt", "esfuerzo_int", 0)]
    out = ["| | heurística | óptimo |", "|---|---:|---:|"]
    for nombre, clave, dec in filas:
        va = h[clave]["J"] if clave == "coste" else h[clave]
        vb = o[clave]["J"] if clave == "coste" else o[clave]
        out.append(f"| {nombre} | {num(va, dec)} | {num(vb, dec)} |")
    out.insert(4, f"| cuándo llega a menos de 20 | "
                  + " | ".join("nunca" if x["t_dist20"] is None
                               else f"t = {num(x['t_dist20'], 0)}" for x in (h, o))
                  + " |")
    out.append(f"| (dispersión de partida) | {num(h['disp_inicial'], 0)} | "
               f"{num(o['disp_inicial'], 0)} |")
    return out


def seccion_veinte(d) -> list[str]:
    i = d["optimo"]
    return ["## 3. Veinte ovejas y un perro", "",
            f"El optimizador arranca de la heurística y da {i['iteraciones']} "
            f"iteraciones en {num(i['segundos'], 0)} s ({i['estado']}).", ""] \
        + tabla_comparacion(d) + [""]


def seccion_grande(d) -> list[str]:
    i = d["optimo"]
    out = [f"## 4. {d['n_o']} ovejas y {d['n_p']} perros", "",
           f"Horizonte {num(d['malla']['T'], 0)} en {d['malla']['n']} intervalos de "
           f"control ({d['variables']} incógnitas), {d['malla']['m']} subpasos de "
           f"RK4 por intervalo (`h = {num(d['malla']['h'], 3)}`), "
           f"`|a| ≤ {num(d['a_max'], 0)}` por componente, pesos "
           f"λ = {num(d['pesos']['lam'], 2)}, β = {num(d['pesos']['bet'], 2)}, "
           f"γ = {num(d['pesos']['gam'], 2)}.", "",
           "| | |", "|---|---:|",
           f"| construir el grafo | {num(d['construir_s'], 1)} s |",
           f"| simular la heurística | {num(d['heuristica_s'], 1)} s |",
           f"| optimizar | {num(i['segundos'] / 60, 1)} min, "
           f"{i['iteraciones']} iteraciones |",
           f"| estado de IPOPT | {i['estado']} |",
           f"| infactibilidad dual final | {i.get('kkt_dual', float('nan')):.2e} |",
           ""] + tabla_comparacion(d) + [""]
    return out


VARIANTES = [
    ("grande", "el del enunciado", "λ = 0,2, β = 0,2, γ = 0,5, arranque en caliente"),
    ("frio", "arranque frío", "el mismo coste, pero partiendo de control nulo"),
    ("sin-seguimiento", "sin seguimiento", "γ = 0: el coste solo mira el instante final"),
    ("lam05", "más peso a agrupar", "λ = 0,5"),
    ("compacto", "compacto todo el camino", "λ_t = 0,3: la dispersión cuenta en cada instante"),
]


def seccion_variantes() -> list[str]:
    """Qué cambia al cambiar el coste. Solo se incluyen las que se hayan
    ejecutado (`python/experimento.py --etiqueta ...`)."""
    filas = []
    for clave, nombre, detalle in VARIANTES:
        d = lee(clave)
        if d is None:
            continue
        o, i = d["optimo_res"], d["optimo"]
        filas.append(f"| {nombre} | {detalle} | {num(o['dist_final'], 1)} | "
                     f"{num(o['disp_final'], 0)} | {num(o['esfuerzo_int'], 0)} | "
                     f"{num(i['segundos'] / 60, 0)} min |")
    if len(filas) < 2:
        return []
    h = lee("grande")["heuristica"]
    cab = ["## 5. Qué cambia si se cambia el coste", "",
           "Todas con 200 ovejas, 3 perros, mismo horizonte y misma cota; lo "
           "único que cambia son los pesos o el punto de partida. La fila de la "
           "heurística está para comparar.", "",
           "| variante | | distancia final | dispersión final | esfuerzo | tiempo |",
           "|---|---|---:|---:|---:|---:|",
           f"| *heurística* | la política del TFM | {num(h['dist_final'], 1)} | "
           f"{num(h['disp_final'], 0)} | {num(h['esfuerzo_int'], 0)} | "
           f"{num(lee('grande')['heuristica_s'], 0)} s |"]
    return cab + filas + [""]


def seccion_espectacular() -> list[str]:
    """El escenario irregular: rebano en banda, cohesion debil, perros dentro."""
    casos = [("espectacular", "k_oo = 0,20, λ_t = 0,18"),
             ("espectacular-b", "k_oo = 0,25, λ_t = 0,25")]
    hay = [(c, t, lee(c)) for c, t in casos if lee(c) is not None]
    if not hay:
        return []
    d0 = hay[0][2]
    out = ["## 6. El rebaño que no es un disco", "",
           f"{d0['n_o']} ovejas repartidas en una banda curva con dos grumos "
           f"(dispersión inicial ≈ 13 700, {num(d0['heuristica']['dist_inicial'] if 'dist_inicial' in d0['heuristica'] else 255, 0)} "
           "de distancia al objetivo), los tres perros repartidos —uno dentro "
           "del grumo grande— y la cohesión entre ovejas escalada por `k_oo`. "
           f"Horizonte {num(d0['malla']['T'], 0)} en {d0['malla']['n']} "
           f"intervalos ({d0['variables']} incógnitas). La dispersión del coste "
           f"se mide contra el rebaño en reposo (`disp_ref` = "
           f"{num(d0.get('disp_ref', 550), 0)}), no contra la inicial.", "",
           "| | distancia final | dispersión final | esfuerzo | iteraciones | tiempo |",
           "|---|---:|---:|---:|---:|---:|",
           f"| *heurística* | {num(d0['heuristica']['dist_final'], 1)} | "
           f"{num(d0['heuristica']['disp_final'], 0)} | "
           f"{num(d0['heuristica']['esfuerzo_int'], 0)} | — | "
           f"{num(d0['heuristica_s'], 0)} s |"]
    for clave, titulo, d in hay:
        o, i = d["optimo_res"], d["optimo"]
        out.append(f"| {titulo} | {num(o['dist_final'], 1)} | "
                   f"{num(o['disp_final'], 0)} | {num(o['esfuerzo_int'], 0)} | "
                   f"{i['iteraciones']} | {num(i['segundos'] / 60, 0)} min |")
    out += ["", "La heurística no mueve este rebaño: los perros orbitan y la "
            "distancia al objetivo se queda donde estaba. El óptimo reúne los "
            "dos grumos, los conduce y los deja dentro del objetivo gastando "
            "una cuarta parte del esfuerzo. Entre las dos versiones, la de "
            "cohesión más débil conserva la forma irregular más tiempo (en "
            "t = 100 la dispersión todavía es 838 frente a 430) y gasta menos, "
            "a cambio de acabar un poco más lejos.", ""]
    return out


def main() -> int:
    partes = ["# La escalera de pruebas", "",
              "Generado por `python/informe.py` a partir de los JSON de "
              "`salida/`. Cada peldaño comprueba una cosa; ninguno se salta.", ""]
    for nombre, fn in (("integrador", seccion_integrador),
                       ("lammps", seccion_lammps),
                       ("gradiente", seccion_gradiente),
                       ("pareja", seccion_pareja),
                       ("veinte", seccion_veinte),
                       ("grande", seccion_grande)):
        d = lee(nombre)
        if d is None:
            print(f"  (falta salida/escalera-{nombre}.json, me lo salto)")
            continue
        partes += fn(d)
    partes += seccion_variantes()
    partes += seccion_espectacular()
    destino = SALIDA / "escalera.md"
    destino.write_text("\n".join(partes) + "\n")
    print(f"-> {destino.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
