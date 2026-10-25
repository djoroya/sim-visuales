// Una hoja de termobimetal en el tejado del invernadero: su temperatura y cuánto abre.
//
// La hoja tapa un hueco del tejado, empotrada por un lado. Está plana (cerrada) a la temperatura de
// cierre T_c; por debajo se apoya en el marco y sigue cerrada; por encima se curva en arco y levanta
// la punta. El aire sale por el hueco que deja la punta: apertura = z_punta / L (en una fila de hojas
// iguales, los lados no abren porque las vecinas suben a la vez).
//
// Temperatura de la hoja (chapa fina: ρ c s ≈ 700 J/(m² K), unos 30 s de constante de tiempo, así que
// se toma su estado estacionario minuto a minuto). Cara de arriba al cielo y al aire de fuera; cara de
// abajo al aire de dentro:
//   α G + ε σ F (T_cielo⁴ − T⁴) + h_e (T_e − T) + h_i (T_i − T) + ε σ (T_i⁴ − T⁴) = 0
// con h_e = 5,7 + 3,8 u (McAdams) y h_i = 4 W/(m² K). «A la sombra»: bajo una tapa opaca que está a
// la temperatura del aire de fuera (G = 0 y el cielo se sustituye por la tapa).
import fs from "node:fs";
const SIGMA = 5.67e-8;

// Factor de la curvatura real (CalculiX, hoja de 150 × 50 × 0,2 mm) sobre la de una tira estrecha:
// ~1 al principio (la hoja se comba como un casquete) y ~1,2 desde unos 5 K (se curva como un cilindro).
// El cambio de forma depende de ΔT·(b/s)²: para otro espesor se reescala ΔT. La tabla de 0,4 mm
// (datos/hoja-termica-0.4.json) lo confirma con un 1 % de diferencia (prueba: js/prueba.mjs).
const TERMICA = JSON.parse(fs.readFileSync(new URL("../datos/hoja-termica-0.2.json", import.meta.url)));
export function factorCalculix(dT, s = TERMICA.s * 1e-3) {
  const x = dT * (TERMICA.s * 1e-3 / s) ** 2;
  const f = [{ dT: 0, factor: 1 }, ...TERMICA.filas];
  if (x >= f[f.length - 1].dT) return f[f.length - 1].factor;
  let i = 0;
  while (f[i + 1].dT < x) i++;
  const u = (x - f[i].dT) / (f[i + 1].dT - f[i].dT);
  return f[i].factor + u * (f[i + 1].factor - f[i].factor);
}

export const HOJA = {
  k: 43e-6,          // 1/K, curvatura específica (Kanthal 230)
  s: 0.4e-3,         // m, espesor (0,4 mm: el viento la mueve poco; ver experimento)
  L: 0.15,           // m, largo
  T_c: 18,           // °C, temperatura a la que está plana
  alfa: 0.1,         // absortancia solar de la cara de arriba (pintura blanca ≈ 0,25; negra ≈ 0,9)
  eps: 0.9,          // emisividad (pintada)
  h_i: 4,            // W/(m² K)
  sombra: false,     // bajo una tapa opaca
  cara: 3,           // cara de GES donde va: 3 tejado SE, 7 tejado NW
  vientoAbre: true,  // sin tope: la succión del viento también la levanta
  factorAncho: factorCalculix,   // curvatura real / fórmula de tira estrecha
};

/** Temperatura de la hoja (°C). c: fila de clima de GES; T_i en °C. */
export function temperaturaHoja(h, c, T_i) {
  const T_e = c[0] + 273.15, T_sk = c[1] + 273.15, u = c[2], Ti = T_i + 273.15;
  const G = h.sombra ? 0 : c[4 + h.cara] + c[12 + h.cara];
  const Tarriba = h.sombra ? T_e : T_sk, F = h.sombra ? 1 : (1 + Math.cos((25 * Math.PI) / 180)) / 2;
  const h_e = 5.7 + 3.8 * u;
  let T = (T_e + Ti) / 2;
  for (let it = 0; it < 30; it++) {
    const q = h.alfa * G + h.eps * SIGMA * F * (Tarriba ** 4 - T ** 4) + h_e * (T_e - T) + h.h_i * (Ti - T) + h.eps * SIGMA * (Ti ** 4 - T ** 4);
    const dq = -4 * h.eps * SIGMA * F * T ** 3 - h_e - h.h_i - 4 * h.eps * SIGMA * T ** 3;
    const d = q / dq; T -= d;
    if (Math.abs(d) < 1e-6) break;
  }
  return T - 273.15;
}

/** Fracción abierta de la hoja (0–~0,6) a la temperatura T (°C). */
export function aperturaHoja(h, T, viento = 0) {
  const dT = T - h.T_c;
  let z = 0;
  if (dT > 0) {
    const kappa = (h.factorAncho(dT, h.s) * h.k * dT) / h.s;      // 1/m
    const giro = Math.min(kappa * h.L, Math.PI / 2);           // tope: la hoja vertical
    z = (1 - Math.cos(giro)) / giro;                           // z_punta / L para un arco de giro dado
  }
  return Math.min(2 / Math.PI, z + levantaViento(h, viento));
}

/** Lo que levanta la succión del viento a una hoja sin tope, en fracción de L: placa empotrada con
 *  carga uniforme q = ½ ρ u² (Cp = 1), δ = q L⁴ / (8 D); CalculiX da lo mismo (24,7 mm a 8 m/s). */
export function levantaViento(h, u) {
  if (!h.vientoAbre || u <= 0) return 0;
  const E = 135e9, nu = 0.3, D = (E * h.s ** 3) / (12 * (1 - nu ** 2)), q = 0.5 * 1.2 * u * u;
  return (q * h.L ** 3) / (8 * D);
}
