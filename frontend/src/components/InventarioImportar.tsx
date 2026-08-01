import { useState, useCallback, DragEvent } from 'react';
import { api } from '../api/client';

/**
 * CARGA DEL CATÁLOGO DE ALMACÉN — arrastra el archivo y se llena solo.
 *
 * CÓMO ERA Y POR QUÉ CAMBIÓ
 * Antes: elegir archivo · pulsar "ver qué cambiaría" · pulsar "aplicar".
 * Tres gestos para una tarea que se hace de pie, con el almacenero esperando.
 * Ahora: soltar el archivo · confirmar. Dos.
 *
 * LO QUE NO SE QUITA, Y NO ES NEGOCIABLE
 * Que veas el resumen ANTES de aplicar. Un archivo con la columna de stock
 * desplazada reescribe 300 repuestos con números que no son, y eso no se
 * deshace. El almacén decide si un técnico sube al tren con el repuesto o sin
 * él. Lo que se quitó fue el CLIC, no la comprobación: la previsualización
 * dejó de ser un paso que hay que pedir y pasó a ser el resultado de soltar.
 *
 * EXCEL SÍ, PERO LEÍDO EN EL NAVEGADOR
 * Antes se exigía "guarda como CSV". Ya no. El .xlsx se lee AQUÍ y al servidor
 * solo viajan los datos:
 *   · Seguridad: las librerías de Excel han acumulado vulnerabilidades. En el
 *     navegador, un archivo preparado afecta a una pestaña; en el servidor,
 *     a la planta entera.
 *   · Precisión: un CSV es texto y hay que adivinar si "0.125" son 125 o
 *     0,125. Una celda de hoja de cálculo YA es un número.
 *
 * La librería se carga SOLO al soltar un .xlsx (importación dinámica), así que
 * quien nunca use esta pantalla no se descarga ni un byte de ella.
 */

const CAMPO_ES: Record<string, string> = {
  sapCode: 'Código SAP', name: 'Descripción', category: 'Categoría',
  brand: 'Marca', model: 'Modelo', unit: 'Unidad',
  warehouse: 'Almacén', currentStock: 'Stock actual', minStock: 'Stock mínimo',
};

// El .xls VIEJO (Excel 97-2003) NO se puede leer: es un formato binario
// distinto. La librería lo dice con XLS_FILE_NOT_SUPPORTED y aquí se traduce a
// algo accionable en vez de dejar un error técnico en pantalla.
const esExcel = (n: string) => /\.(xlsx|xlsm)$/i.test(n);
const esXlsViejo = (n: string) => /\.xls$/i.test(n);
const esCsv = (n: string) => /\.(csv|txt)$/i.test(n);

