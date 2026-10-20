# Conjunto alcanzable de la eliminación selectiva de armónicos

Qué coeficientes de Fourier puede conseguir una onda entre −1 y 1 (con simetría de media
onda): el conjunto alcanzable R = { ∫ D u : u ∈ [−1, 1] }. Es convexo, su función soporte es
h(w) = ∫ |w·D| y, por el teorema de convexidad de Lyapunov, es el mismo con cualquier número
de niveles que incluya ±1. La mayor fundamental con unos armónicos a cero es un programa
lineal. Segunda parte de `../she-control-optimo` (el resolvedor es el mismo).

| Archivo | Qué hace |
|---|---|
| `python/alcanzable.py` | Límites de amplitud (programa lineal) y frontera en 2D |
| `python/figuras_post.py <salida>` | Figuras del artículo (necesita `tmp/dos_niveles.json`) |
| `web/` | Visor: el conjunto en el plano (b1, bh), la onda que consigue cada objetivo o la recta que separa los inalcanzables |
| `web/prueba/dos_niveles.mjs` | Dos niveles con penalización lineal ±u (los mapas de las diapositivas de 2020) |

Resultados: eliminar 5, 7, 11 y 13 permite una fundamental de hasta 1,1704 (el límite que
aparece al barrer la amplitud con 3, 5, 7 o 9 niveles); la tabla completa está en el artículo
del blog. Dos niveles: 1608 casos resueltos con la penalización lineal.
