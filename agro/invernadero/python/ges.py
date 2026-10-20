"""Traslación fiel a Python del modelo GES (Greenhouse Energy Simulation).

Modelo original: EECi/GES, Energy Efficient Cities Initiative, Universidad de Cambridge (2019),
licencia MIT. Invernadero de una zona, sin calefacción y ventilado, con cultivo de tomate
(fotosíntesis y crecimiento de Vanthoor, 2011; clima según el modelo de Gembloux, GDGCM).

Esta versión reproduce derivatives.m línea a línea (incluidas sus peculiaridades: el clima se
toma por filas de un minuto sin interpolar y el día del año es ceil(t/86400)) para poder
compararla con la salida de referencia del original (reference.mat, ode15s).

    python python/ges.py <carpeta de GES>      # integra 30 días y compara con reference.mat
"""
import numpy as np

# ---------------------------------------------------------------- parámetros (parameters.m)
deltaT = 60; sim_days = 30
sigm = 5.67e-8; T_k = 273.15; g = 9.81; atm = 1.013e5; latitude = 53.193583
N_A = 6.02214e+23; M_a = 0.029; lam = 0.025; c_i = 1003.2; H_fg = 2437000; Le = 0.819; R = 8.314
M_w = 0.018; M_c = 0.044; M_carb = 0.03; nu = 15.1e-6
A_f = 250; V = 1000; SurfaceArea = np.array([40, 0, 75, 135, 40, 0, 75, 135.0]); A_c = SurfaceArea.sum()
a_obs = 0.05; H = 5
int_air_speed = 0.5; R_a_max = 30 / 3600; T_sp_vent = 25 + T_k
eps_ce = 0.85; eps_ci = 0.85; rho_ci = 0.15; alph_c = 0.04; tau_c_NIR = 0.85; tau_c_VIS = 0.85; d_c = 1.5; cd_c = 8736
lam_s = [1.7, 0.85, 0.85, 0.85, 0.85]; c_s = [880, 1081, 1081, 1081, 1081]; l_s = [0.02, 0.05, 0.1, 0.25, 1.0]
rhod_s = [2300, 1500, 1600, 1600, 1600]; rho_s = 0.85; eps_s = 0.95; alphS_s = 0.5; d_f = 0.5; T_ss = 14.0 + T_k
c_v = 4180; rho_v = 0.22; eps_v = 0.95; d_v = 0.1; p_v = 0.75; msd_v = 1.326
A_p = p_v * A_f; A_v = A_p; A_m = A_p; d_p = 1; d_m = 0.1; lam_p = 0.2; c_m = 45050; c_p = 10020; l_m = 0.03
rho_m = 0.05; rho_p = 0.05; eps_m = 0.95; eps_p = 0.95
c_Gamma = 1.7e-6; J_max_25 = 210e-6; alph = 0.385; C_buf_max = 0.02; theta = 0.7; S = 710; HH = 22e4; E_j = 37e3
heat_phot = 3.6368e-19; eta = 0.67; s_airbuf_buf = 5e2; s_buforg_buf = -5e3
s_min_T = -0.8690; s_max_T = 0.5793; s_min_T24 = -1.1587; s_max_T24 = 1.3904
added_CO2 = 0; SLA = 26.6; LAI_max = 5; Q_10 = 2
rg_fruit = 0.328e-6; rg_leaf = 0.095e-6; rg_stem = 0.074e-6
c_fruit_g = 0.27; c_fruit_m = 1.16e-7; c_leaf_g = 0.28; c_leaf_m = 3.47e-7; c_stem_g = 0.30; c_stem_m = 1.47e-7
c_RGR = 2.85e6; T_min_v24 = 12; T_max_v24 = 27; T_min_v = 6; T_max_v = 40; T_sum_end = 1035
c_terr = 0.35; a_terr = 0.25; Cp = 0.62; Cd = 0.61; crack_length = 1; crack_width = 0.001
crack_area = crack_length * crack_width; crack_length_total = 350
NOMBRES = ["T_c", "T_i", "T_v", "T_m", "T_p", "T_f", "T_s1", "T_s2", "T_s3", "T_s4", "T_vmean", "T_vsum",
           "C_w", "C_c", "C_buf", "C_fruit", "C_leaf", "C_stem", "R_fruit", "R_leaf", "R_stem"]


def sat_conc(T):
    T = T - 273.15
    return np.exp(11.56 - 4030 / (T + 235)) * (-0.0046 * T + 1.2978)


