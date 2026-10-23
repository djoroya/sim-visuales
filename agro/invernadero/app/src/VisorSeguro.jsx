import { Component } from 'react';
export class VisorSeguro extends Component {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  render() {
    if (!this.state.fallo) return this.props.children;
    return <div className="fallo-visor" role="status"><strong>Vista 3D no disponible</strong><p>El simulador, los controles y los grafos siguen funcionando.</p><button onClick={() => location.reload()}>Recargar visor</button></div>;
  }
}
