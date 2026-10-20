# Un invernadero por piezas

Un invernadero contado como piezas mecanísticas (cubierta, aire, cultivo, manta, suelo…)
conectadas por flujos de energía, vapor y CO₂: la idea de HORTISIM, la librería de modelado
de invernaderos que hice para el proyecto HortiMED (PRIMA, Universidad de Deusto), llevada al
navegador con un diagrama vivo en React Flow.

Las ecuaciones de cada pieza son las del modelo **GES** (Greenhouse Energy Simulation) de la
Energy Efficient Cities Initiative de la Universidad de Cambridge (EECi/GES, 2019, licencia MIT):
invernadero de una zona, sin calefacción y ventilado, con tomate (fotosíntesis y crecimiento
de Vanthoor, 2011; clima según el modelo de Gembloux). La calefacción es una pieza añadida
aquí; con ella apagada, el modelo es el original.

| Archivo | Qué hace |
|---|---|
| `python/ges.py <carpeta de GES>` | Traslación fiel a Python, comparada con la salida de referencia del original (reference.mat) |
| `app/src/modelo/ges.js` | El modelo en JavaScript (devuelve también los flujos de cada instante) |
| `app/src/modelo/integrador.js` | Rosenbrock de segundo orden (sistema rígido), paso de 60 s |
| `app/prueba/compara.mjs` | JavaScript frente a la solución precisa de Python |
| `app/` | El visor (React + Vite + React Flow): `npm install && npm run build` |

Comprobaciones:

- Python frente a la referencia del original (30 días): temperaturas 0,013 K de media,
  0,33 K como máximo; del mismo orden que el efecto de la tolerancia del integrador original.
- JavaScript frente a Python preciso (10 días): temperaturas 0,007 K de media, 0,09 K como
  máximo; 57 ms por día simulado.
- Clima: la tabla por minutos del original es la interpolación lineal de la horaria
  (diferencia 5·10⁻¹⁰), así que el navegador solo carga la horaria (1,2 MB, todo el año).

Para reproducir la comparación con el original: `gh repo clone EECi/GES tmp/ges` y
`python python/ges.py tmp/ges`.
