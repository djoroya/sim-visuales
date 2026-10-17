/**
 * Curva tensión-deformación sincronizada con la animación, con Plotly.
 *
 * Plotly entra por `import()` dinámico, igual que three: queda en su propio
 * trozo y no se descarga si no hay gráfica. Aun así es la pieza más pesada de
 * todo el visor (ver README), así que se carga la última, cuando la animación
 * ya está en marcha.
 *
 * Tres trazas: la curva completa en gris, el tramo recorrido en azul y el
 * punto del instante actual. Al avanzar solo se reescriben las dos últimas
 * con `Plotly.restyle`, que no rehace el dibujo entero.
 */

const AZUL = '#14519b'
const GRIS = '#c2ccd8'
const TEXTO = '#5b6b7b'

export async function montaGrafica(padre, escena, meta) {
  const curva = meta?.curva
  if (!curva || !curva.eps?.length) return { destruye() {} }

  const caja = document.createElement('div')
  caja.className = 'nw-grafica'
  padre.appendChild(caja)

  const { default: Plotly } = await import('plotly.js-basic-dist-min')

  const ex = curva.eps.map((v) => v * 100)
  const sy = curva.sigma

  const comun = { type: 'scatter', mode: 'lines', hoverinfo: 'skip' }
  const trazas = [
    { ...comun, x: ex, y: sy, line: { color: GRIS, width: 1.6 }, name: 'curva' },
    { ...comun, x: [], y: [], line: { color: AZUL, width: 2.4 }, name: 'recorrido' },
    {
      type: 'scatter', mode: 'markers', x: [], y: [], name: 'ahora',
      marker: { color: AZUL, size: 9, line: { color: '#fff', width: 2 } },
      hovertemplate: 'ε = %{x:.1f} %<br>σ = %{y:.2f} GPa<extra></extra>',
    },
  ]

  const ejes = {
    color: TEXTO,
    gridcolor: '#e8edf3',
    zerolinecolor: '#d8e0e9',
    linecolor: '#d8e0e9',
    ticks: 'outside',
    ticklen: 4,
    tickcolor: '#d8e0e9',
    automargin: true,
  }
  const diseno = {
    margin: { l: 56, r: 12, t: 12, b: 46 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    showlegend: false,
    font: {
      family: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      size: 12, color: TEXTO,
    },
    xaxis: { ...ejes, title: { text: 'deformación ε (%)', standoff: 10 } },
    yaxis: { ...ejes, title: { text: 'tensión σ (GPa)', standoff: 8 } },
    hovermode: 'closest',
  }

  await Plotly.newPlot(caja, trazas, diseno, {
    displayModeBar: false, responsive: true, staticPlot: false,
  })

  // --- seguimiento ----------------------------------------------------------
  // La deformación se interpola entre fotogramas: si se tomara la del
  // fotograma redondeado, el punto avanzaría a saltos de 9 por segundo.
  const epsFrames = meta.eps || []
  const nFrames = epsFrames.length || 1
  let ultimoCorte = -1
  let ultimoDibujo = 0

  function corteDe(epsActual) {
    let i = 0
    while (i < curva.eps.length && curva.eps[i] <= epsActual) i++
    return Math.max(1, i)
  }

  function actualiza(avance, forzar) {
    const u = avance * (nFrames - 1)
    const i = Math.min(Math.floor(u), nFrames - 1)
    const t = u - i
    const e = (epsFrames[i] ?? 0) * (1 - t) + (epsFrames[i + 1] ?? epsFrames[i] ?? 0) * t
    const corte = corteDe(e)
    if (corte === ultimoCorte) return
    // redibujar la curva 60 veces por segundo no aporta nada y cuesta;
    // 20 por segundo ya se ve continuo
    const ahora = performance.now()
    if (!forzar && ahora - ultimoDibujo < 50) return
    ultimoDibujo = ahora
    ultimoCorte = corte
    Plotly.restyle(caja, {
      x: [ex.slice(0, corte), [ex[corte - 1]]],
      y: [sy.slice(0, corte), [sy[corte - 1]]],
    }, [1, 2])
  }

  const corta = escena.suscribe(({ avance }) => actualiza(avance))
  actualiza(0, true)

  return {
    destruye() {
      corta()
      Plotly.purge(caja)
      caja.remove()
    },
  }
}
