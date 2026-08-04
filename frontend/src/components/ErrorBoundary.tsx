import { Component, ErrorInfo, ReactNode } from 'react';

/**
 * LA RED QUE FALTABA.
 *
 * Sin esto, UN SOLO ERROR al pintar cualquier pantalla desmonta la
 * aplicación entera y deja la PÁGINA EN BLANCO. Sin mensaje, sin menú, sin
 * nada. Y en blanco no se distingue un fallo de "todavía está cargando" ni
 * de "esta función no existe": el usuario recarga, prueba otra vez, y acaba
 * llamando por teléfono.
 *
 * Es lo primero que debería haber tenido esta aplicación y no lo tenía.
 *
 * Va en DOS niveles a propósito:
 *   · alrededor del contenido, dentro del armazón — así el menú sobrevive y
 *     se puede ir a otra pantalla sin recargar;
 *   · alrededor de todo, por si lo que falla es el propio armazón.
 *
 * Y ENSEÑA EL ERROR. No para que el técnico lo entienda, sino para que pueda
 * copiarlo y mandarlo: sin ese texto, diagnosticar esto es adivinar.
 */
interface Props { children: ReactNode; donde?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola con la pila de componentes: es lo que dice EN QUÉ
    // pantalla y en qué punto reventó.
    // eslint-disable-next-line no-console
    console.error('[SGIT] Fallo al pintar', this.props.donde || '', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const detalle = [
      this.props.donde ? `Pantalla: ${this.props.donde}` : '',
      `Error: ${error.message}`,
      `Ruta: ${location.pathname}`,
      `Momento: ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n');

    return (
      <div className="card vacio" style={{ margin: 16 }}>
        <h3>Esta pantalla no se pudo mostrar</h3>
        <p>
          Ha fallado al dibujarse. El resto del sistema sigue funcionando: usa
          el menú para ir a otro sitio.
        </p>

        <div style={{
          fontFamily: 'monospace', fontSize: 11.5, textAlign: 'left',
          background: '#f4f6fa', border: '1px solid var(--border)',
          borderRadius: 8, padding: 12, margin: '16px auto 0', maxWidth: 560,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {detalle}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn-mini" onClick={() => navigator.clipboard?.writeText(detalle)}>
            Copiar el detalle
          </button>
          {/* Reintentar SIN recargar: muchas veces el fallo viene de datos de
              una carga concreta y al volver a montar la pantalla funciona. */}
          <button className="btn-mini" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
          <button className="btn-primary" onClick={() => location.reload()}>
            Recargar la página
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          Si te vuelve a pasar, copia el detalle y mándalo: con ese texto se
          sabe exactamente qué falló. Sin él, hay que adivinar.
        </p>
      </div>
    );
  }
}
