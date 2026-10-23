# Un invernadero por piezas

Un invernadero contado como piezas mecanísticas (cubierta, aire, cultivo, manta, suelo…)
conectadas por flujos de energía, vapor y CO₂: la idea de HORTISIM, la librería de modelado
de invernaderos que hice para el proyecto HortiMED (PRIMA, Universidad de Deusto), llevada al
navegador con un diagrama vivo en React Flow.

Las ecuaciones de cada pieza son las del modelo **GES** (Greenhouse Energy Simulation) de la
Energy Efficient Cities Initiative de la Universidad de Cambridge (EECi/GES, 2019, licencia MIT):
invernadero de una zona, sin calefacción y ventilado, con tomate (fotosíntesis y crecimiento
de Vanthoor, 2011; clima según el modelo de Gembloux). La calefacción es una pieza añadida
aquí. El núcleo `ges.js` conserva el original sin calefacción ni factores de estrés; el visor
lo amplía con reservas de agua mediante `agua.js`.

| Archivo | Qué hace |
|---|---|
| `python/ges.py <carpeta de GES>` | Traslación fiel a Python, comparada con la salida de referencia del original (reference.mat) |
| `app/src/modelo/ges.js` | El modelo en JavaScript (devuelve también los flujos de cada instante) |
| `app/src/modelo/integrador.js` | Rosenbrock de segundo orden (sistema rígido), paso de 60 s |
| `app/prueba/compara.mjs` | JavaScript frente a la solución precisa de Python |
| `python/zenodo_clima.py` | Tiempo de HortiMED (Zenodo) al formato del visor: hora solar, directa/difusa por cara (Erbs), cielo (Berdahl–Martin con nubosidad) |
| `app/prueba/experimento.mjs [ges]` | Dos semanas de invierno: sin calefacción, con calefacción y con CO₂ |
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

## Datos de tiempo

