/**
 * Comprueba, sin navegador, que el parser del visor lee el binario .nw
 * exactamente igual que lo escribio el exportador de Python.
 *
 *   node test/formato.mjs ../md/nanohilo-cu/salida/nanohilo-cu.nw \
 *                         ../md/nanohilo-cu/datos/control.json
 */
import { readFileSync } from 'node:fs'
import { parsea } from '../src/nanohilo.js'

const [ruta, rutaControl] = process.argv.slice(2)
const buf = readFileSync(ruta)
const datos = parsea(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const control = JSON.parse(readFileSync(rutaControl, 'utf8'))

let fallos = 0
const comprueba = (nombre, obtenido, esperado, tolerancia = 0) => {
  const bien = Math.abs(obtenido - esperado) <= tolerancia
  if (!bien) fallos++
  console.log(`${bien ? 'ok  ' : 'FALLA'} ${nombre}: ${obtenido} (esperado ${esperado})`)
}

comprueba('numero de atomos', datos.nAtomos, control.nAtomos)
comprueba('numero de fotogramas', datos.nFrames, control.nFrames)

for (const m of control.muestras) {
  const base = (m.frame * datos.nAtomos + m.atomo) * 3
  comprueba(`x[f${m.frame},a${m.atomo}]`, datos.pos[base], m.x, 2e-3)
  comprueba(`y[f${m.frame},a${m.atomo}]`, datos.pos[base + 1], m.y, 2e-3)
  comprueba(`z[f${m.frame},a${m.atomo}]`, datos.pos[base + 2], m.z, 2e-3)
  comprueba(`cna[f${m.frame},a${m.atomo}]`,
    datos.tipos[m.frame * datos.nAtomos + m.atomo], m.tipo)
}

console.log(fallos === 0 ? '\ntodo correcto' : `\n${fallos} comprobaciones fallidas`)
process.exit(fallos === 0 ? 0 : 1)
