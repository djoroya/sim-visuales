import { cierreSombreo, aperturaVentanas } from './control-actuadores.js';
// Modelo mecanístico de un invernadero de una zona, sin calefacción y ventilado, con tomate.
// Traslación a JavaScript de GES (EECi/GES, Energy Efficient Cities Initiative, Universidad de
// Cambridge, 2019, licencia MIT), comprobada contra la traslación fiel a Python (python/ges.py),
// que a su vez reproduce la salida de referencia del original en MATLAB.
//
// Estado (21): temperaturas de cubierta, aire, vegetación, manta, bandeja, suelo y 4 capas
// de subsuelo; media de 24 h y suma térmica de la vegetación; vapor y CO₂ del aire; carbono
// del cultivo (reserva, fruto, hoja, tallo) y sus tasas relativas de crecimiento.

export const NOMBRES = ["T_c", "T_i", "T_v", "T_m", "T_p", "T_f", "T_s1", "T_s2", "T_s3", "T_s4", "T_vmean", "T_vsum",
  "C_w", "C_c", "C_buf", "C_fruit", "C_leaf", "C_stem", "R_fruit", "R_leaf", "R_stem"];

const sigm = 5.67e-8, T_k = 273.15, g = 9.81, atm = 1.013e5, N_A = 6.02214e23, M_a = 0.029, lam = 0.025, c_i = 1003.2;
const H_fg = 2437000, Le = 0.819, R = 8.314, M_w = 0.018, M_c = 0.044, M_carb = 0.03, nu = 15.1e-6;
const A_f = 250, V = 1000, SurfaceArea = [40, 0, 75, 135, 40, 0, 75, 135], A_c = 500, a_obs = 0.05, H = 5;
const int_air_speed = 0.5;
const eps_ce = 0.85, eps_ci = 0.85, rho_ci = 0.15, alph_c = 0.04, tau_c_NIR = 0.85, tau_c_VIS = 0.85, d_c = 1.5, cd_c = 8736;
const lam_s = [1.7, 0.85, 0.85, 0.85, 0.85], c_s = [880, 1081, 1081, 1081, 1081], l_s = [0.02, 0.05, 0.1, 0.25, 1.0];
const rhod_s = [2300, 1500, 1600, 1600, 1600], rho_s = 0.85, eps_s = 0.95, alphS_s = 0.5, d_f = 0.5, T_ss = 14.0 + T_k;
const c_v = 4180, rho_v = 0.22, eps_v = 0.95, d_v = 0.1, p_v = 0.75, msd_v = 1.326;
const A_p = p_v * A_f, A_v = A_p, A_m = A_p, d_p = 1, d_m = 0.1, lam_p = 0.2, c_m = 45050, c_p = 10020, l_m = 0.03;
const rho_m = 0.05, rho_p = 0.05, eps_m = 0.95, eps_p = 0.95;
const c_Gamma = 1.7e-6, J_max_25 = 210e-6, alph = 0.385, C_buf_max = 0.02, theta = 0.7, S = 710, HH = 22e4, E_j = 37e3;
const heat_phot = 3.6368e-19, eta = 0.67, s_airbuf_buf = 5e2, s_buforg_buf = -5e3;
const s_min_T = -0.869, s_max_T = 0.5793, s_min_T24 = -1.1587, s_max_T24 = 1.3904;
const SLA = 26.6, LAI_max = 5, Q_10 = 2, rg_fruit = 0.328e-6, rg_leaf = 0.095e-6, rg_stem = 0.074e-6;
const c_fruit_g = 0.27, c_fruit_m = 1.16e-7, c_leaf_g = 0.28, c_leaf_m = 3.47e-7, c_stem_g = 0.3, c_stem_m = 1.47e-7;
const c_RGR = 2.85e6, T_min_v24 = 12, T_max_v24 = 27, T_min_v = 6, T_max_v = 40, T_sum_end = 1035;
const c_terr = 0.35, a_terr = 0.25, Cp = 0.62, Cd = 0.61, crack_length = 1, crack_area = 0.001, crack_length_total = 350;
const latitude = 53.193583;

/**
 * Parámetros que se pueden cambiar desde fuera (los del original por defecto). La calefacción
 * NO está en GES (es un invernadero sin calefacción): es una pieza añadida aquí, una potencia
 * al aire con un control proporcional (banda de 1 K bajo la consigna). Apagada, el modelo es
 * exactamente el original. La inyección de CO₂ sí es del original (added_CO2, kg/h de 6 a 20 h).
 */