- `app/public/datos/tiempo-hortimed.json` (por defecto en el visor): tiempo exterior de las
  simulaciones de HortiMED, 15 feb – 9 ago 2018. Fuente: J. Oroya, *Climate and Crop variables
  of tomato greenhouse simulation*, Zenodo, 2022, [10.5281/zenodo.6697044](https://doi.org/10.5281/zenodo.6697044),
  CC-BY 4.0. Se usan solo temperatura, humedad, viento y radiación global; los últimos días
  (valores imposibles) se descartan. Latitud (43° N) e inclinación de los tejados (25°) supuestas.
  Para regenerarlo: `ds.csv` en `tmp/zenodo/` y
  `python python/zenodo_clima.py tmp/zenodo/ds.csv app/public/datos/tiempo-hortimed.json`.
- `app/public/datos/tiempo.json`: el tiempo de muestra de GES (`SampleWeather.csv`, MIT), con el
  que se hacen las comparaciones con el original.


## Riego, agua en las plantas y gasto en agua

El visor añade dos reservas en litros (1 L ≈ 1 kg): agua disponible en el sustrato y agua
contenida en las plantas. No son estados del GES original ni una validación agronómica.

- Sustrato: capacidad de drenaje 2000 L (8 L/m² de suelo); empieza al 70 %. Lo que supera la
  capacidad drena con una constante de una hora; puede estar transitoriamente por encima.
- Plantas: objetivo de 9 L/kg de carbohidrato de fruto, hoja y tallo, sobre 187,5 m² de cultivo.
  Es una aproximación didáctica de hidratación, no una medida ni una conversión calibrada a
  biomasa fresca. Las raíces reponen pérdidas y déficit en una hora si hay agua disponible.
- Bajo el 80 % de su objetivo, un factor lineal de hidratación reduce transpiración,
  fotosíntesis y crecimiento. Al secarse el sustrato se reducen absorción y evaporación.
  Los mismos flujos reducen el enfriamiento latente y la entrada de vapor al aire.
- Riego automático: mantiene el 70 % con caudal limitado (por defecto 4 L/m²/día).
  Dosis continua: distribuye la dosis elegida en 24 h. Apagado: permite explorar la sequía.
- Se integran con ROS2 seis contadores: riego, drenaje, transpiración, evaporación neta,
  agua retirada con la poda y absorción. El drenaje y la poda no se recuperan. La condensación
  sobre la manta entra como evaporación negativa; la de cubierta/suelo no se reutiliza.

El balance de las dos reservas cierra:

`W_s + W_p = W_inicial + riego − drenaje − transpiración − evaporación_neta − poda`.

La forma de separar balance, drenaje y estrés toma como referencia conceptual el
[capítulo 8 de FAO-56](https://www.fao.org/4/x0490e/x0490e0e.htm), pero esta ampliación no
implementa sus coeficientes de cultivo ni un modelo hidráulico de tejidos. Faltan salinidad,
nutrientes, potencial hídrico y calibración experimental. El gasto se expresa en L y L/m²,
sin tarifa monetaria ni electricidad de bombeo.

`npm run prueba:agua` desde `app/`: 30 días por modo; comprueba conservación (< 10⁻⁵ L),
reservas no negativas, estrés y menor crecimiento sin riego, dosis exacta y drenaje con exceso,
y equivalencia del núcleo GES en ausencia de estrés. `npm run prueba` mantiene la comparación
histórica del núcleo, que no valida las nuevas leyes hídricas.


## Simulador de campañas y comparación de políticas

La pestaña «Comparar campañas» abre el planificador (`?modo=campana`). La entrada por
defecto es «Sistema y flujos». La exploración se pausa mientras se comparan campañas;
cada comparación tiene sus propios estados.

- Tres políticas editables: calefacción día/noche y equipo, consigna de ventanas, CO₂ de
  06 a 20 h, modo de riego, dosis o máximo diario y horario de riego dentro del día.
- Fecha inicial y duración de 1 a 130 días, con clima histórico completo. Se rechazan
  periodos fuera de los datos; no se extrapola ni se recorta la campaña.
- Todas las políticas empiezan a las 00:00 del mismo día con `estadoInicial` idéntico.
  Los nuevos controles se evalúan cada minuto y se mantienen durante ese paso ROS2,
  incluidos los interruptores de CO₂ y riego en las fronteras horarias.
- `src/modelo/campana.js` integra las 29 variables del modelo hídrico más cuatro contadores
  de calor útil, gas, electricidad e inyección de CO₂. Las potencias y el caudal se integran
  con el mismo método que el estado físico. `recursos.js` comparte los supuestos de equipos.
- `src/campana.worker.js` ejecuta fuera del hilo de la interfaz, con progreso y cancelación
  por terminación del Worker. Un resultado conserva la copia de las entradas de su ejecución;
  al editarlas aparece un aviso para volver a calcular.
- Producción: incremento neto de CH₂O del fruto sobre 187,5 m² de cultivo; equivalente fresco
  = incremento / fracción elegida (6 % por defecto). No se confunde biomasa inicial con
  producción nueva. No hay cosecha comercial ni predicción de rendimiento validada.
- Indicadores: L, kWh y kg de CO₂, drenaje, coste de recursos y eficiencias por kg equivalente.
  Si no crece el fruto, las eficiencias se muestran como no definidas. Tarifas iniciales cero;
  los costes excluyen bombeo, iluminación, trabajo e inversión. Comparación gráfica y series
  diarias; exportación de métricas a CSV y configuración, estados y series a JSON.

`npm run prueba:campana` verifica 30 días de las tres políticas, dosis fija por ventana,
CO₂ durante 14 horas exactas por día, temperatura día/noche, calor y equipos, costes,
conversión de producción neta, estado inicial idéntico, determinismo y rechazo de entradas
inválidas. La regresión del GES y las pruebas hídricas se mantienen por separado.


## Presentación compacta del sistema

La entrada principal separa tres categorías: señales exteriores impuestas por el clima,
variables internas calculadas por los balances y controles editables. No hay campos para
editar directamente el estado. `ResumenSistema.jsx` muestra las transferencias principales,
seleccionables por energía, agua o CO₂: sus flechas invierten origen y destino si el flujo
cambia de signo. Los balances completos siguen en el detalle de piezas y ecuaciones.

La 3D ocupa 278 px de alto (200 en móvil), con encuadre más cercano y botones de zoom.
El calendario, el equipo de calefacción y la selección de clima/fecha se despliegan bajo
demanda. Las ecuaciones y series se montan al abrir «Ver piezas, ecuaciones y series»;
`?pieza=aire` o `?vista=piezas` abren directamente ese detalle. El iframe sigue ajustando su
altura al abrir/cerrar secciones y al cambiar de pestaña.


Los bloques exterior, estado y control se presentan como nodos de React Flow, con valores
y controles operativos dentro de cada nodo. Las aristas continuas indican influencia del
clima y de la actuación sobre los balances; la discontinua representa realimentación:
temperatura interior para calefacción y ventanas, agua disponible y demanda de las plantas
para el riego automático. La dosis fija y el CO₂ siguen consignas. Al pulsar una arista se
explica la dependencia. El grafo cambia de horizontal a vertical por debajo de 620 px;
los controles mantienen interacción nativa y las conexiones no se editan.


La topología de este grafo es estable: `useNodesState` y `onNodesChange` conservan las
medidas que calcula React Flow; los datos vivos se propagan por contexto sin reconstruir
los nodos en cada fotograma. El encuadre solo se recalcula al cargar o cambiar de tamaño.
Los campos numéricos mantienen un borrador local para poder borrar y escribir decimales
sin perder el foco; el rango se valida al salir del campo.

Regresión de interfaz, con la simulación en marcha: servir `app/dist` y ejecutar
`npm run prueba:interfaz -- http://127.0.0.1:4381/` desde `app/`. Requiere Playwright y
Chromium; si Playwright está instalado en otra herramienta, indicar su `node_modules`
mediante `NODE_PATH`. La prueba usa teclado, comprueba el efecto del riego y detecta
nodos retirados/ocultos, reencuadres continuos y pérdida de foco, también en móvil.


Los intercambios principales de materia y energía también son grafos de React Flow
(`FlujosGrafo.jsx`, con topología en `modelo/grafo-flujos.js`). Una punta identifica
aportes o procesos de sentido único; dos, un mecanismo que puede intercambiar en ambos
sentidos. La clasificación es física y no cambia al pasar por cero. Los caudales netos
se actualizan por contexto sin reconstruir nodos; al pulsar una conexión se indica su
nombre y sentido actual. En Carbono se separan reserva de azúcares, fruto, hojas y tallo, con sus flujos de crecimiento y respiración.
El balance detallado conserva todos los términos originales. La prueba
`node app/prueba/grafo-flujos.mjs` comprueba reversibilidad, signos, unidades y extremos.


## Actuadores, electricidad y carga

El visor distingue calor útil, gas y electricidad acumulada sin redondear los consumos
pequeños a cero. El equipo inicial del visor es un calefactor eléctrico resistivo ideal
(1 W eléctrico por W de calor); se pueden elegir también caldera y bomba de calor.
La casilla habilita el control proporcional: «Sin demanda» no es un fallo de carga.
Se muestran potencia instantánea, horas activas y transiciones de apagado a activo por
paso de un minuto. No se simula un relé con histéresis ni un ciclo de compresor real.
El dato opcional Wh/arranque añade electricidad a cada arranque; por defecto es cero.
Las ventanas pueden seguir la consigna térmica o una apertura manual de 0–100 %.

La pantalla es una ampliación didáctica exterior, puramente reflectante: al cubrir
el 100 % elimina un 80 % de radiación antes de alcanzar el invernadero. No cambia el
clima exterior ni introduce una emisión térmica propia. Manual fija la cobertura;
automático despliega linealmente de 250 a 450 W/m² (señal solar del modelo). La 3D
representa esa cobertura y las ventanas siguen el mismo estado que los balances.
No hay calibración de transmitancia, inercia mecánica o sellado térmico de la pantalla.

En el visor se puede indicar Wh por carrera completa de los motores de ventanas y de
pantalla: abrir/desplegar y cerrar/recoger cuestan lo mismo, en proporción al recorrido;
permanecer abierto no consume. Cero deja esos movimientos sin valorar. La electricidad
total incluye estos extras si se indican. Las campañas permiten sombreo y apertura manual,
pero su contabilidad energética sigue limitada al calor y sus equipos: los extras de
arranque y motores configurados en el visor no se aplican a las campañas.

Una descarga fallida de clima presenta mensaje y reintento; las peticiones antiguas se
cancelan al cambiar de clima. Una excepción de WebGL muestra un aviso en la 3D y conserva
el resto de la aplicación. Cambiar controles en pausa actualiza los flujos al instante.
`node app/prueba/actuadores.mjs` comprueba sombreo, ventanas, electricidad y recorridos.


La pestaña «Carbono» representa toda la cadena de CH₂O del modelo: CO₂ del aire → reserva
→ órganos, respiración a aire, poda y ventilación. Los flujos `carbono_*` están en kg C/s
antes de su conversión visual a kg C/h. La masa de cada órgano usa 187,5 m² de cultivo;
se muestran kg CH₂O y kg C, con C/CH₂O = 12/30. La inyección y ventilación de CO₂ se
convierten con 12/44. No se cambia la unidad del mando de inyección (kg CO₂/h) ni se
presenta el carbohidrato como masa fresca. La prueba `app/prueba/carbono.mjs` verifica
cada balance y la conservación conjunta aire–reserva–órganos a varias horas del día.
