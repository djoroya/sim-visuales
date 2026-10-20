// Las piezas del invernadero (nodos) — con dos disposiciones: ancha (pos) y estrecha, para
// móvil (posMovil, dos columnas de arriba abajo) y los flujos que las unen (aristas). Cada pieza es un
// balance mecanístico; cada flujo, un término que sale de una pieza y entra en otra. El signo
// del flujo (del modelo) dice el sentido: positivo, de «de» a «a».

const T_K = 273.15;
const grados = (v) => `${v.toFixed(1)} °C`;

export const PIEZAS = [
  { id: "sol", titulo: "Sol", tipo: "fuente", pos: [470, 0], posMovil: [0, 0],
    valor: (y, f) => `${(f.sol_exterior / 500).toFixed(0)} W/m²`,
    texto: "Radiación directa y difusa sobre las caras de la cubierta (datos horarios). Parte la absorbe el vidrio; el resto entra y lo reparten cultivo, manta y suelo según el índice de área foliar y la altura del sol.",
    ecuacion: "Q_sol = ½ Σ_caras A·(I_directa + I_difusa)   (visible + infrarrojo cercano)" },
  { id: "cielo", titulo: "Cielo", tipo: "fuente", pos: [860, 0], posMovil: [270, 0],
    valor: (y, f) => "", texto: "El cielo nocturno está frío: la cubierta le radia calor en el infrarrojo lejano. Es la principal pérdida en una noche despejada.",
    ecuacion: "Q_cubierta→cielo = ε σ A (T_c⁴ − T_cielo⁴)" },
  { id: "exterior", titulo: "Exterior", tipo: "fuente", pos: [0, 170], posMovil: [0, 150],
    valor: (y, f) => `${grados(f.T_ext)} · ${f.HR_ext.toFixed(0)} %`, texto: "Aire de fuera: temperatura, humedad, viento y 400 ppm de CO₂. Recibe lo que sale por las ventanas y por la convección de la cubierta.",
    ecuacion: "condiciones de contorno (datos horarios)" },
  { id: "cubierta", titulo: "Cubierta", tipo: "pieza", pos: [470, 170], posMovil: [270, 150],
    valor: (y) => grados(y[0] - T_K), texto: "El vidrio. Absorbe un 4 % del sol, recibe calor del aire y radiación de dentro, y lo pierde hacia fuera y hacia el cielo. Sobre ella condensa el vapor cuando está fría.",
    ecuacion: "A·c·dT_c/dt = Q_aire→c + Q_condensación + Q_sol − Q_c→ext − Q_c→cielo − Q_c→(cultivo, manta, suelo)" },
  { id: "ventanas", titulo: "Ventanas", tipo: "actuador", pos: [170, 350], posMovil: [0, 300],
    valor: (y, f) => `${f.renovaciones_h.toFixed(1)} renov./h`, texto: "Ventilación: rendijas siempre abiertas (viento y tiro térmico) y ventanas que se abren por encima de la consigna, hasta 30 renovaciones por hora. Se llevan calor, vapor y CO₂.",
    ecuacion: "R_a = R_rendijas + (R_máx − R_rendijas)·clip((T_i − T_consigna)/4, 0, 1)" },
  { id: "aire", titulo: "Aire interior", tipo: "pieza", pos: [470, 350], posMovil: [270, 300],
    valor: (y, f) => `${grados(y[1] - T_K)} · ${f.HR_int.toFixed(0)} % · ${f.CO2_ppm.toFixed(0)} ppm`,
    texto: "El aire del invernadero: tres balances a la vez, de energía (temperatura), de vapor (humedad) y de CO₂.",
    ecuacion: "ρcV·dT_i/dt = Q_cultivo + Q_manta + Q_bandeja − Q_cubierta − Q_suelo − Q_ventilación + Q_sol + Q_calefacción\nV·dC_w/dt = transpiración + evaporación − condensación − ventilación\nV·dC_CO₂/dt = respiración + inyección − fotosíntesis − ventilación" },
  { id: "cultivo", titulo: "Cultivo (tomate)", tipo: "pieza", pos: [840, 350], posMovil: [270, 450],
    valor: (y, f) => `${grados(y[2] - T_K)} · IAF ${f.LAI.toFixed(2)} · fruto ${(y[15] * 1000).toFixed(0)} g/m²`,
    texto: "Las hojas absorben sol, se calientan y «sudan»: la transpiración enfría la hoja y humedece el aire. La fotosíntesis toma CO₂ y llena una reserva de azúcares que se reparte entre fruto, hoja y tallo (Vanthoor).",
    ecuacion: "c·m·dT_v/dt = Q_sol − Q_convección − Q_radiación − Q_transpiración\ndC_reserva/dt = fotosíntesis − crecimiento − respiración\ndC_órgano/dt = crecimiento_órgano − respiración_órgano" },
  { id: "calefaccion", titulo: "Calefacción", tipo: "actuador", opcional: "calefaccion", pos: [170, 540], posMovil: [0, 450],
    valor: (y, f) => `${(f.calefaccion / 1000).toFixed(1)} kW`, texto: "Pieza añadida (el modelo original es de un invernadero sin calefacción): hasta 40 kW al aire, con un control proporcional en 1 °C por debajo de la consigna.",
    ecuacion: "Q_calef = P_máx · clip(T_consigna − T_i, 0, 1)" },
  { id: "inyeccion", titulo: "Inyección de CO₂", tipo: "actuador", opcional: "co2", pos: [700, 560], posMovil: [0, 600],
    valor: (y, f) => `${(f.co2_inyeccion * 3600).toFixed(1)} kg/h`, texto: "Enriquecimiento con CO₂ de 6 a 20 h (parámetro del modelo original, apagado por defecto). Más CO₂ en el aire, más fotosíntesis.",
    ecuacion: "M_CO₂ = (kg/h) / 3600 entre las 6 y las 20 h" },
  { id: "manta", titulo: "Manta y bandeja", tipo: "pieza", pos: [960, 540], posMovil: [270, 600],
    valor: (y) => grados(y[3] - T_K), texto: "El sustrato bajo las plantas (lana de roca húmeda) y la bandeja de plástico: absorben sol, evaporan agua y conducen calor hacia abajo.",
    ecuacion: "c_m·dT_m/dt = Q_sol − Q_convección − Q_evaporación − Q_radiación − Q_conducción(bandeja)" },
  { id: "suelo", titulo: "Suelo", tipo: "pieza", pos: [470, 560], posMovil: [0, 750],
    valor: (y) => grados(y[5] - T_K), texto: "El suelo del pasillo: recibe sol y calor del aire, y lo pasa por conducción a las capas de abajo. Es la inercia térmica del invernadero.",
    ecuacion: "ρ c l·dT_f/dt = Q_aire→suelo + Q_sol − Q_radiación − Q_conducción" },
  { id: "subsuelo", titulo: "Subsuelo (4 capas)", tipo: "pieza", pos: [470, 740], posMovil: [0, 900],
    valor: (y) => `${grados(y[6] - T_K)} … ${grados(y[9] - T_K)}`, texto: "Cuatro capas de tierra hasta un fondo a 14 °C: conducción pura, lenta. Guarda el calor de los días y lo devuelve por la noche.",
    ecuacion: "ρ c l·dT_k/dt = Q_conducción(k−1 → k) − Q_conducción(k → k+1)" },
];

