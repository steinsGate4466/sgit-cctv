/**
 * ESQUELETO DE CARGA.
 *
 * "Cargando…" centrado en una pantalla en blanco tiene dos problemas:
 *  1. No dice NADA de lo que va a llegar, así que la espera se percibe más
 *     larga de lo que es. Con la red de planta, eso son varios segundos de
 *     alguien mirando un vacío y dudando si el sistema se colgó.
 *  2. Cuando entran los datos, la pantalla PEGA UN SALTO y hay que volver a
 *     situarse. Si el esqueleto tiene la forma de lo que llega, no hay salto.
 *
 * Se usa la forma real de cada pantalla: indicadores arriba, tablas debajo.
 */

/** Bloques de indicadores + paneles: sirve para el tablero y Estado por Tren. */
export function EsqueletoTablero({ kpis = 4, paneles = 2 }: { kpis?: number; paneles?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-solo">Cargando información…</span>
      <div className="esq esq-linea" style={{ width: 220, height: 20, marginBottom: 18 }} />
      <div className="kpi-grid">
        {Array.from({ length: kpis }, (_, i) => <div key={i} className="esq esq-kpi" />)}
      </div>
      <div className="panel-grid">
        {Array.from({ length: paneles }, (_, i) => <div key={i} className="esq esq-panel" />)}
      </div>
    </div>
  );
}

/** Una tabla en camino: cabecera y filas del alto real. */
export function EsqueletoTabla({ filas = 6 }: { filas?: number }) {
  return (
    <div className="card" style={{ padding: 16 }} aria-busy="true" aria-live="polite">
      <span className="sr-solo">Cargando información…</span>
      <div className="esq esq-linea" style={{ width: 160, height: 14, marginBottom: 16 }} />
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
          <div className="esq esq-linea" style={{ width: '22%', margin: 0 }} />
          <div className="esq esq-linea" style={{ flex: 1, margin: 0 }} />
          <div className="esq esq-linea" style={{ width: '15%', margin: 0 }} />
        </div>
      ))}
    </div>
  );
}
