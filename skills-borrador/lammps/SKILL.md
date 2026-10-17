---
name: lammps
description: Simular con LAMMPS en este entorno (potenciales EAM, validación de un potencial frente a la referencia, ensayos de tracción de nanohilos) y ejecutarlo sin que el sandbox o la máquina se interpongan. Úsala en cuanto aparezca LAMMPS, dinámica molecular, un potencial interatómico o una curva tensión-deformación atomística.
---

# LAMMPS en este entorno

`/usr/bin/lmp`, versión **7 Feb 2024 - Update 1**, con MANYBODY (EAM), OPENMP y
OpenMPI. Potenciales en `/usr/share/lammps/potentials/`. 20 núcleos.

La primera línea de cada fichero de potencial trae la cita: léela y úsala
(`head -1 /usr/share/lammps/potentials/Cu_mishin1.eam.alloy`).

## Valida el potencial antes de simular nada

Es lo que distingue un resultado de una imagen bonita. Con el **mismo
potencial y la misma instalación**, calcula magnitudes con referencia conocida
y tabula el error relativo. Para un EAM metálico, en orden de coste:

| Magnitud | Cómo | Minutos |
|---|---|---|
| `a0`, energía cohesiva | celda fcc de 4 átomos + `fix box/relax iso 0.0` | segundos |
| `C11`, `C12` | ±0,1 % en x, `C_ij = -1e-4·ΔP_i/(2ε)` (bar→GPa) | segundos |
| `C44` | `change_box triclinic` + cizalla xy | segundos |
| `E[100]` | tracción ±0,2 % con `box/relax y 0.0 z 0.0` | segundos |
| Falla de apilamiento | celda x=[11-2] y=[-110] z=[111], desliza media celda `a0/√6`, relaja solo en z | segundos |

`scripts/in.validacion.eam` hace las cinco; parametrízalo con
`-var pot ... -var elem ... -var masa ... -var aguess ...`.

**Dos comprobaciones que dan credibilidad a la tabla:**

- Calcula `E[100]` por dos caminos —de los `Cij` y por tracción directa— y
  comprueba que coinciden en 4 cifras. Si no coinciden, el minimizador no ha
  convergido, no es física: usa `minimize 0.0 1.0e-16 1000000 10000000` con
  `vmax 0.0001` e imprime `pyy`/`pzz` residuales (deben ser ~1e-11 bar).
- Di en el README que las propiedades de volumen **estaban en el conjunto de
  ajuste** del potencial: la tabla valida tu montaje, no la capacidad
  predictiva del potencial. La energía de falla de apilamiento es la más
  informativa porque gobierna la plasticidad que luego verás.

Valores obtenidos hoy con `Cu_mishin1.eam.alloy` (sirven de referencia para
comprobar que la receta funciona): a0 3,6149 Å · E_coh 3,5402 eV · C11/C12/C44
169,9/122,6/76,2 GPa · E[100] 67,12 GPa · γ_isf 44,38 mJ/m².

## Sintaxis que cuesta tiempo averiguar

- **`change_box` no admite `scale`** en esta versión (da `Illegal change_box x
  command: missing argument(s)`). Usa `final lo hi` con una expresión
  inmediata: `change_box all x final 0.0 $((1.0+v_eps)*v_lx0) remap units box`.
- **`remap` es un parámetro sin argumentos**, no un keyword con valor.
  `remap units box` ✓, `remap x units box` ✗ (`Unknown change_box x argument: units`).
- **Las variables de caja no son variables**: `${ylo}` falla; usa `$(ylo)`,
  `$(xlo)`, `$(count(all))` dentro de expresiones inmediatas.
- **`delete_atoms ... compress no` rompe `velocity create`** (`Atom IDs must be
  consecutive for velocity create loop all`). Usa `compress yes`.
- **`compute stress/atom` devuelve −P·V, es decir σ·V.** La tensión es
  `σ = +1e-4·Σs_xx/(L·A0)` en GPa, **sin** signo menos. Compruébalo siempre
  con la pendiente elástica: si σ/ε sale igual a −E, tienes el signo cambiado.
- **`variable X index` se puede sobrescribir con `-var X ...`; `variable X equal`
  no.** Declara como `index` todo lo que quieras parametrizar desde `run.sh`.
- `fix print N "${var} ${var2}" file salida.txt screen no` sí evalúa las
  variables en cada invocación. El fichero va con buffer: durante la ejecución
  se queda atrás respecto al log, no te alarmes.
- Resultados clave-valor para post-proceso: `print "clave ${v}" file datos.txt`
  en el primero y `append` en los siguientes.

## Nombres de volcado: el fallo silencioso