// flujos: tipo (energía, vapor, co2), de, a, clave en los flujos del modelo, factor a unidades de muestra
export const FLUJOS = [
  { id: "sol-cub", tipo: "energia", de: "sol", a: "cubierta", clave: "sol_cubierta", nombre: "sol absorbido por el vidrio" },
  { id: "sol-cul", tipo: "energia", de: "sol", a: "cultivo", clave: "sol_vegetacion", nombre: "sol en las hojas" },
  // estos dos no se dibujan (cruzarían por encima de la cubierta y del aire), pero salen en el panel
  { id: "sol-man", tipo: "energia", de: "sol", a: "manta", clave: "sol_manta", nombre: "sol en la manta", oculto: true },
  { id: "sol-sue", tipo: "energia", de: "sol", a: "suelo", clave: "sol_suelo", nombre: "sol en el suelo", oculto: true },
  { id: "cub-ext", tipo: "energia", de: "cubierta", a: "exterior", clave: "cubierta_exterior", nombre: "convección al exterior" },
  { id: "cub-cie", tipo: "energia", de: "cubierta", a: "cielo", clave: "cubierta_cielo", nombre: "radiación al cielo" },
  { id: "air-cub", tipo: "energia", de: "aire", a: "cubierta", clave: "aire_cubierta", nombre: "convección y condensación" },
  { id: "cul-air", tipo: "energia", de: "cultivo", a: "aire", clave: "vegetacion_aire", nombre: "convección de las hojas" },
  { id: "cul-cub", tipo: "energia", de: "cultivo", a: "cubierta", clave: "vegetacion_cubierta", nombre: "radiación de las hojas" },
  { id: "man-air", tipo: "energia", de: "manta", a: "aire", clave: "manta_aire", nombre: "convección de la manta" },
  { id: "air-sue", tipo: "energia", de: "aire", a: "suelo", clave: "aire_suelo", nombre: "convección al suelo" },
  { id: "sue-sub", tipo: "energia", de: "suelo", a: "subsuelo", clave: "suelo_subsuelo", nombre: "conducción" },
  { id: "air-ven", tipo: "energia", de: "aire", a: "ventanas", clave: "ventilacion", nombre: "calor por ventilación" },
  { id: "ven-ext", tipo: "energia", de: "ventanas", a: "exterior", clave: "ventilacion", nombre: "calor por ventilación" },
  { id: "cal-air", tipo: "energia", de: "calefaccion", a: "aire", clave: "calefaccion", nombre: "calefacción", opcional: "calefaccion" },
  { id: "cul-air-v", tipo: "vapor", de: "cultivo", a: "aire", clave: "vapor_transpiracion", nombre: "transpiración" },
  { id: "air-cub-v", tipo: "vapor", de: "aire", a: "cubierta", clave: "vapor_condensacion", nombre: "condensación" },
  { id: "air-ven-v", tipo: "vapor", de: "aire", a: "ventanas", clave: "vapor_ventilacion", nombre: "vapor por ventilación" },
  { id: "ven-ext-v", tipo: "vapor", de: "ventanas", a: "exterior", clave: "vapor_ventilacion", nombre: "vapor por ventilación" },
  { id: "air-cul-c", tipo: "co2", de: "aire", a: "cultivo", clave: "co2_fotosintesis", nombre: "fotosíntesis" },
  { id: "cul-air-c", tipo: "co2", de: "cultivo", a: "aire", clave: "co2_respiracion", nombre: "respiración" },
  { id: "air-ven-c", tipo: "co2", de: "aire", a: "ventanas", clave: "co2_ventilacion", nombre: "CO₂ por ventilación" },
  { id: "ven-ext-c", tipo: "co2", de: "ventanas", a: "exterior", clave: "co2_ventilacion", nombre: "CO₂ por ventilación" },
  { id: "iny-air-c", tipo: "co2", de: "inyeccion", a: "aire", clave: "co2_inyeccion", nombre: "inyección", opcional: "co2" },
];

export const TIPOS = {
  energia: { color: "#f59e0b", nombre: "energía", formato: (v) => `${(v / 1000).toFixed(1)} kW`, escala: 2000 },
  vapor: { color: "#4f9be8", nombre: "vapor", formato: (v) => `${(v * 3600).toFixed(1)} kg/h`, escala: 1 / 3600 },
  co2: { color: "#3fb27f", nombre: "CO₂", formato: (v) => `${(v * 3600 * 1000).toFixed(0)} g/h`, escala: 0.05 / 3600 },
};
