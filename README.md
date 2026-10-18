# sim-visuales

Simulaciones propias, reproducibles, convertidas en animaciones para djoroya.com.

Cada simulación: entrada + script de ejecución + validación frente a una referencia + render a vídeo en bucle.

Proyecto personal de Jesús Oroya, hecho en tiempo y con recursos propios. Sin código, datos ni casos de terceros.

## Qué hay

| | |
|---|---|
| [`md/nanohilo-cu`](md/nanohilo-cu) | Ensayo de tracción de un nanohilo de cobre [100] hasta la rotura, con LAMMPS y el potencial EAM de Mishin et al. (2001). Validación del potencial, simulación y exportación de la trayectoria |
| [`visor`](visor) | Visor WebGL (three.js) que dibuja esa trayectoria en vivo en el navegador, sobre fondo transparente |
| [`particulas/pastoreo`](particulas/pastoreo) | Un perro guía un rebaño de 30 ovejas solo por repulsión: dinámica de partículas en 2D con LAMMPS, con su visor en canvas (45 KiB en total) |
| [`md/grieta-2d`](md/grieta-2d) | Una grieta atravesando un cristal 2D de Lennard-Jones, coloreada por tensión. Constantes elásticas exactas frente a la fórmula de Born y velocidad de la punta frente a la de Rayleigh |
| [`control/pastoreo-optimo`](control/pastoreo-optimo) | El mismo pastoreo, ahora como problema de control óptimo: tres perros, 200 ovejas y la trayectoria que sale de minimizar un coste con CasADi e IPOPT, al lado de la heurística. En la segunda parte, el rebaño empieza desparramado en una banda curva y con los perros dentro: la heurística no lo mueve y el óptimo lo reúne y lo conduce |

La animación no es un vídeo: el navegador la dibuja a partir de un binario de
80 fotogramas y 5780 átomos que pesa 793 KiB comprimido.

```bash
cd md/nanohilo-cu && ./run.sh     # validación + simulación + salidas
cd visor && npm install && npm run dev
```
