/**
 * Barra de tiempo: reproducir/pausar, arrastrar para ir a cualquier instante
 * y lectura del tiempo simulado y la deformación del fotograma actual.
 */

const ICONO_PLAY = 'M8 5v14l11-7z'
const ICONO_PAUSA = 'M6 5h4v14H6zm8 0h4v14h-4z'

export function montaControles(padre, escena, meta) {
  const caja = document.createElement('div')
  caja.className = 'nw-controles'

  const boton = document.createElement('button')
  boton.type = 'button'
  boton.className = 'nw-boton'
  boton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="${ICONO_PLAY}"></path></svg>`
  const icono = boton.querySelector('path')

  const barra = document.createElement('input')
  barra.type = 'range'
  barra.className = 'nw-barra'
  barra.min = '0'
  barra.max = '1000'
  barra.value = '0'
  barra.setAttribute('aria-label', 'instante de la simulación')

  const lectura = document.createElement('div')
  lectura.className = 'nw-lectura'
  const tiempo = document.createElement('span')
  const deform = document.createElement('span')
  deform.className = 'nw-eps'
  lectura.append(tiempo, deform)

  caja.append(boton, barra, lectura)
  padre.appendChild(caja)

  const nFrames = meta.fotogramas ?? escena.nFrames
  const tMax = meta.t_ps ? meta.t_ps[meta.t_ps.length - 1] : 0
  const decimales = tMax >= 100 ? 0 : 1

  function pinta(indice, avance) {
    const t = meta.t_ps?.[indice] ?? 0
    const e = meta.eps?.[indice] ?? 0
    tiempo.textContent = `${t.toFixed(decimales)} ps`
    deform.textContent = `ε = ${(e * 100).toFixed(1)} %`
    if (!arrastrando) barra.value = String(Math.round(avance * 1000))
    // el relleno azul de la barra se pinta con un degradado
    barra.style.setProperty('--avance', `${avance * 100}%`)
  }

  function ponIcono(corriendo) {
    icono.setAttribute('d', corriendo ? ICONO_PAUSA : ICONO_PLAY)
    boton.setAttribute('aria-label', corriendo ? 'pausar' : 'reproducir')
  }

  let arrastrando = false
  boton.addEventListener('click', () => escena.alterna())
  barra.addEventListener('pointerdown', () => {
    arrastrando = true
    if (escena.corriendo) {
      escena.pausa()
      barra.dataset.reanudar = '1'
    }
  })
  const soltar = () => {
    if (!arrastrando) return
    arrastrando = false
    if (barra.dataset.reanudar) {
      delete barra.dataset.reanudar
      escena.reproduce()
    }
  }
  barra.addEventListener('pointerup', soltar)
  barra.addEventListener('pointercancel', soltar)
  barra.addEventListener('input', () => escena.irA(Number(barra.value) / 1000))

  escena.alCambiarEstado = ponIcono
  ponIcono(escena.corriendo)
  const corta = escena.suscribe(({ indice, avance }) => pinta(indice, avance))

  return {
    nFrames,
    destruye() { corta(); caja.remove() },
  }
}
