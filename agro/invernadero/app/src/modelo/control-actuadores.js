const clip = (x) => Math.max(0, Math.min(1, x));
// Pantalla exterior ideal: al cubrir el 100 %, refleja el 80 % de la radiación.
export function cierreSombreo(aj, sol) {
  if (aj.sombreoModo === 'auto') return clip((sol - (aj.umbralSombreo ?? 250)) / 200);
  return aj.sombreoModo === 'fijo' ? clip((aj.sombreo ?? 50) / 100) : 0;
}
export function aperturaVentanas(aj, temperaturaK) {
  return aj.ventanasModo === 'manual' ? clip((aj.aperturaVentanas ?? 0) / 100)
    : clip((temperaturaK - aj.T_sp_vent) / 4);
}
