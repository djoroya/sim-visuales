/**
 * Lectura del binario .nw. Va aparte del visor y no depende de three, para
 * poder probarlo en Node sin instalar nada.
 */

/**
 * Lee el binario .nw (formato NWIRE2): el primer fotograma viene con las
 * posiciones cuantizadas a 16 bits y los demas como incrementos de un byte
 * respecto al anterior. Se exporta para poder comprobarlo sin navegador.
 */
export function parsea(buffer) {
  const vista = new DataView(buffer)
  const magia = new TextDecoder().decode(new Uint8Array(buffer, 0, 6))
  if (magia !== 'NWIRE2') throw new Error('fichero de trayectoria no valido')

  const nAtomos = vista.getUint32(8, true)
  const nFrames = vista.getUint16(12, true)
  const origen = [16, 20, 24].map((o) => vista.getFloat32(o, true))
  const paso = vista.getFloat32(28, true)
  const lx0 = vista.getFloat32(32, true)
  const lxFin = vista.getFloat32(36, true)

  let p = 40
  const eps = new Float32Array(buffer.slice(p, p + 4 * nFrames))
  p += 4 * nFrames

  const bytes = new Uint8Array(buffer)
  const pos = new Float32Array(nFrames * nAtomos * 3)
  const q = new Int32Array(nAtomos * 3)

  // fotograma 0: plano de bytes altos y plano de bajos, por componente
  for (let c = 0; c < 3; c++) {
    const alto = p
    const bajo = p + nAtomos
    p += 2 * nAtomos
    for (let i = 0; i < nAtomos; i++) {
      const v = bytes[alto + i] * 256 + bytes[bajo + i]
      q[i * 3 + c] = v
      pos[i * 3 + c] = origen[c] + v * paso
    }
  }

  // resto de fotogramas: incrementos con signo sobre el anterior
  const deltas = new Int8Array(buffer, p, (nFrames - 1) * nAtomos * 3)
  let d = 0
  for (let f = 1; f < nFrames; f++) {
    const base = f * nAtomos * 3
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < nAtomos; i++) {
        const k = i * 3 + c
        q[k] += deltas[d++]
        pos[base + k] = origen[c] + q[k] * paso
      }
    }
  }
  p += deltas.length

  const tipos = new Uint8Array(buffer, p, nFrames * nAtomos)
  // tamano de la caja que ocupa la trayectoria entera, para encuadrar
  const tam = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    let mn = Infinity
    let mx = -Infinity
    for (let k = c; k < pos.length; k += 3) {
      if (pos[k] < mn) mn = pos[k]
      if (pos[k] > mx) mx = pos[k]
    }
    tam[c] = mx - mn
  }

  return { nAtomos, nFrames, origen, paso, lx0, lxFin, tam, eps, pos, tipos }
}