`dump_modify ... pad 5` y pasos de más de 99 999 producen `hilo.100000` junto a
`hilo.99375`, y **ordenar los nombres como texto descoloca la trayectoria**
(`"100000" < "99375"`). Síntoma: deformaciones imposibles, deltas enormes
entre fotogramas, errores de reconstrucción gigantes.

Usa `pad 7` **y** ordena por número en el post-proceso:

```python
sorted(rutas, key=lambda r: int(r.name.split(".")[1]))
```

## Rendimiento: un `lmp` a la vez y pocos hilos

Medido hoy, mismo sistema, mismo día:

| Átomos | Hilos OMP | Resultado |
|---|---|---|
| 28 000 | 8 | 225 pasos/s (7,1 Mátomo·paso/s) |
| 5 000 | 10, con otros `lmp` compitiendo | **29 pasos/s** |
| 5 000 | 4, máquina libre | **859 pasos/s** |

Dos reglas: **al menos ~1500 átomos por hilo** (con menos, la sincronización
del paquete OPENMP se come todo), y **nunca dos simulaciones a la vez** — con
la carga por encima de los núcleos el rendimiento cae un factor 30, no un
factor 2. Si todo va inexplicablemente lento, mira `uptime`: desde el sandbox
no ves los procesos del host, pero sí la carga.

## Ejecutar y esperar

```bash
# lanzar en segundo plano (run_in_background del tool Bash, sin nohup ni &)
lmp -sf omp -pk omp 4 -in lammps/in.nanohilo -log datos/log.sim -screen none

# esperar a que acabe, sin encadenar sleeps (eso está bloqueado):
until grep -q "FIN traccion" datos/log.sim; do sleep 3; done
```

Pon un `print "FIN <lo que sea>"` al final del input para tener algo que
esperar. Para matar: **`pkill -x lmp`**; `pkill -f "in.nanohilo"` mata también
el shell del agente (el patrón casa con su propia línea de comandos) y pierdes
el comando con exit 143.

## Ensayo de tracción de un nanohilo

Receta que funcionó (`scripts/in.nanohilo.eam`):

- Caja `boundary p s s`: periódica en el eje, caras libres.
- `lattice fcc ${a0}` con el `a0` **relajado en la validación**, no el nominal.
- Equilibrado: minimización + `fix nvt` 20 ps a 300 K. Con NVT a longitud fija
  el hilo arranca con la tensión de las superficies libres (del orden de
  1-2 GPa en un hilo de 4 nm, y más cuanto más fino); si quieres partir de
  σ=0 usa `fix npt ... x 0.0 0.0 2.0`, que lo contrae ~1 %.
- Tracción: `fix deform 1 x erate ${erate} remap x` + `fix nvt`. `erate` en
  1/ps: 5·10⁹ s⁻¹ = 0.005. Paso de 2 fs.
- Tensión ingenieril con la **sección efectiva** `A0 = N·Ω/L0` (Ω = a0³/4 en
  fcc), no la nominal: en un hilo la sección es ambigua en medio plano
  atómico, y ese medio plano puede ser un 6 % de error.
- Estructura local: `compute cna/atom $(0.8536*v_a0)` → 1 fcc, 2 hcp (fallas
  de apilamiento), 3 bcc, 4 icosaédrico, 5 desconocido (superficie y desorden).

**Cuidado con el tamaño:** un nanohilo ⟨100⟩ de sección ≲ 4,5 nm **no hace
cuello: se reorienta a ⟨110⟩ por maclado**, y la tensión se vuelve negativa en
una meseta larguísima (el cristal quiere alargarse ~40 % solo, más deprisa de
lo que tú estiras). Es física real y conocida, pero si lo que quieres es una
rotura, o subes la sección o estiras mucho más. Con 2,9 nm de sección hizo
falta llegar a **ε = 1,2** para romper; a ε = 0,5 seguía entero.

## Terminado cuando

- [ ] La tabla de validación tiene valor calculado, referencia **con fuente** y
      error relativo, y el texto distingue ajuste de predicción.
- [ ] `E[100]` por dos caminos coincide en 4 cifras.
- [ ] El signo de la tensión está comprobado contra la pendiente elástica.
- [ ] Los volcados se ordenan por número de paso, no por nombre.
- [ ] La curva tensión-deformación empieza donde dices que empieza y el
      estado final es el que dices (compruébalo mirando el último volcado, no
      suponiendo: si pediste «hasta la rotura», verifica que hay hueco).
- [ ] `run.sh` regenera todo desde cero y los datos pesados están en
      `.gitignore`.

## Sin verificar

- MPI (`mpirun -np N lmp`) frente a OpenMP: se lanzó una vez y arrancó bien,
  pero no llegó a medirse. Con pocos átomos MPI suele escalar mejor.
- La receta de validación solo se ha probado en fcc con EAM; `in.falla` asume
  apilamiento fcc (111).
