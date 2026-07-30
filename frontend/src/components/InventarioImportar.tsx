import { useState } from 'react';
import { api } from '../api/client';

/**
 * IMPORTACIÓN DEL CATÁLOGO DESDE SAP.
 *
 * DOS PASOS A PROPÓSITO: primero se VE, después se aplica.
 * Subir un archivo mal exportado y descubrirlo tras sobrescribir 300 repuestos
 * sería difícil de revertir. La previsualización no escribe nada.
 *
 * SE ACEPTA CSV Y NO .XLSX
 * Leer Excel exige una librería, y las de Excel han acumulado vulnerabilidades
 * —el tipo de dependencia que ya rompió el backend aquí con un npm audit fix—.
 * En Excel es "Guardar como CSV": un clic al exportar, a cambio de no cargar esa
 * dependencia en el servidor para siempre.
 */

const CAMPO_ES: Record<string, string> = {
  sapCode: 'Código SAP', name: 'Descripción', category: 'Categoría',
  brand: 'Marca', model: 'Modelo', unit: 'Unidad',
  warehouse: 'Almacén', currentStock: 'Stock actual', minStock: 'Stock mínimo',
};

export default function InventarioImportar({ onImportado }: { onImportado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [trabajando, setTrabajando] = useState(false);

  function limpiar() { setPrevia(null); setResultado(null); }

  async function previsualizar() {
    if (!archivo) { window.alert('Elige el archivo CSV exportado de SAP.'); return; }
    setTrabajando(true); limpiar();
    try {
      const fd = new FormData(); fd.append('file', archivo);
      const r = await api.post('/inventory/catalogo/previsualizar', fd);
      setPrevia(r.data);
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo leer el archivo.');
    } finally { setTrabajando(false); }
  }

  async function aplicar() {
    if (!archivo || !previa) return;
    const total = (previa.nuevos || 0) + (previa.actualizados || 0);
    if (!window.confirm(
      `Se van a crear ${previa.nuevos} repuestos y actualizar ${previa.actualizados}.\n\n` +
      `El stock local quedará con los valores de SAP.\n\n¿Aplicar los ${total} cambios?`)) return;

    setTrabajando(true);
    try {
      const fd = new FormData(); fd.append('file', archivo);
      const r = await api.post('/inventory/catalogo/importar', fd);
      setResultado(r.data);
      setPrevia(null);
      onImportado();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo importar.');
    } finally { setTrabajando(false); }
  }

  return (
    <div>
      <div className="sign-note">
        El almacén de verdad está en <strong>SAP</strong>. Este catálogo es un
        espejo que sirve para avisar cuando un material no alcanza —no reemplaza a
        SAP ni descuenta por su cuenta—. Súbelo cada vez que quieras refrescarlo.
      </div>

      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <label>Archivo CSV exportado de SAP</label>
        <input type="file" accept=".csv,text/csv,text/plain"
          onChange={(e) => { setArchivo(e.target.files?.[0] || null); limpiar(); }} />
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          En Excel: <strong>Archivo → Guardar como → CSV</strong>. Se reconocen
          encabezados en español o inglés (Material, Texto breve, Libre utilización,
          Almacén, Punto pedido…) y el separador se detecta solo.
        </div>

        <button className="btn" style={{ marginTop: 12 }} disabled={!archivo || trabajando}
          onClick={previsualizar}>
          {trabajando ? 'Leyendo…' : '1 · Ver qué cambiaría'}
        </button>
      </div>

      {/* ------------------------------------------------ previsualización */}
      {previa && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Vista previa — nada se ha guardado</div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              { t: 'Filas leídas', v: previa.filas?.length || 0 },
              { t: 'Se crearían', v: previa.nuevos || 0, c: '#16a34a' },
              { t: 'Se actualizarían', v: previa.actualizados || 0, c: '#2563eb' },
              { t: 'Rechazadas', v: previa.rechazadas?.length || 0, c: previa.rechazadas?.length ? '#dc2626' : undefined },
            ].map((k) => (
              <div key={k.t} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', minWidth: 110 }}>
                <div className="muted" style={{ fontSize: 11 }}>{k.t}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {Object.keys(previa.columnasDetectadas || {}).length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Columnas reconocidas</div>
              <div className="muted">
                {Object.entries(previa.columnasDetectadas).map(([campo, col]: any) =>
                  `${CAMPO_ES[campo] || campo} ← "${col}"`).join('  ·  ')}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Confirma que el sistema entendió tu archivo antes de aplicar.
              </div>
            </div>
          )}

          {previa.rechazadas?.length > 0 && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6,
              padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#991b1b',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {previa.rechazadas.length} fila(s) no se pueden importar
              </div>
              {previa.rechazadas.slice(0, 8).map((r: any, i: number) => (
                <div key={i}>Línea {r.linea}: {r.motivo}</div>
              ))}
              {previa.rechazadas.length > 8 && <div>y {previa.rechazadas.length - 8} más.</div>}
            </div>
          )}

          {previa.cambios?.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Cambios de stock</div>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <table style={{ fontSize: 12 }}>
                  <thead><tr><th>SAP</th><th>Descripción</th><th>Acción</th><th>Antes</th><th>Después</th><th>Dif.</th></tr></thead>
                  <tbody>
                    {previa.cambios.map((c: any) => (
                      <tr key={c.sapCode}>
                        <td style={{ fontWeight: 600 }}>{c.sapCode}</td>
                        <td>{c.name}</td>
                        <td className="muted">{c.accion}</td>
                        <td>{c.stockAntes ?? '—'}</td>
                        <td>{c.stockDespues}</td>
                        <td style={{
                          fontWeight: 700,
                          color: c.diferencia == null ? undefined : c.diferencia < 0 ? '#dc2626' : '#16a34a',
                        }}>
                          {c.diferencia == null ? '—' : (c.diferencia > 0 ? '+' : '') + c.diferencia}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {previa.filas?.length > 0 && (
            <button className="btn" style={{ marginTop: 12 }} disabled={trabajando} onClick={aplicar}>
              {trabajando ? 'Aplicando…' : '2 · Aplicar los cambios'}
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- resultado */}
      {resultado && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>Importación aplicada</div>
          <div style={{ fontSize: 13 }}>
            {resultado.creados} creados · {resultado.actualizados} actualizados
            {resultado.fallidos?.length ? ` · ${resultado.fallidos.length} con error` : ''}
          </div>
          {resultado.fallidos?.length > 0 && (
            <div style={{ fontSize: 12, color: '#991b1b', marginTop: 6 }}>
              {resultado.fallidos.map((f: any, i: number) => (
                <div key={i}>{f.sapCode}: {f.motivo}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
