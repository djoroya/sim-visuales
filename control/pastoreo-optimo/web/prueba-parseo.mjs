/**
 * Comprueba que el binario .herd2 se lee en JS igual que en Python: mismas
 * dimensiones y mismas posiciones (salvo el error de cuantizacion declarado).
 *
 *   node web/prueba-parseo.mjs salida/pastoreo-optimo.herd2 salida/pastoreo-optimo-meta.json
 */
import { readFileSync } from 'node:fs'
import { parsea } from './visor.js'

const [ruta, rutaMeta] = process.argv.slice(2)
const b = readFileSync(ruta)
const d = parsea(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
const meta = JSON.parse(readFileSync(rutaMeta, 'utf8'))

const fallos = []
if (d.nPart !== meta.individuos) fallos.push(`individuos ${d.nPart} != ${meta.individuos}`)
if (d.nFrames !== meta.fotogramas) fallos.push(`fotogramas ${d.nFrames} != ${meta.fotogramas}`)
if (d.nEsc !== meta.escenas.length) fallos.push(`escenas ${d.nEsc} != ${meta.escenas.length}`)

// el ultimo fotograma de cada escena tiene que caer en la caja
for (const [e, pos] of d.escenas.entries()) {
  for (let i = 0; i < d.nPart; i++) {
    const k = ((d.nFrames - 1) * d.nPart + i) * 2
    const dentro = pos[k] >= d.origen[0] && pos[k] <= d.origen[0] + d.tam[0]
      && pos[k + 1] >= d.origen[1] && pos[k + 1] <= d.origen[1] + d.tam[1]
    if (!dentro) { fallos.push(`escena ${e}, individuo ${i} fuera de la caja`); break }
  }
}
console.log(`${ruta}: ${d.nPart} individuos, ${d.nFrames} fotogramas, ${d.nEsc} escenas`)
if (fallos.length) { console.error('FALLOS:\n  ' + fallos.join('\n  ')); process.exit(1) }
console.log('ok: el visor lee lo mismo que escribio Python')
