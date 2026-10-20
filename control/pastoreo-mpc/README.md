# Pastoreo con MPC en tiempo real (en el navegador)

Tercera parte del pastoreo (ver [`../pastoreo-optimo`](../pastoreo-optimo)): tres perros
controlados por **control predictivo (MPC)** que cada 2,5 unidades de tiempo resuelven un
problema de control óptimo corto y deciden, en ~200 ms, **en el navegador**. Se les puede
cambiar la orden a mitad de camino haciendo clic, con corrales y puertas.

- `python/modelo_mpc.py`: el coste del MPC (CasADi), con el rebaño reducido a 10
  «superovejas» y todo lo que depende del escenario como parámetro (paredes, mapa de
  distancias, roles de los perros, pesos).
- `wasm/build.sh`: CasADi → C → librería nativa (para Python) y **WebAssembly** (para la web).
- `web/`: el visor. `js/planta.js` (las 80 ovejas), `js/mapa.js` (mapa de distancias
  rodeando paredes), `js/controlador.js` (agrupamiento, reparto de tareas entre perros,
  resolvedor SPG), `js/rutas.js` (planificador de rutas de los perros), `js/motor.js`
  (el bucle), `js/trabajador.js` (Web Worker), `js/app.js` (la página).
- `python/valida.py`: la referencia en Python (planta y controlador hasta la coordinación por
  grupos) con el mismo coste compilado.

## Cómo se comprueba

```bash
./wasm/build.sh
TRAZA=4 ../../.venv/bin/python python/valida.py 1 puerta_arriba 30   # traza de referencia en tmp/
node web/prueba/compara.mjs tmp/traza_puerta_arriba_1.json            # JS frente a Python, pieza a pieza
node web/prueba/lazo.mjs tmp/traza_<esc>_<s>.json                     # meter el rebaño en lazo cerrado
node web/prueba/salida.mjs <semilla> izquierda                         # sacarlo del corral
cd web && python3 -m http.server 8811                                  # el visor
```

- JavaScript frente a Python: mapa idéntico, planta a 1e-14, decisión del resolvedor a 1e-13.
- SPG (resolvedor propio) frente a IPOPT en el mismo problema: igual casi siempre, peor caso +6 %.
- Meter el rebaño (3 corrales × 4 semillas): 12/12. Sacarlo (2 corrales × 6 semillas): sale
  el 84 % en t = 700.

Explicado en el artículo «Perros que obedecen: control predictivo en tiempo real en el
navegador» de djoroya.com.