def lamorturb(Gr, Re):
    free = Gr < 1e5
    Nu_G = 0.5 * free * Gr ** 0.25 + 0.13 * (1 - free) * Gr ** 0.33
    forced = Re < 2e4
    Nu_R = 0.6 * forced * Re ** 0.5 + 0.032 * (1 - forced) * Re ** 0.8
    x = Nu_G > Nu_R
    Nu = x * Nu_G + (1 - x) * Nu_R
    Sh = x * Nu * Le ** 0.25 + (1 - x) * Nu * Le ** 0.33
    return Nu, Sh


def sind(x): return np.sin(np.radians(x))
def cosd(x): return np.cos(np.radians(x))


def derivadas(t, T, climate, flujos=False):
    n = max(int(np.ceil(t / deltaT)), 1)
    day = int(np.ceil(t / 86400))
    T_c, T_i, T_v, T_m, T_p, T_f, T_s1, T_s2, T_s3, T_s4, T_vmean, T_vsum, C_w, C_c, C_buf, C_fruit, C_leaf, C_stem, R_fruit, R_leaf, R_stem = T
    cl = climate[n - 1]
    T_e = cl[0] + T_k; T_sk = cl[1] + T_k; wind_speed = cl[2]; rel_humid = cl[3] / 100
    C_we = rel_humid * sat_conc(T_e)
    p_w = C_w * R * T_i / M_w
    rho_i = ((atm - p_w) * M_a + p_w * M_w) / (R * T_i)
    LAI = SLA * C_leaf
    C_ce = 4.0e-4 * M_c * atm / (R * T_e)
    C_c_ppm = C_c * R * T_i / (M_c * atm) * 1e6

    # convección
    Nu, _ = lamorturb(g * d_c ** 3 / (T_e * nu ** 2) * abs(T_c - T_e), wind_speed * d_c / nu)
    QV_c_e = A_c * Nu * lam * (T_c - T_e) / d_c
    Nu, Sh = lamorturb(g * d_c ** 3 / (T_i * nu ** 2) * abs(T_i - T_c), int_air_speed * d_c / nu)
    QV_i_c = A_c * Nu * lam * (T_i - T_c) / d_c
    QP_i_c = max(A_c * H_fg / (rho_i * c_i) * Sh / Le * lam / d_c * (C_w - sat_conc(T_c)), 0)
    Nu, Sh = lamorturb(g * d_f ** 3 / (T_i * nu ** 2) * abs(T_i - T_f), int_air_speed * d_f / nu)
    QV_i_f = A_f * Nu * lam * (T_i - T_f) / d_f
    QP_i_f = max(A_f * H_fg / (rho_i * c_i) * Sh / Le * lam / d_f * (C_w - sat_conc(T_f)), 0)
    Nu, Sh = lamorturb(g * d_m ** 3 / (T_i * nu ** 2) * abs(T_m - T_i), int_air_speed * d_m / nu)
    A_m_wool = 0.75 * A_m; A_m_water = 0.25 * A_m
    QV_m_i = A_m_wool * Nu * lam * (T_m - T_i) / d_m
    QP_m_i = A_m_water * H_fg / (rho_i * c_i) * Sh / Le * lam / d_m * (sat_conc(T_m) - C_w)
    Nu, _ = lamorturb(g * d_p ** 3 / (T_i * nu ** 2) * abs(T_p - T_i), int_air_speed * d_p / nu)
    QV_p_i = A_p * Nu * lam * (T_p - T_i) / d_p
    QP_p_i = 0
    Nu, _ = lamorturb(g * d_v ** 3 / (T_i * nu ** 2) * abs(T_v - T_i), int_air_speed * d_v / nu)
    A_v_exp = LAI * A_v
    QV_v_i = A_v_exp * Nu * lam * (T_v - T_i) / d_v
    HV = Nu * lam / d_v

    # radiación de onda larga (factores de vista)
    A_vvf = min(LAI * p_v * A_f, p_v * A_f); A_c_roof = 271
    F_f_c = 1 - p_v; F_f_p = p_v; F_c_f = A_f / A_c_roof * F_f_c
    F_c_v = min((1 - F_c_f) * LAI, 1 - F_c_f); F_c_m = max((1 - F_c_f) * (1 - LAI), 0)
    F_v_c = 0.5; F_v_m = 0.5; F_v_p = 0; F_m_c = max(1 - LAI, 0.0); F_m_v = 1 - F_m_c; F_m_p = 0
    F_p_v = 0; F_p_m = 0; F_p_f = 1.0
    QR_c_sk = eps_ce * sigm * A_c * (T_c ** 4 - T_sk ** 4)
    QR_c_v = eps_ci * eps_v / (1 - rho_ci * rho_v * F_c_v * F_v_c) * sigm * A_c_roof * F_c_v * (T_c ** 4 - T_v ** 4)
    QR_c_m = eps_ci * eps_m / (1 - rho_ci * rho_m * F_c_m * F_m_c) * sigm * A_c_roof * F_c_m * (T_c ** 4 - T_m ** 4)
    QR_c_f = eps_ci * eps_s / (1 - rho_ci * rho_s * F_c_f * F_f_c) * sigm * A_c_roof * F_c_f * (T_c ** 4 - T_f ** 4)
    QR_v_c = eps_v * eps_ci / (1 - rho_v * rho_ci * F_v_c * F_c_v) * sigm * A_vvf * 2 * F_v_c * (T_v ** 4 - T_c ** 4)
    QR_v_m = eps_v * eps_m / (1 - rho_v * rho_m * F_v_m * F_m_v) * sigm * A_vvf * 2 * F_v_m * (T_v ** 4 - T_m ** 4)
    QR_v_p = eps_v * eps_p / (1 - rho_v * rho_p * F_v_p * F_p_v) * sigm * A_vvf * 2 * F_v_p * (T_v ** 4 - T_p ** 4)
    QR_m_c = eps_m * eps_ci / (1 - rho_m * rho_ci * F_m_c * F_c_m) * sigm * A_m * F_m_c * (T_m ** 4 - T_c ** 4)
    QR_m_v = eps_m * eps_v / (1 - rho_m * rho_v * F_m_v * F_v_m) * sigm * A_m * F_m_v * (T_m ** 4 - T_v ** 4)
    QR_m_p = eps_m * eps_p / (1 - rho_m * rho_p * F_m_p * F_p_m) * sigm * A_m * F_m_p * (T_m ** 4 - T_p ** 4)
    QR_p_v = eps_p * eps_v / (1 - rho_p * rho_v * F_p_v * F_v_p) * sigm * A_p * F_p_v * (T_p ** 4 - T_v ** 4)
    QR_p_m = eps_p * eps_m / (1 - rho_p * rho_m * F_p_m * F_m_p) * sigm * A_p * F_p_m * (T_p ** 4 - T_m ** 4)
    QR_p_f = eps_p * eps_s / (1 - rho_p * rho_s * F_p_f * F_f_p) * sigm * A_p * F_p_f * (T_p ** 4 - T_f ** 4)
    QR_f_c = eps_s * eps_ci / (1 - rho_s * rho_ci * F_c_f * F_f_c) * sigm * A_f * F_f_c * (T_f ** 4 - T_c ** 4)
    QR_f_p = eps_s * eps_p / (1 - rho_s * rho_p * F_f_p * F_p_f) * sigm * A_f * F_f_p * (T_f ** 4 - T_p ** 4)

    # radiación solar
    gamma = 360 * (day - 80) / 365
    eqn_time = -7.13 * cosd(gamma) - 1.84 * sind(gamma) - 0.69 * cosd(2 * gamma) + 9.92 * sind(2 * gamma)
    az = 360 * (np.remainder(t / 3600, 24) + eqn_time / 60 - 12) / 24
    delta = 0.38 - 0.77 * cosd(gamma) + 23.27 * cosd(gamma)
    angle = np.degrees(np.arcsin(sind(latitude) * sind(delta) + cosd(latitude) * cosd(delta) * cosd(az)))
    direct = 0.5 * SurfaceArea @ cl[4:12]; diffuse = 0.5 * SurfaceArea @ cl[12:20]
    QS_tot_rNIR = QS_tot_rVIS = direct; QS_tot_fNIR = QS_tot_fVIS = diffuse
    QS_int_rNIR = tau_c_NIR * QS_tot_rNIR; QS_int_rVIS = tau_c_VIS * QS_tot_rVIS
    QS_int_fNIR = tau_c_NIR * QS_tot_fNIR; QS_int_fVIS = tau_c_VIS * QS_tot_fVIS
    QS_c = alph_c * (QS_tot_rNIR + QS_tot_rVIS + QS_tot_fNIR + QS_tot_fVIS)
    QS_i = a_obs * (QS_int_rNIR + QS_int_rVIS + QS_int_fNIR + QS_int_fVIS)
    a_v_fNIR = 0.65 - 0.65 * np.exp(-0.27 * LAI)
    a_v_fVIS = 0.95 - 0.9 * np.exp(-0.85 * LAI)
    k_rNIR = 0.25 + 0.38 * np.exp(-0.12 * angle)
    a_v_rNIR = 0.67 - 0.06 * np.exp(-0.08 * angle) - (0.68 - 0.5 * np.exp(-0.11 * angle)) * np.exp(-k_rNIR * LAI)
    k_rVIS = 0.88 + 2.6 * np.exp(-0.18 * angle)
    a_v_rVIS = 0.94 - 0.95 * np.exp(-k_rVIS * LAI)
    QS_v_NIR = (QS_int_rNIR * (1 - a_obs)) * a_v_rNIR * A_v / A_f + (QS_int_fNIR * (1 - a_obs)) * a_v_fNIR * A_v / A_f
    QS_v_VIS = (QS_int_rVIS * (1 - a_obs)) * a_v_rVIS * A_v / A_f + (QS_int_fVIS * (1 - a_obs)) * a_v_fVIS * A_v / A_f
    a_m_fNIR = 0.05 + 0.91 * np.exp(-0.5 * LAI)
    a_m_rNIR = 0.05 + 0.06 * np.exp(-0.08 * angle) + (0.92 - 0.53 * np.exp(-0.18 * angle)) * np.exp(-(0.48 + 0.54 * np.exp(-0.13 * angle)) * LAI)
    QS_m_NIR = QS_int_rNIR * (1 - a_obs) * a_m_rNIR * A_v / A_f + QS_int_fNIR * (1 - a_obs) * a_m_fNIR * A_v / A_f
    QS_s_NIR = (QS_int_rNIR + QS_int_fNIR) * (1 - a_obs) * alphS_s * (A_f - A_v) / A_f

    # transpiración (resistencia estomática de Stanghellini)
    QS_int = (QS_int_rNIR + QS_int_rVIS + QS_int_fNIR + QS_int_fVIS) * (1 - a_obs) * A_v / A_f
    xa = C_w / rho_i; xv = sat_conc(T_v) / rho_i
    vpd = atm * (xv / (xv + 0.622) - xa / (xa + 0.622))
    x = np.exp(-0.24 * LAI)
    a_v_short = 0.83 * (1 - 0.70 * x) * (1 + 0.58 * x ** 2) * (0.88 - x ** 2 + 0.12 * x ** (8 / 3))
    I_s_bar = QS_int * a_v_short / (2 * LAI)
    r_i_CO2 = 1 + (I_s_bar > 0) * 6.1e-7 * (C_c_ppm - 200) ** 2
    heavy = vpd / 1000 < 0.8
    r_i_vpd = heavy * (1 + 4.3 * (vpd / 1000) ** 2) + (1 - heavy) * 3.8
    r_st = 82 * ((QS_int + 4.3) / (QS_int + 0.54)) * (1 + 0.023 * (T_v - T_k - 24.5) ** 2) * r_i_CO2 * r_i_vpd
    hL_v_i = 2 * LAI * H_fg / (rho_i * c_i) * (Le ** (2 / 3) / HV + r_st / (rho_i * c_i)) ** (-1)
    QT_v_i = max(A_v * hL_v_i * (sat_conc(T_v) - C_w), 0)

    # conducción
    QD_sf1 = A_f * lam_s[0] / l_s[0] * (T_f - T_s1); QD_s12 = A_f * lam_s[1] / l_s[1] * (T_s1 - T_s2)
    QD_s23 = A_f * lam_s[2] / l_s[2] * (T_s2 - T_s3); QD_s34 = A_f * lam_s[3] / l_s[3] * (T_s3 - T_s4)
    QD_s45 = A_f * lam_s[4] / l_s[4] * (T_s4 - T_ss)
    QD_m_p = A_m * lam_p / l_m * (T_m - T_p)

    # ventilación (infiltración por rendijas + ventanas por encima de la consigna)
    wind_speed_H = wind_speed * c_terr * H ** a_terr
    wind_pressure = Cp * 0.5 * rho_i * wind_speed_H ** 2
    stack = rho_i * g * H * (T_i - T_e) / T_i
    Qw = Cd * crack_area * (2 * wind_pressure / rho_i) ** 0.5
    Qs = Cd * crack_area * (2 * abs(stack) / rho_i) ** 0.5
    R_a_min = (Qw ** 2 + Qs ** 2) ** 0.5 * crack_length_total / crack_length / V
    dTv = T_i - T_sp_vent
    R_a = R_a_min + (0 < dTv < 4) * (R_a_max - R_a_min) / 4 * dTv + (dTv >= 4) * (R_a_max - R_a_min)
    QV_i_e = R_a * V * rho_i * c_i * (T_i - T_e)
    MW_i_e = R_a * (C_w - C_we)
    MC_i_e = R_a * (C_c - C_ce)
    MC_cc_i = 0.0

    # fotosíntesis (Vanthoor)
    T_25 = T_k + 25
    PAR = QS_v_VIS / heat_phot / N_A / A_v
    Gamma = max(c_Gamma * (T_v - T_k) / LAI + 20 * c_Gamma * (1 - 1 / LAI), 0)
    h_airbuf_buf = 1 / (1 + np.exp(s_airbuf_buf * (C_buf - C_buf_max)))
    C_stom = eta * (C_c / rho_i) * (M_a / M_c)
    J_pot = LAI * J_max_25 * np.exp(E_j * (T_v - T_25) / (R * T_v * T_25)) * (1 + np.exp((S * T_25 - HH) / (R * T_25))) / (1 + np.exp((S * T_v - HH) / (R * T_v)))
    J = (J_pot + alph * PAR - np.sqrt((J_pot + alph * PAR) ** 2 - 4 * theta * J_pot * alph * PAR)) / (2 * theta)
    P = J * (C_stom - Gamma) / (4 * (C_stom + 2 * Gamma))
    Resp = P * Gamma / C_stom
    MC_i_buf = M_carb * h_airbuf_buf * (P - Resp)

    # crecimiento
    h_buforg_buf = 1 / (1 + np.exp(s_buforg_buf * (C_buf - 0.05 * C_buf_max)))
    h_T_v = 1 / (1 + np.exp(s_min_T * ((T_v - T_k) - T_min_v))) / (1 + np.exp(s_max_T * ((T_v - T_k) - T_max_v)))
    h_T_v24 = 1 / (1 + np.exp(s_min_T24 * ((T_vmean - T_k) - T_min_v24))) / (1 + np.exp(s_max_T24 * ((T_vmean - T_k) - T_max_v24)))
    r = T_vsum / T_sum_end; r2 = (T_vsum - T_sum_end) / T_sum_end
    h_T_vsum = 0.5 * (r + np.sqrt(r ** 2 + 1e-4)) - 0.5 * (r2 + np.sqrt(r2 ** 2 + 1e-4))
    g_T_v24 = 0.047 * (T_vmean - T_k) + 0.06
    MC_buf_fruit = h_buforg_buf * h_T_v * h_T_v24 * h_T_vsum * g_T_v24 * rg_fruit
    MC_buf_leaf = h_buforg_buf * h_T_v24 * g_T_v24 * rg_leaf
    MC_buf_stem = h_buforg_buf * h_T_v24 * g_T_v24 * rg_stem
    MC_buf_i = c_fruit_g * MC_buf_fruit + c_leaf_g * MC_buf_leaf + c_stem_g * MC_buf_stem
    q10 = Q_10 ** (0.1 * (T_vmean - T_25))
    MC_fruit_i = c_fruit_m * q10 * C_fruit * (1 - np.exp(-c_RGR * R_fruit))
    MC_leaf_i = c_leaf_m * q10 * C_leaf * (1 - np.exp(-c_RGR * R_leaf))
    MC_stem_i = c_stem_m * q10 * C_stem * (1 - np.exp(-c_RGR * R_stem))
    MC_leaf_prune = max(C_leaf - LAI_max / SLA, 0)

    # derivadas
    dT_c = 1 / (A_c * cd_c) * (QV_i_c + QP_i_c - QR_c_f - QR_c_v - QR_c_m - QV_c_e - QR_c_sk + QS_c)
    dT_i = 1 / (V * rho_i * c_i) * (QV_m_i + QV_v_i - QV_i_f - QV_i_c - QV_i_e + QV_p_i + QS_i)
    dT_v = 1 / (c_v * A_v * msd_v) * (-QV_v_i - QR_v_c - QR_v_m - QR_v_p - QT_v_i + QS_v_NIR)
    dT_m = 1 / (A_m * c_m) * (-QV_m_i - QP_m_i - QR_m_v - QR_m_c - QR_m_p - QD_m_p + QS_m_NIR)
    dT_p = 1 / (A_p * c_p) * (QD_m_p - QV_p_i - QP_p_i - QR_p_f - QR_p_v - QR_p_m)
    dT_f = 1 / (rhod_s[0] * A_f * c_s[0] * l_s[0]) * (QV_i_f + QP_i_f - QR_f_c - QR_f_p - QD_sf1 + QS_s_NIR)
    dT_s1 = 1 / (rhod_s[1] * c_s[1] * l_s[1] * A_f) * (QD_sf1 - QD_s12)
    dT_s2 = 1 / (rhod_s[2] * c_s[2] * l_s[2] * A_f) * (QD_s12 - QD_s23)
    dT_s3 = 1 / (rhod_s[3] * c_s[3] * l_s[3] * A_f) * (QD_s23 - QD_s34)
    dT_s4 = 1 / (rhod_s[4] * c_s[4] * l_s[4] * A_f) * (QD_s34 - QD_s45)
    dC_w = 1 / (V * H_fg) * (QP_m_i + QP_p_i - QP_i_c - QP_i_f + QT_v_i) - MW_i_e
    dC_c = MC_cc_i - MC_i_e + (M_c / M_carb) * (A_v / V) * (MC_buf_i + MC_fruit_i + MC_leaf_i + MC_stem_i - MC_i_buf)
    dT_vmean = (T_v - T_vmean) / 86400
    dT_vsum = (T_v - T_k) / 86400
    dC_buf = MC_i_buf - MC_buf_fruit - MC_buf_leaf - MC_buf_stem - MC_buf_i
    dC_fruit = MC_buf_fruit - MC_fruit_i
    dC_leaf = MC_buf_leaf - MC_leaf_i - MC_leaf_prune
    dC_stem = MC_buf_stem - MC_stem_i
    dR_fruit = dC_fruit / C_fruit - R_fruit
    dR_leaf = (dC_leaf + MC_leaf_prune) / C_leaf - R_leaf
    dR_stem = dC_stem / C_stem - R_stem
    d = np.array([dT_c, dT_i, dT_v, dT_m, dT_p, dT_f, dT_s1, dT_s2, dT_s3, dT_s4, dT_vmean, dT_vsum,
                  dC_w, dC_c, dC_buf, dC_fruit, dC_leaf, dC_stem, dR_fruit, dR_leaf, dR_stem])
    if not flujos: return d
    return d, dict(QS_c=QS_c, QS_i=QS_i, QS_v_NIR=QS_v_NIR, QS_m_NIR=QS_m_NIR, QS_s_NIR=QS_s_NIR, QV_i_e=QV_i_e,
                   QV_c_e=QV_c_e, QR_c_sk=QR_c_sk, QT_v_i=QT_v_i, QV_i_c=QV_i_c, QV_i_f=QV_i_f, QV_v_i=QV_v_i, QV_m_i=QV_m_i,
                   QD_sf1=QD_sf1, QD_s45=QD_s45, MC_i_buf=MC_i_buf, R_a=R_a, PAR=PAR)


