import { simulaCampana } from './modelo/campana.js';
self.onmessage = async ({ data: { url, config, politicas } }) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudieron cargar los datos de clima.');
    const datos = await response.json(), resultados = [];
    for (let i = 0; i < politicas.length; i++) {
      resultados.push(simulaCampana(datos, config, politicas[i], (p) => self.postMessage({ tipo: 'progreso', valor: (i + p) / politicas.length })));
    }
    self.postMessage({ tipo: 'resultado', config, resultados, fuente: datos.fuente });
  } catch (error) { self.postMessage({ tipo: 'error', mensaje: error.message }); }
};
