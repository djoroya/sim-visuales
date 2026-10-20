/* Envoltorio mínimo del coste generado por CasADi para llamarlo desde JavaScript. */
#include <stdlib.h>
#include "mpc_coste.h"

static const casadi_real* arg[64];
static casadi_real* res[64];
static casadi_int* iw = 0;
static casadi_real* w = 0;

int mpc_init(void) {
  casadi_int sz_arg, sz_res, sz_iw, sz_w;
  mpc_coste_work(&sz_arg, &sz_res, &sz_iw, &sz_w);
  iw = (casadi_int*)malloc(sizeof(casadi_int) * (sz_iw + 1));
  w = (casadi_real*)malloc(sizeof(casadi_real) * (sz_w + 1));
  return (sz_arg <= 64 && sz_res <= 64) ? 0 : 1;
}

/* J y su gradiente g (NU) para las incógnitas u (NU) y los parámetros p. */
int mpc_eval(const double* u, const double* p, double* J, double* g) {
  arg[0] = u; arg[1] = p; res[0] = J; res[1] = g;
  return mpc_coste(arg, res, iw, w, 0);
}
