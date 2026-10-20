# Validación: ondas discretas y rayos

Generado por `python/informe.py` a partir de `salida/escalera-*.json` (`./run.sh escalera`). Errores en coordenada física, dominio (−1, 1).

## 0. Operador

Autovalores de M⁻¹K en malla uniforme frente a 4/h² sin²(ξ/2), ξ = kπh/2:

- N = 100: error relativo máximo 6e-14
- N = 400: error relativo máximo 1e-11
- N = 1600: error relativo máximo 8e-11

## 1. Integración en tiempo

La semidiscreta se integra **exactamente** (autovectores, rama e^{+iωt}). Deriva de energía en T = 5: 3e-15. Contraste con el leapfrog del artículo (g1, ξ₀ = 7π/15, N = 400):

| dt | ‖u_lf − u_ex‖/‖u_ex‖ en T | máx. diferencia del centro |
|---|---|---|
| 0.1 h | 1.72e+00 | 1.1e-02 |
| 0.05 h | 5.10e-01 | 2.6e-03 |
| 0.025 h | 1.29e-01 | 6.4e-04 |
| 0.0125 h | 3.22e-02 | 1.6e-04 |

Orden observado 1.92 (esperado 2). Con dt = 0.1 h el leapfrog del articulo comete un error de fase O(1) a esta frecuencia: omega dt = 0.2 sin(xi/2)/g' no depende de h. Por eso aqui se integra exactamente en tiempo.

## 2. Velocidad de grupo (malla uniforme)

Pendiente del centro de energía en t ∈ [0, 0,4] para 39 frecuencias ξ₀ ∈ [0,05π, 1,95π], N = 1600, frente a −cos(ξ₀/2): **error máximo 2.0e-04**, medio 1.2e-04. En ξ₀ = π la velocidad medida es 0 (la continua sería −1 para todo ξ₀).

## 3. Centro de energía frente al rayo (1D, N = 1600, T = 5)

«Lejos del borde»: el rayo a más de 5 anchuras del paquete de x = ±1 (durante la reflexión el paquete se solapa consigo mismo y el centro no es una buena medida).

| caso | fenómeno | error máx. | error máx. lejos del borde | error medio | ξ máx. lejos del borde | rango del rayo |
|---|---|---|---|---|---|---|
| uniforme-pi/4 | baja frecuencia: rebota en los bordes | 2.7e-02 | 9.2e-04 | 9.9e-04 | 6.5e-07 | [-1.00, +1.00] |
| uniforme-pi | no se propaga (v_g = 0) | 3.0e-14 | 3.0e-14 | 1.0e-14 | 1.7e-14 | [-0.00, +0.00] |
| uniforme-7pi/4 | simetrico de pi/4: va a la derecha | 2.7e-02 | 9.2e-04 | 9.9e-04 | 6.5e-07 | [-1.00, +1.00] |
| g1-pi/4 | baja frecuencia en g1: como el continuo | 2.2e-02 | 1.6e-03 | 1.0e-03 | 1.9e-03 | [-1.00, +1.00] |
| g1-7pi/15 | reflexion interna sin tocar el borde | 1.1e-03 | 1.1e-03 | 4.9e-04 | 4.1e-03 | [-0.70, +0.70] |
| g1-10pi/15 | reflexion interna, amplitud menor | 1.3e-03 | 1.3e-03 | 4.3e-04 | 2.7e-03 | [-0.39, +0.39] |
| g1-13pi/15 | reflexion interna, cerca del centro | 5.1e-04 | 5.1e-04 | 1.9e-04 | 1.2e-03 | [-0.15, +0.15] |
| g1-pi | equilibrio (centro): no se propaga ni se dispersa | 1.5e-13 | 1.5e-13 | 4.8e-14 | 4.4e-13 | [-0.00, +0.00] |
| g2-pi/4 | baja frecuencia en g2 | 2.7e-02 | 9.5e-04 | 1.1e-03 | 2.1e-04 | [-0.99, +1.00] |
| g2-x0=1/2-pi | atrapada en x > 0: toca solo un borde | 6.1e-02 | 7.7e-03 | 5.5e-03 | 1.6e-02 | [+0.50, +1.00] |
| g2-x0=-1/2-pi | atrapada en x < 0: toca solo un borde | 6.1e-02 | 7.7e-03 | 5.5e-03 | 1.6e-02 | [-1.00, -0.50] |
| g2-pi | equilibrio (silla): no se propaga pero se dispersa | 7.6e-15 | 7.6e-15 | 1.4e-15 | 8.0e-15 | [-0.00, +0.00] |

