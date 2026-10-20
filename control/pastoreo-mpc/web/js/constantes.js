// Constantes compartidas. Tienen que coincidir con python/modelo_mpc.py (el coste
// compilado) y python/valida.py (la planta y el controlador de referencia).

export const M = 10;          // superovejas del modelo interno
export const NP = 3;          // perros
export const N_H = 20;        // intervalos del horizonte
export const DT = 2.5;        // un intervalo de control
export const NU = 2 * NP * N_H;
export const NZ = 4 * (M + NP);
export const NSEG = 10;       // paredes (ovejas y perros) que admite el coste
export const NSEGP = 2;       // verjas que solo ven los perros
export const W_DET_NORMAL = 0.3;   // peso habitual de la guía de cada perro (parámetro del coste)

// planta
export const NU_O = 0.45, NU_P = 5.0, R_OO = 30.0, C_NUC = 0.5, D_NUC = 3.0;
export const F_M = 5.0, SIGMA = 50.0, V_MAX_O = 2.0, V_MAX_P = 2.8;
export const A_MAX = V_MAX_P * NU_P;
export const F_SAT = 2 * NU_O * V_MAX_O;
export const F_W = 20.0, L_W = 3.0, F_W_P = 4 * A_MAX;
export const SUBPASOS_PLANTA = 40;

// rejilla del mapa de distancias (la misma que GX, GY del coste)
export const PASO_G = 6.0;
export const GX = rango(-300, 300, PASO_G);
export const GY = rango(-220, 220, PASO_G);

// campo y valla
export const VALLA = [[-290, -210, 290, -210], [290, -210, 290, 210], [290, 210, -290, 210], [-290, 210, -290, -210]];

function rango(a, b, p) {
  // como np.arange(a, b + 1e-9, p)
  const n = Math.floor((b - a) / p + 1e-9) + 1;
  return Float64Array.from({ length: n }, (_, i) => a + i * p);
}