export default function InventarioImportar({ onImportado }: { onImportado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [grilla, setGrilla] = useState<{ encabezados: any[]; filas: any[][] } | null>(null);
  const [previa, setPrevia] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState('');
  // Nombre de las hojas del libro. Si hay más de una, se dice cuál se leyó:
  // elegir en silencio es como acertar por casualidad.
  const [hojas, setHojas] = useState<string[]>([]);
  const [hoja, setHoja] = useState('');

  function limpiar() {
    setPrevia(null); setResultado(null); setGrilla(null); setError('');
    setHojas([]); setHoja('');
  }

  const mensaje = (err: any) => {
    const m = err?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m || 'No se pudo leer el archivo.';
  };

  /** Soltar (o elegir) un archivo lo analiza SOLO. Ese es todo el cambio. */
  const procesar = useCallback(async (f: File) => {
    limpiar();
    setArchivo(f);

    if (esXlsViejo(f.name)) {
      setError(
        `"${f.name}" está en el formato viejo de Excel (.xls), que no se puede ` +
        'leer. Ábrelo en Excel y usa Guardar como → Libro de Excel (.xlsx).',
      );
      return;
    }
    if (!esExcel(f.name) && !esCsv(f.name)) {
      setError(`"${f.name}" no es una hoja de cálculo ni un CSV.`);
      return;
    }

    setCargando(true);
    try {
      if (esExcel(f.name)) {
        // Importación dinámica: la librería solo se descarga cuando de verdad
        // hace falta. Sin esto, el paquete de toda la aplicación crecería para
        // todos por una pantalla que usa una persona.
        // La subruta /browser es obligatoria: el paquete NO tiene exportación
        // raíz, así que import('read-excel-file') a secas no resuelve.
        const { default: leerXlsx } = await import('read-excel-file/browser');

        // Devuelve TODAS las hojas: [{ sheet, data }]. Los exportes de SAP
        // suelen traer la tabla y alguna hoja de notas, así que se toma la
        // primera y se DICE cuál, en vez de elegir en silencio.
        const hojas: any[] = await leerXlsx(f);
        if (!hojas.length) { setError('El archivo no tiene ninguna hoja.'); return; }

        setHojas(hojas.map((h) => h.sheet));
        const filas: any[][] = hojas[0].data || [];
        setHoja(hojas[0].sheet);
        if (!filas.length) { setError(`La hoja "${hojas[0].sheet}" está vacía.`); return; }

        const encabezados = filas[0];
        // Se descartan las filas totalmente vacías: Excel arrastra cientos al
        // final del archivo y ensuciarían el recuento de rechazadas.
        const datos = filas.slice(1).filter(
          (r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''),
        );
        setGrilla({ encabezados, filas: datos });

        const r = await api.post('/inventory/catalogo/previsualizar-grilla', {
          encabezados, filas: datos,
        });
        setPrevia(r.data);
      } else {
        const fd = new FormData(); fd.append('file', f);
        const r = await api.post('/inventory/catalogo/previsualizar', fd);
        setPrevia(r.data);
      }
    } catch (err: any) {
      // Errores propios de la librería, traducidos a algo que se pueda hacer.
      if (err?.code === 'XLS_FILE_NOT_SUPPORTED') {
        setError('Es el formato viejo de Excel (.xls). Guárdalo como .xlsx y vuelve a intentarlo.');
      } else if (err?.code === 'INVALID_ZIP' || err?.code === 'FILE_NOT_SUPPORTED') {
        setError('El archivo no es una hoja de cálculo válida o está dañado.');
      } else {
        setError(mensaje(err));
      }
    } finally {
      setCargando(false);
    }
  }, []);

  async function aplicar() {
    if (!previa) return;
    const total = (previa.nuevos || 0) + (previa.actualizados || 0);
    if (!window.confirm(
      `Se van a crear ${previa.nuevos} repuestos y actualizar ${previa.actualizados}.\n\n` +
      `El stock local quedará con los valores del archivo.\n\n¿Aplicar los ${total} cambios?`)) return;

    setAplicando(true);
    setError('');
    try {
      let r;
      if (grilla) {
        r = await api.post('/inventory/catalogo/importar-grilla', grilla);
      } else {
        const fd = new FormData(); fd.append('file', archivo as File);
        r = await api.post('/inventory/catalogo/importar', fd);
      }
      setResultado(r.data);
      setPrevia(null);
      setGrilla(null);
      onImportado();
    } catch (err: any) {
      setError(mensaje(err));
    } finally { setAplicando(false); }
  }

  function soltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setEncima(false);
    const f = e.dataTransfer.files?.[0];
    if (f) procesar(f);
  }

  const total = (previa?.nuevos || 0) + (previa?.actualizados || 0);

  return (
    <div>
      <div className="sign-note">
        El almacén de verdad está en <strong>SAP</strong>. Esto es un espejo que
        sirve para avisar cuando un material no alcanza. Súbelo cuando quieras
        refrescarlo: nada se guarda hasta que confirmes.
      </div>

      {/* ------------------------------------------------------ zona de soltar */}
      <div
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
        style={{
          marginTop: 12, padding: '32px 20px', textAlign: 'center',
          border: '2px dashed ' + (encima ? 'var(--steel)' : 'var(--border)'),
          borderRadius: 12,
          background: encima ? '#eef4ff' : 'var(--card)',
          transition: 'background .12s, border-color .12s',
        }}
      >
        {cargando ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>
              Leyendo {archivo?.name}…
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Se está analizando en tu equipo. Todavía no se ha guardado nada.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>
              Arrastra aquí el archivo de SAP
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Excel (.xlsx) o CSV. Se analiza solo, sin pulsar nada.
            </div>
            <label className="btn-mini" style={{ display: 'inline-block', marginTop: 12, cursor: 'pointer' }}>
              o elegir del equipo
              <input
                type="file"
                accept=".xlsx,.xlsm,.csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); }}
              />
            </label>
            {archivo && !previa && !resultado && !error && (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{archivo.name}</div>
            )}
          </>
        )}
      </div>

      {error && (
        <div style={{
          background: '#fdecec', border: '1px solid #f6c9c9', borderRadius: 8,
          padding: '10px 12px', marginTop: 12, fontSize: 13, color: '#991b1b',
        }}>{error}</div>
      )}

      {/* ------------------------------------------------------ previsualización */}
      {previa && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>
              {archivo?.name}
              {hoja && <span className="muted" style={{ fontWeight: 400 }}> · hoja "{hoja}"</span>}
              <span className="muted" style={{ fontWeight: 400 }}> · nada se ha guardado todavía</span>
            </div>
            {previa.filas?.length > 0 && (
              <button className="btn-primary" disabled={aplicando} onClick={aplicar}>
                {aplicando ? 'Aplicando…' : `Aplicar los ${total} cambios`}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
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

          {hojas.length > 1 && (
            <div className="sign-note" style={{ marginBottom: 10 }}>
              El libro tiene {hojas.length} hojas ({hojas.join(', ')}) y se leyó
              la primera, <b>{hoja}</b>. Si los datos están en otra, déjala como
              primera hoja en Excel y vuelve a soltarlo.
            </div>
          )}

          {Object.keys(previa.columnasDetectadas || {}).length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Columnas reconocidas</div>
              <div className="muted">
                {Object.entries(previa.columnasDetectadas).map(([campo, col]: any) =>
                  `${CAMPO_ES[campo] || campo} ← "${col}"`).join('  ·  ')}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Confirma que el sistema entendió tu archivo. Si una columna está
                mal reconocida, aquí se ve; después ya no.
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
                <div key={i}>Fila {r.linea}: {r.motivo}</div>
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
        </div>
      )}

      {/* ------------------------------------------------------------- resultado */}
      {resultado && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>Catálogo actualizado</div>
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