En todos los casos la energía discreta se conserva a ~1e-14 y el hamiltoniano del rayo a ≲1e-10. Ojo: los casos con x₀ = 0 y ξ₀ = π dan error ~1e-14 **por simetría** (el dato es simétrico respecto a x = 0); no prueban nada más que eso. La prueba fuerte de que el paquete no se mueve es la velocidad medida en ξ₀ ≈ π (sección 2) y la silla de la sección 4.

## 4. El equilibrio (0, π): centro en g1, silla en g2

- g1: autovalores de la linealización 1.4142j, -1.4142j (±i√2, como en el artículo). Periodo de un paquete con ξ₀ = 14π/15: 4.46 medido, 4.46 del rayo, 4.4429 linealizado. El paquete en (0, π) no se dispersa: anchura 0.0349 → 0.0129 (máx. 0.0349).
- g2: autovalores (0.5+0j), (-0.5+0j) (±1/2). El paquete se ensancha exponencialmente con tasa **0.486** (teórica 0,5): anchura 0.0349 → 0.596 en T = 8.

## 5. Convergencia al refinar (1D)

γ = h^−0,9: el haz se estrecha como h^0,45 en x y h^0,55 en ξ. Error medio lejos del borde:

| caso | N = 200 | N = 400 | N = 800 | N = 1600 | N = 3200 | orden |
|---|---|---|---|---|---|---|
| g1-7pi/15 | 4.0e-03 | 2.1e-03 | 1.0e-03 | 4.9e-04 | 2.6e-04 | 1.0 |
| g1-13pi/15 | 1.3e-03 | 7.0e-04 | 3.7e-04 | 1.9e-04 | 1.0e-04 | 0.93 |
| uniforme-pi/4 | 4.8e-03 | 2.2e-03 | 1.0e-03 | 4.7e-04 | 2.2e-04 | 1.1 |
| g2-x0=1/2-pi | 2.3e-02 | 1.2e-02 | 6.5e-03 | 3.4e-03 | 1.9e-03 | 0.92 |

Orden ≈ 0,9–1,1, coherente con un sesgo del centro de orden (anchura en x)² + (anchura en ξ)² ~ h^0,9.

## 6. Dos dimensiones (N = 400)

Rodeo: dato (0, 0.6436, π/2, π) en g1 — la y inicial es el punto de retorno de la misma órbita que recorre x, tan(arccos(2^−1/4)), la del post. Periodo del rayo 7.7707.

| caso | fenómeno | T | error máx. | lejos del borde | error medio |
|---|---|---|---|---|---|
| uniforme-baja | baja frecuencia: recta y reflexion de Snell | 5.00 | 8.3e-02 | 4.8e-03 | 8.7e-03 |
| g1-baja | baja frecuencia en g1: casi recta | 5.00 | 7.4e-02 | 9.4e-03 | 1.2e-02 |
| g1-rodeo | efecto rodeo: orbita cerrada | 15.54 | 2.3e-01 | 2.0e-01 | 6.1e-02 |
| uniforme-rodeo | mismo dato en malla uniforme: solo se mueve en x y rebota | 15.54 | 5.5e-02 | 2.1e-02 | 6.6e-03 |
| uniforme-(0,0,pi,pi) | atrapada | 5.00 | 3.1e-15 | 3.1e-15 | 1.2e-15 |
| g1-(0,0,pi,pi) | atrapada | 5.00 | 1.2e-14 | 1.2e-14 | 5.0e-15 |

La suma nodal de la densidad de energía coincide con la energía espectral a 1e-8 en todos los casos. En el rodeo (dos vueltas) el error crece con el tiempo: el paquete se **cizalla** a lo largo de la órbita porque cada componente de su espectro tiene un periodo algo distinto (se ve en `ondas-explicativa.png`, panel c). Su centro sigue al rayo y el error baja al refinar (sección 7).

## 7. Convergencia del rodeo (una vuelta)

| N | h | error medio | error máx. |
|---|---|---|---|
| 100 | 1.98e-02 | 5.9e-02 | 1.9e-01 |
| 200 | 9.95e-03 | 3.8e-02 | 1.2e-01 |
| 400 | 4.99e-03 | 2.2e-02 | 6.8e-02 |
| 800 | 2.50e-03 | 1.2e-02 | 3.8e-02 |
| 1600 | 1.25e-03 | 6.3e-03 | 2.1e-02 |

Orden 0.82 (medio), 0.81 (máximo).