export const AJUSTES = { T_sp_vent: 25 + T_k, R_a_max: 30 / 3600, added_CO2: 0, calefaccion: false, T_sp_calef: 16 + T_k, P_calef: 40000 };

const sat_conc = (T) => { const t = T - 273.15; return Math.exp(11.56 - 4030 / (t + 235)) * (-0.0046 * t + 1.2978); };
function lamorturb(Gr, Re) {
  const NuG = Gr < 1e5 ? 0.5 * Gr ** 0.25 : 0.13 * Gr ** 0.33;
  const NuR = Re < 2e4 ? 0.6 * Re ** 0.5 : 0.032 * Re ** 0.8;
  const Nu = NuG > NuR ? NuG : NuR;
  return [Nu, NuG > NuR ? Nu * Le ** 0.25 : Nu * Le ** 0.33];
}
const rad = Math.PI / 180, sind = (x) => Math.sin(x * rad), cosd = (x) => Math.cos(x * rad);

/**
 * Clima a partir de la tabla horaria (como el original: interpolación lineal a filas de un
 * minuto y se toma la fila ceil(t/60), sin interpolar dentro del minuto).
 */
export function creaClima(tiempo) {
  // t0: segundos desde el 1 de enero en que empieza la tabla (0 en la de GES)
  const h = tiempo.horas, nh = h.length, filas = tiempo.filasMinuto, paso = (nh - 1) / (filas - 1), t0 = tiempo.t0 || 0;
  const fila = new Float64Array(20);
  const clima = (t) => {
    const n = Math.max(Math.ceil((t - t0) / 60), 1), x = Math.min((n - 1) * paso, nh - 1), i = Math.min(Math.floor(x), nh - 2), f = x - i;
    for (let c = 0; c < 20; c++) { const v = h[i][c] + f * (h[i + 1][c] - h[i][c]); fila[c] = c >= 2 ? Math.max(v, 0) : v; }
    return fila;
  };
  clima.fin = t0 + (nh - 1) * 3600;                // último instante con datos
  return clima;
}

/** Lo que gastan los actuadores en el instante t: calor de la calefacción (W) e inyección de CO₂ (kg/s). */
export function actuadores(t, y, aj = AJUSTES) {
  const Q_calef = aj.calefaccion ? aj.P_calef * Math.min(Math.max(aj.T_sp_calef - y[1], 0), 1) : 0;
  const hora = Math.floor(t / 3600) + 1, hd = (hora / 24 - Math.floor(hora / 24)) * 24;
  const h = ((t / 3600) % 24 + 24) % 24;
  const co2Activo = aj.horarioCO2 ? h >= aj.horarioCO2[0] && h < aj.horarioCO2[1] : hd > 6 && hd < 20;
  return [Q_calef, co2Activo ? aj.added_CO2 / 3600 : 0];
}

export function estadoInicial(clima, t0 = 0) {
  const c = clima(t0), T0 = c[0] + T_k;
  return Float64Array.from([20 + T_k, 12 + T_k, 12 + T_k, 12 + T_k, 12 + T_k, 12 + T_k, 12 + T_k, 12 + T_k, 12 + T_k, 11 + T_k, 12 + T_k, 0,
    (c[3] / 100) * sat_conc(T0), (4e-4 * M_c * atm) / (R * T0), 0.01, 0.001, 0.01, 0.01, 0, 0, 0]);
}