def estado_inicial(climate):
    T0 = climate[0, 0] + T_k
    return np.array([20 + T_k] + [12 + T_k] * 8 + [11 + T_k, 12 + T_k, 0, climate[0, 3] / 100 * sat_conc(T0),
                     4e-4 * M_c * atm / (R * T0), 0.01, 0.001, 0.01, 0.01, 0, 0, 0])


if __name__ == "__main__":
    import sys, time
    import scipy.io as sio
    from scipy.integrate import solve_ivp
    carpeta = sys.argv[1]
    climate = sio.loadmat(f"{carpeta}/climate.mat")["climate"]
    ref = sio.loadmat(f"{carpeta}/reference.mat")["out"]
    t0 = time.time()
    sol = solve_ivp(lambda t, y: derivadas(t, y, climate), (0, 86400 * sim_days), estado_inicial(climate),
                    method="BDF", t_eval=ref[:, 0], rtol=1e-5, atol=1e-8, max_step=600)
    print(f"integrado en {time.time() - t0:.1f} s, estado {sol.status}, {sol.t.size} puntos")
    Y = sol.y.T; Yr = ref[:, 1:]
    for k, nmb in enumerate(NOMBRES):
        d = np.abs(Y[:, k] - Yr[:, k]); esc = np.abs(Yr[:, k]).max()
        print(f"{nmb:8s} máx|dif| {d.max():.3e}  media {d.mean():.3e}  (escala {esc:.3e})")
    np.save(f"{carpeta}/../py_sol.npy", np.column_stack([sol.t, Y]))
