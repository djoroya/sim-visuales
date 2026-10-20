# Eliminación selectiva de armónicos por control óptimo

Onda escalonada multinivel con unos armónicos prescritos (la fundamental) y otros eliminados
exactamente, como problema de control óptimo con penalización lineal a trozos (Oroya-Villalta,
Esteve-Yagüe y Biccari, *Multilevel Selective Harmonic Modulation via Optimal Control*, Appl.
Math. Optim. 86, 2022). Aquí resuelto por el **dual**: el control queda fijado por un vector
`q` de un número por coeficiente controlado, que maximiza una función cóncava; las
conmutaciones se calculan de forma exacta y Newton converge en pocas iteraciones.

| Archivo | Qué hace |
|---|---|
| `python/she.py` | Referencia: dual, conmutaciones exactas, Newton regularizado, brecha de dualidad |
| `python/compara_ipopt.py` | Frente al método del artículo (CasADi + IPOPT sobre malla). `NIVELES=3/5/7` |
| `python/clasico.py <m>` | Frente al método clásico: todas las secuencias de niveles, Newton desde arranques al azar |
| `python/referencia.py` | Casos de referencia para la versión JavaScript (`tmp/referencia.json`) |
| `python/figuras_post.py <salida>` | Figuras del artículo |
| `web/` | Visor en el navegador (JavaScript puro): `js/she.js` es el resolvedor; `js/raices.js`, las conmutaciones exactas (raíces de m(τ) + c como polinomio en z = e^{iτ}, sin muestrear) |
| `web/prueba/compara.mjs` | JavaScript frente a Python |
| `web/prueba/banco.mjs` | Banco de pruebas, formulación clásica de tres niveles, N = 5…25: Newton desde ángulos al azar, enjambre de partículas + Newton (parámetros de Chen et al., 2026) y el dual en frío y en caliente |
| `web/prueba/continuacion.mjs` | Seguir una solución al variar la amplitud: Newton por continuación frente al dual en caliente |

```bash
../../.venv/bin/python python/compara_ipopt.py
../../.venv/bin/python python/referencia.py && node web/prueba/compara.mjs
cd web && python3 -m http.server
```

Resultados (5 armónicos: 1, 5, 7, 11, 13, con seno y coseno):

- Mismo coste que IPOPT hasta la sexta cifra en 27 casos (3/5/7 niveles), brecha de dualidad 0.
- La solución coincide con la de menor penalización entre todas las que encuentra el método
  clásico probando las 18 secuencias de niveles.
- Error en los armónicos proporcional a ε; con objetivos imposibles (amplitud > 1,17), `q`
  crece como 1/ε.
- Número par de niveles: la penalización es plana entre los dos niveles centrales y, para
  amplitudes pequeñas, el óptimo deja de ser escalonado.
- Banco (misma máquina): con N ≤ 9 ángulos, Newton desde ángulos al azar es lo más rápido; con
  N = 17 y 25 no encuentra solución en 20 s, y el dual las encuentra todas en 0,1–0,6 s con el
  número mínimo de ángulos. Para seguir una solución al variar la amplitud, Newton por
  continuación es de 50 a 200 veces más rápido: la combinación es dual + Newton.