/** Derivadas del estado y (opcional) los flujos que las forman, para el diagrama. */
export function derivadas(t, y, clima, aj = AJUSTES, flujos = null) {
  const day = Math.ceil(t / 86400);
  const [T_c, T_i, T_v, T_m, T_p, T_f, T_s1, T_s2, T_s3, T_s4, T_vmean, T_vsum, C_w, C_c, C_buf, C_fruit, C_leaf, C_stem, R_fruit, R_leaf, R_stem] = y;
  const cl = clima(t);
  const T_e = cl[0] + T_k, T_sk = cl[1] + T_k, wind_speed = cl[2], rel_humid = cl[3] / 100;
  const C_we = rel_humid * sat_conc(T_e);
  const p_w = (C_w * R * T_i) / M_w, rho_i = ((atm - p_w) * M_a + p_w * M_w) / (R * T_i);
  const LAI = SLA * C_leaf, C_ce = (4.0e-4 * M_c * atm) / (R * T_e), C_c_ppm = ((C_c * R * T_i) / (M_c * atm)) * 1e6;

  // convección (y condensación en cubierta y suelo; evaporación desde la manta)
  let Nu, Sh;
  [Nu] = lamorturb(((g * d_c ** 3) / (T_e * nu ** 2)) * Math.abs(T_c - T_e), (wind_speed * d_c) / nu);
  const QV_c_e = (A_c * Nu * lam * (T_c - T_e)) / d_c;
  [Nu, Sh] = lamorturb(((g * d_c ** 3) / (T_i * nu ** 2)) * Math.abs(T_i - T_c), (int_air_speed * d_c) / nu);
  const QV_i_c = (A_c * Nu * lam * (T_i - T_c)) / d_c;
  const QP_i_c = Math.max(((((A_c * H_fg) / (rho_i * c_i)) * Sh) / Le) * (lam / d_c) * (C_w - sat_conc(T_c)), 0);
  [Nu, Sh] = lamorturb(((g * d_f ** 3) / (T_i * nu ** 2)) * Math.abs(T_i - T_f), (int_air_speed * d_f) / nu);
  const QV_i_f = (A_f * Nu * lam * (T_i - T_f)) / d_f;
  const QP_i_f = Math.max(((((A_f * H_fg) / (rho_i * c_i)) * Sh) / Le) * (lam / d_f) * (C_w - sat_conc(T_f)), 0);
  [Nu, Sh] = lamorturb(((g * d_m ** 3) / (T_i * nu ** 2)) * Math.abs(T_m - T_i), (int_air_speed * d_m) / nu);
  const QV_m_i = (0.75 * A_m * Nu * lam * (T_m - T_i)) / d_m;
  const QP_m_pot = ((((0.25 * A_m * H_fg) / (rho_i * c_i)) * Sh) / Le) * (lam / d_m) * (sat_conc(T_m) - C_w);
  // Factores opcionales de la ampliación hídrica; sin ellos se conserva el GES original.
  const QP_m_i = QP_m_pot * (QP_m_pot > 0 ? (aj.factorEvaporacion ?? 1) : 1);
  [Nu] = lamorturb(((g * d_p ** 3) / (T_i * nu ** 2)) * Math.abs(T_p - T_i), (int_air_speed * d_p) / nu);
  const QV_p_i = (A_p * Nu * lam * (T_p - T_i)) / d_p, QP_p_i = 0;
  [Nu] = lamorturb(((g * d_v ** 3) / (T_i * nu ** 2)) * Math.abs(T_v - T_i), (int_air_speed * d_v) / nu);
  const QV_v_i = (LAI * A_v * Nu * lam * (T_v - T_i)) / d_v, HV = (Nu * lam) / d_v;

  // onda larga
  const A_vvf = Math.min(LAI * p_v * A_f, p_v * A_f), A_c_roof = 271;
  const F_f_c = 1 - p_v, F_f_p = p_v, F_c_f = (A_f / A_c_roof) * F_f_c;
  const F_c_v = Math.min((1 - F_c_f) * LAI, 1 - F_c_f), F_c_m = Math.max((1 - F_c_f) * (1 - LAI), 0);
  const F_v_c = 0.5, F_v_m = 0.5, F_m_c = Math.max(1 - LAI, 0), F_m_v = 1 - F_m_c, F_p_f = 1;
  const k2 = (e1, e2, r1, r2, F1, F2) => (e1 * e2) / (1 - r1 * r2 * F1 * F2);
  const QR_c_sk = eps_ce * sigm * A_c * (T_c ** 4 - T_sk ** 4);
  const QR_c_v = k2(eps_ci, eps_v, rho_ci, rho_v, F_c_v, F_v_c) * sigm * A_c_roof * F_c_v * (T_c ** 4 - T_v ** 4);
  const QR_c_m = k2(eps_ci, eps_m, rho_ci, rho_m, F_c_m, F_m_c) * sigm * A_c_roof * F_c_m * (T_c ** 4 - T_m ** 4);
  const QR_c_f = k2(eps_ci, eps_s, rho_ci, rho_s, F_c_f, F_f_c) * sigm * A_c_roof * F_c_f * (T_c ** 4 - T_f ** 4);
  const QR_v_c = k2(eps_v, eps_ci, rho_v, rho_ci, F_v_c, F_c_v) * sigm * A_vvf * 2 * F_v_c * (T_v ** 4 - T_c ** 4);
  const QR_v_m = k2(eps_v, eps_m, rho_v, rho_m, F_v_m, F_m_v) * sigm * A_vvf * 2 * F_v_m * (T_v ** 4 - T_m ** 4);
  const QR_v_p = 0;
  const QR_m_c = k2(eps_m, eps_ci, rho_m, rho_ci, F_m_c, F_c_m) * sigm * A_m * F_m_c * (T_m ** 4 - T_c ** 4);
  const QR_m_v = k2(eps_m, eps_v, rho_m, rho_v, F_m_v, F_v_m) * sigm * A_m * F_m_v * (T_m ** 4 - T_v ** 4);
  const QR_m_p = 0, QR_p_v = 0, QR_p_m = 0;
  const QR_p_f = k2(eps_p, eps_s, rho_p, rho_s, F_p_f, F_f_p) * sigm * A_p * F_p_f * (T_p ** 4 - T_f ** 4);
  const QR_f_c = k2(eps_s, eps_ci, rho_s, rho_ci, F_c_f, F_f_c) * sigm * A_f * F_f_c * (T_f ** 4 - T_c ** 4);
  const QR_f_p = k2(eps_s, eps_p, rho_s, rho_p, F_f_p, F_p_f) * sigm * A_f * F_f_p * (T_f ** 4 - T_p ** 4);

  // radiación solar
  const gamma = (360 * (day - 80)) / 365;
  const eqn_time = -7.13 * cosd(gamma) - 1.84 * sind(gamma) - 0.69 * cosd(2 * gamma) + 9.92 * sind(2 * gamma);
  const az = (360 * (((t / 3600) % 24) + eqn_time / 60 - 12)) / 24;
  const delta = 0.38 - 0.77 * cosd(gamma) + 23.27 * cosd(gamma);
  const lat = aj.latitud ?? latitude;
  const angle = Math.asin(sind(lat) * sind(delta) + cosd(lat) * cosd(delta) * cosd(az)) / rad;
  let direct = 0, diffuse = 0;
  for (let k = 0; k < 8; k++) { direct += 0.5 * SurfaceArea[k] * cl[4 + k]; diffuse += 0.5 * SurfaceArea[k] * cl[12 + k]; }
  const solExterior = direct + diffuse;
  const cierrePantalla = cierreSombreo(aj, solExterior / 500);
  const factorPantalla = 1 - 0.8 * cierrePantalla;
  direct *= factorPantalla; diffuse *= factorPantalla;
  const QS_int_rNIR = tau_c_NIR * direct, QS_int_rVIS = tau_c_VIS * direct, QS_int_fNIR = tau_c_NIR * diffuse, QS_int_fVIS = tau_c_VIS * diffuse;
  const QS_c = alph_c * 2 * (direct + diffuse);
  const QS_i = a_obs * (QS_int_rNIR + QS_int_rVIS + QS_int_fNIR + QS_int_fVIS);
  const a_v_fNIR = 0.65 - 0.65 * Math.exp(-0.27 * LAI), a_v_fVIS = 0.95 - 0.9 * Math.exp(-0.85 * LAI);
  const k_rNIR = 0.25 + 0.38 * Math.exp(-0.12 * angle);
  const a_v_rNIR = 0.67 - 0.06 * Math.exp(-0.08 * angle) - (0.68 - 0.5 * Math.exp(-0.11 * angle)) * Math.exp(-k_rNIR * LAI);
  const k_rVIS = 0.88 + 2.6 * Math.exp(-0.18 * angle), a_v_rVIS = 0.94 - 0.95 * Math.exp(-k_rVIS * LAI);
  const fv = A_v / A_f;
  const QS_v_NIR = QS_int_rNIR * (1 - a_obs) * a_v_rNIR * fv + QS_int_fNIR * (1 - a_obs) * a_v_fNIR * fv;
  const QS_v_VIS = QS_int_rVIS * (1 - a_obs) * a_v_rVIS * fv + QS_int_fVIS * (1 - a_obs) * a_v_fVIS * fv;
  const a_m_fNIR = 0.05 + 0.91 * Math.exp(-0.5 * LAI);
  const a_m_rNIR = 0.05 + 0.06 * Math.exp(-0.08 * angle) + (0.92 - 0.53 * Math.exp(-0.18 * angle)) * Math.exp(-(0.48 + 0.54 * Math.exp(-0.13 * angle)) * LAI);
  const QS_m_NIR = QS_int_rNIR * (1 - a_obs) * a_m_rNIR * fv + QS_int_fNIR * (1 - a_obs) * a_m_fNIR * fv;
  const QS_s_NIR = (QS_int_rNIR + QS_int_fNIR) * (1 - a_obs) * alphS_s * ((A_f - A_v) / A_f);

  // transpiración (Stanghellini)
  const QS_int = (QS_int_rNIR + QS_int_rVIS + QS_int_fNIR + QS_int_fVIS) * (1 - a_obs) * fv;
  const xa = C_w / rho_i, xv = sat_conc(T_v) / rho_i;
  const vpd = atm * (xv / (xv + 0.622) - xa / (xa + 0.622));
  const x = Math.exp(-0.24 * LAI);
  const a_v_short = 0.83 * (1 - 0.7 * x) * (1 + 0.58 * x ** 2) * (0.88 - x ** 2 + 0.12 * x ** (8 / 3));
  const I_s_bar = (QS_int * a_v_short) / (2 * LAI);
  const r_i_CO2 = 1 + (I_s_bar > 0 ? 6.1e-7 * (C_c_ppm - 200) ** 2 : 0);
  const r_i_vpd = vpd / 1000 < 0.8 ? 1 + 4.3 * (vpd / 1000) ** 2 : 3.8;
  const r_st = 82 * ((QS_int + 4.3) / (QS_int + 0.54)) * (1 + 0.023 * (T_v - T_k - 24.5) ** 2) * r_i_CO2 * r_i_vpd;
  const hL_v_i = ((2 * LAI * H_fg) / (rho_i * c_i)) * (Le ** (2 / 3) / HV + r_st / (rho_i * c_i)) ** -1;
  const QT_v_i = Math.max(A_v * hL_v_i * (sat_conc(T_v) - C_w), 0) * (aj.factorHidrico ?? 1);

  // conducción
  const QD_sf1 = ((A_f * lam_s[0]) / l_s[0]) * (T_f - T_s1), QD_s12 = ((A_f * lam_s[1]) / l_s[1]) * (T_s1 - T_s2);
  const QD_s23 = ((A_f * lam_s[2]) / l_s[2]) * (T_s2 - T_s3), QD_s34 = ((A_f * lam_s[3]) / l_s[3]) * (T_s3 - T_s4);
  const QD_s45 = ((A_f * lam_s[4]) / l_s[4]) * (T_s4 - T_ss), QD_m_p = ((A_m * lam_p) / l_m) * (T_m - T_p);

  // ventilación: infiltración por rendijas (viento + tiro) y ventanas por encima de la consigna
  const wsH = wind_speed * c_terr * H ** a_terr, wind_pressure = Cp * 0.5 * rho_i * wsH ** 2;
  const stack = (rho_i * g * H * (T_i - T_e)) / T_i;
  const Qw = Cd * crack_area * Math.sqrt((2 * wind_pressure) / rho_i), Qs = Cd * crack_area * Math.sqrt((2 * Math.abs(stack)) / rho_i);
  const R_a_min = (Math.hypot(Qw, Qs) * crack_length_total) / crack_length / V;
  const dTv = T_i - aj.T_sp_vent, R_a_max = aj.R_a_max;
  const apertura = aperturaVentanas(aj, T_i);
  const R_a = R_a_min + (R_a_max - R_a_min) * apertura;
  const QV_i_e = R_a * V * rho_i * c_i * (T_i - T_e);
  const MW_i_e = R_a * (C_w - C_we), MC_i_e = R_a * (C_c - C_ce);
  // Un mismo actuador alimenta el balance de masa y la contabilidad de recursos.
  const [Q_calef, inyeccionCO2] = actuadores(t, y, aj);
  const MC_cc_i = inyeccionCO2 / V;

  // fotosíntesis (Vanthoor)
  const T_25 = T_k + 25, PAR = QS_v_VIS / heat_phot / N_A / A_v;
  const Gamma = Math.max((c_Gamma * (T_v - T_k)) / LAI + 20 * c_Gamma * (1 - 1 / LAI), 0);
  const h_airbuf_buf = 1 / (1 + Math.exp(s_airbuf_buf * (C_buf - C_buf_max)));
  const C_stom = eta * (C_c / rho_i) * (M_a / M_c);
  const J_pot = LAI * J_max_25 * Math.exp((E_j * (T_v - T_25)) / (R * T_v * T_25)) * (1 + Math.exp((S * T_25 - HH) / (R * T_25))) / (1 + Math.exp((S * T_v - HH) / (R * T_v)));
  const J = (J_pot + alph * PAR - Math.sqrt((J_pot + alph * PAR) ** 2 - 4 * theta * J_pot * alph * PAR)) / (2 * theta);
  const P = (J * (C_stom - Gamma)) / (4 * (C_stom + 2 * Gamma)), Resp = (P * Gamma) / C_stom;
  const MC_i_buf = M_carb * h_airbuf_buf * (P - Resp) * (aj.factorHidrico ?? 1);

  // crecimiento
  const h_buforg_buf = 1 / (1 + Math.exp(s_buforg_buf * (C_buf - 0.05 * C_buf_max)));
  // límites de temperatura del crecimiento: los de GES por defecto; Vanthoor (2011) usa 10/34 y 15/24,5 °C
  const h_T_v = 1 / (1 + Math.exp(s_min_T * (T_v - T_k - (aj.T_min_v ?? T_min_v)))) / (1 + Math.exp(s_max_T * (T_v - T_k - (aj.T_max_v ?? T_max_v))));
  const h_T_v24 = 1 / (1 + Math.exp(s_min_T24 * (T_vmean - T_k - (aj.T_min_v24 ?? T_min_v24)))) / (1 + Math.exp(s_max_T24 * (T_vmean - T_k - (aj.T_max_v24 ?? T_max_v24))));
  const r1 = T_vsum / T_sum_end, r2 = (T_vsum - T_sum_end) / T_sum_end;
  const h_T_vsum = 0.5 * (r1 + Math.sqrt(r1 ** 2 + 1e-4)) - 0.5 * (r2 + Math.sqrt(r2 ** 2 + 1e-4));
  const g_T_v24 = (0.047 * (T_vmean - T_k) + 0.06) * (aj.factorHidrico ?? 1);
  const MC_buf_fruit = h_buforg_buf * h_T_v * h_T_v24 * h_T_vsum * g_T_v24 * rg_fruit;
  const MC_buf_leaf = h_buforg_buf * h_T_v24 * g_T_v24 * rg_leaf, MC_buf_stem = h_buforg_buf * h_T_v24 * g_T_v24 * rg_stem;
  const MC_buf_i = c_fruit_g * MC_buf_fruit + c_leaf_g * MC_buf_leaf + c_stem_g * MC_buf_stem;
  const q10 = Q_10 ** (0.1 * (T_vmean - T_25));
  const MC_fruit_i = c_fruit_m * q10 * C_fruit * (1 - Math.exp(-c_RGR * R_fruit));
  const MC_leaf_i = c_leaf_m * q10 * C_leaf * (1 - Math.exp(-c_RGR * R_leaf));
  const MC_stem_i = c_stem_m * q10 * C_stem * (1 - Math.exp(-c_RGR * R_stem));
  const MC_leaf_prune = Math.max(C_leaf - LAI_max / SLA, 0);

  const d = new Float64Array(21);
  d[0] = (QV_i_c + QP_i_c - QR_c_f - QR_c_v - QR_c_m - QV_c_e - QR_c_sk + QS_c) / (A_c * cd_c);
  d[1] = (QV_m_i + QV_v_i - QV_i_f - QV_i_c - QV_i_e + QV_p_i + QS_i + Q_calef) / (V * rho_i * c_i);
  d[2] = (-QV_v_i - QR_v_c - QR_v_m - QR_v_p - QT_v_i + QS_v_NIR) / (c_v * A_v * msd_v);
  d[3] = (-QV_m_i - QP_m_i - QR_m_v - QR_m_c - QR_m_p - QD_m_p + QS_m_NIR) / (A_m * c_m);
  d[4] = (QD_m_p - QV_p_i - QP_p_i - QR_p_f - QR_p_v - QR_p_m) / (A_p * c_p);
  d[5] = (QV_i_f + QP_i_f - QR_f_c - QR_f_p - QD_sf1 + QS_s_NIR) / (rhod_s[0] * A_f * c_s[0] * l_s[0]);
  d[6] = (QD_sf1 - QD_s12) / (rhod_s[1] * c_s[1] * l_s[1] * A_f);
  d[7] = (QD_s12 - QD_s23) / (rhod_s[2] * c_s[2] * l_s[2] * A_f);
  d[8] = (QD_s23 - QD_s34) / (rhod_s[3] * c_s[3] * l_s[3] * A_f);
  d[9] = (QD_s34 - QD_s45) / (rhod_s[4] * c_s[4] * l_s[4] * A_f);
  d[10] = (T_v - T_vmean) / 86400;
  d[11] = (T_v - T_k) / 86400;
  d[12] = (QP_m_i + QP_p_i - QP_i_c - QP_i_f + QT_v_i) / (V * H_fg) - MW_i_e;
  d[13] = MC_cc_i - MC_i_e + (M_c / M_carb) * (A_v / V) * (MC_buf_i + MC_fruit_i + MC_leaf_i + MC_stem_i - MC_i_buf);
  d[14] = MC_i_buf - MC_buf_fruit - MC_buf_leaf - MC_buf_stem - MC_buf_i;
  d[15] = MC_buf_fruit - MC_fruit_i;
  d[16] = MC_buf_leaf - MC_leaf_i - MC_leaf_prune;
  d[17] = MC_buf_stem - MC_stem_i;
  d[18] = d[15] / C_fruit - R_fruit;
  d[19] = (d[16] + MC_leaf_prune) / C_leaf - R_leaf;
  d[20] = d[17] / C_stem - R_stem;
  if (flujos) Object.assign(flujos, {
    // energía [W]: sol, convección, radiación, ventilación, transpiración, conducción
    sol_cubierta: QS_c, sol_vegetacion: QS_v_NIR, sol_manta: QS_m_NIR, sol_suelo: QS_s_NIR, sol_aire: QS_i,
    cubierta_exterior: QV_c_e, cubierta_cielo: QR_c_sk, aire_cubierta: QV_i_c + QP_i_c, aire_suelo: QV_i_f + QP_i_f,
    vegetacion_aire: QV_v_i, manta_aire: QV_m_i, bandeja_aire: QV_p_i, ventilacion: QV_i_e, transpiracion: QT_v_i,
    vegetacion_cubierta: QR_v_c, suelo_subsuelo: QD_sf1, subsuelo_fondo: QD_s45,
    // masa: vapor [kg/s] y CO₂ [kg/s]
    vapor_transpiracion: QT_v_i / H_fg, vapor_evaporacion: QP_m_i / H_fg,
    vapor_condensacion: (QP_i_c + QP_i_f) / H_fg, vapor_ventilacion: MW_i_e * V,
    co2_ventilacion: MC_i_e * V, co2_fotosintesis: (M_c / M_carb) * A_v * MC_i_buf,
    co2_respiracion: (M_c / M_carb) * A_v * (MC_buf_i + MC_fruit_i + MC_leaf_i + MC_stem_i), co2_inyeccion: MC_cc_i * V,
    // Carbono elemental [kg C/s], CH₂O = 30 g/mol, C = 12 g/mol.
    carbono_inyeccion: MC_cc_i * V * 12 / 44,
    carbono_ventilacion: MC_i_e * V * 12 / 44,
    carbono_fotosintesis: A_v * MC_i_buf * 12 / 30,
    carbono_fruto: A_v * MC_buf_fruit * 12 / 30,
    carbono_hojas: A_v * MC_buf_leaf * 12 / 30,
    carbono_tallo: A_v * MC_buf_stem * 12 / 30,
    carbono_resp_reserva: A_v * MC_buf_i * 12 / 30,
    carbono_resp_fruto: A_v * MC_fruit_i * 12 / 30,
    carbono_resp_hojas: A_v * MC_leaf_i * 12 / 30,
    carbono_resp_tallo: A_v * MC_stem_i * 12 / 30,
    carbono_poda: A_v * MC_leaf_prune * 12 / 30,
    // otros
    calefaccion: Q_calef, renovaciones_h: R_a * 3600, apertura, PAR, LAI, T_ext: T_e - T_k, HR_ext: rel_humid * 100, HR_int: (C_w / sat_conc(T_i)) * 100,
    viento_exterior: wind_speed, CO2_ppm: C_c_ppm, sol_exterior: solExterior, sombreo_cierre: cierrePantalla, sol_tras_pantalla: solExterior * factorPantalla, solar_reflejado: 2 * solExterior * (1 - factorPantalla),
  });
  return d;
}
