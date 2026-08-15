import { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from './Dialogos';

/**
 * MATERIALES Y REEMPLAZO DE EQUIPO EN LA ORDEN.
 *
 * PARA QUÉ SIRVE
 * Antes el técnico escribía "30 m Cat6" en un cuadro de texto: el almacén nunca
 * se enteraba y nadie podía saber cuánto costaba mantener un equipo.
 *
 * Aquí se registra lo PREVISTO al preparar y lo USADO al cerrar. La diferencia
 * entre ambos es lo que dice si se está estimando bien.
 *
 * NO se descuenta stock: el almacén de verdad está en SAP. Si este sistema
 * descontara y SAP también, ninguno de los dos cuadraría nunca. El catálogo
 * local es un espejo que sirve para avisar, no para reemplazarlo.
 */

export default function OmMateriales({ wo, onClose }: { wo: any; onClose: () => void }) {
  const { confirmar, avisar, pedirTexto } = useDialogos();
  const { can } = useAuth();
  const [tab, setTab] = useState<'materiales' | 'reemplazo'>('materiales');

  const [items, setItems] = useState<any[]>([]);
  const [repuestos, setRepuestos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // alta de material
  const [nuevo, setNuevo] = useState<any>({ sparePartId: '', description: '', plannedQty: '', unit: '' });

  // reemplazo
  const [swaps, setSwaps] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [swap, setSwap] = useState<any>({ removedAssetId: '', installedAssetId: '', note: '' });
  const [resumen, setResumen] = useState<any>(null);
  const [firmando, setFirmando] = useState(false);

  const editable = wo.status !== 'CERRADA' && wo.status !== 'CANCELADA' && can('wo.update');

  // useCallback: todas las consultas cuelgan del id de la orden. Con la orden
  // como dependencia, abrir otra OM recarga sus propios materiales en vez de
  // mostrar los de la anterior.
  const cargar = useCallback(async () => {
    const [m, r, s, st] = await Promise.all([
      api.get(`/work-orders/${wo.id}/materials`).then((x) => x.data).catch(() => []),
      api.get('/inventory?pageSize=500').then((x) => x.data).catch(() => null),
      api.get(`/work-orders/${wo.id}/swaps`).then((x) => x.data).catch(() => []),
      api.get(`/work-orders/${wo.id}/stock-assets`).then((x) => x.data).catch(() => []),
    ]);
    // La respuesta trae ahora { items, resumen }: el resumen es lo que el
    // ingeniero mira de un vistazo (¿hay algo que firmar? ¿algo por devolver?).
    setItems(m?.items || []);
    setResumen(m?.resumen || null);
    setRepuestos(Array.isArray(r) ? r : r?.data || r?.items || []);
    setSwaps(s || []);
    setStock(st || []);
  }, [wo.id]);
  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  // ---- retiro de almacén (3D) -------------------------------------------

  /**
   * Un clic y una firma: sale TODO lo solicitado de una vez.
   * El servidor lo hace en una sola transacción, así que o salen todas las
   * líneas con su descuento de stock, o no sale ninguna.
   */
  async function generarRetiro() {
    if (!(await confirmar(
      `Se va a generar la salida de almacén de ${resumen?.solicitados} material(es) ` +
      `de la orden ${wo.code}.\n\n` +
      `El stock se descontará y quedará registrado a tu nombre.\n\n¿Confirmas?`))) return;
    setFirmando(true);
    try {
      const r = await api.post(`/work-orders/${wo.id}/materials/retiro`, {});
      if (r.data?.avisos?.length) {
        // No se bloquea por falta de stock: el catálogo es un espejo de SAP y
        // puede estar desactualizado. Se avisa y se deja constancia.
        await avisar(
          'Retiro generado, con avisos:\n\n' + r.data.avisos.join('\n') +
          '\n\nRegulariza esas cantidades en SAP.');
      }
      await cargar();
    } catch (err) { error(err); } finally { setFirmando(false); }
  }

  async function rechazar(item: any) {
    const motivo = await pedirTexto(
      `¿Por qué no se autoriza "${item.description}"?\n\n` +
      'Es obligatorio: sin motivo, el técnico volverá a pedir lo mismo la semana que viene.');
    if (motivo === null) return;
    try {
      await api.post(`/work-orders/${wo.id}/materials/${item.id}/rechazar`, { motivo });
      await cargar();
    } catch (err) { error(err); }
  }

  async function devolver() {
    if (!(await confirmar(
      `Se devolverán al almacén ${resumen?.porDevolver} unidad(es) que se retiraron y no se usaron.\n\n` +
      'Sin esto, el stock del sistema queda por debajo del real.\n\n¿Confirmas?'))) return;
    try {
      const r = await api.post(`/work-orders/${wo.id}/materials/devolucion`, {});
      await avisar(`Devuelto: ${r.data?.unidades ?? 0} unidad(es) en ${r.data?.devueltos ?? 0} línea(s).`);
      await cargar();
    } catch (err) { error(err); }
  }

  async function error(err: any) {
    const m = err?.response?.data?.message;
    await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo completar la acción.');
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post(`/work-orders/${wo.id}/materials`, {
        sparePartId: nuevo.sparePartId || undefined,
        description: nuevo.description?.trim() || undefined,
        plannedQty: nuevo.plannedQty === '' ? undefined : Number(nuevo.plannedQty),
        unit: nuevo.unit?.trim() || undefined,
      });
      setNuevo({ sparePartId: '', description: '', plannedQty: '', unit: '' });
      await cargar();
    } catch (err) { error(err); } finally { setGuardando(false); }
  }

  async function marcarUsado(item: any, valor: string) {
    try {
      await api.patch(`/work-orders/${wo.id}/materials/${item.id}`, {
        usedQty: valor === '' ? undefined : Number(valor),
      });
      await cargar();
    } catch (err) { error(err); }
  }

  async function quitar(item: any) {
    if (!(await confirmar(`¿Quitar "${item.description}" de la orden?`))) return;
    try { await api.delete(`/work-orders/${wo.id}/materials/${item.id}`); await cargar(); }
    catch (err) { error(err); }
  }

  async function registrarSwap(e: FormEvent) {
    e.preventDefault();
    if (!swap.removedAssetId && !swap.installedAssetId) {
      await avisar('Indica al menos el equipo retirado o el instalado.');
      return;
    }
    setGuardando(true);
    try {
      await api.post(`/work-orders/${wo.id}/swaps`, {
        removedAssetId: swap.removedAssetId || undefined,
        installedAssetId: swap.installedAssetId || undefined,
        note: swap.note?.trim() || undefined,
      });
      setSwap({ removedAssetId: '', installedAssetId: '', note: '' });
      await cargar();
    } catch (err) { error(err); } finally { setGuardando(false); }
  }

  const rep = repuestos.find((r) => r.id === nuevo.sparePartId);

  return (
    <Modal title={`Materiales y reemplazo · ${wo.code}`} onClose={onClose}>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={tab === 'materiales' ? 'tab active' : 'tab'}
          onClick={() => setTab('materiales')}>Materiales</button>
        <button className={tab === 'reemplazo' ? 'tab active' : 'tab'}
          onClick={() => setTab('reemplazo')}>Reemplazo de equipo</button>
      </div>

      {cargando && <div className="muted" style={{ fontSize: 12 }}>Cargando…</div>}

      {/* ------------------------------------------------------ MATERIALES */}
      {!cargando && tab === 'materiales' && (
        <>
          <div className="sign-note">
            Registra lo <strong>previsto</strong> al preparar y lo <strong>usado</strong> al
            cerrar. El stock no se descuenta aquí: el almacén de verdad está en SAP
            y este catálogo sirve para avisar si algo no alcanza.
          </div>

          {/* --------------------------------------------- barra del ingeniero */}
          {resumen && (resumen.hayQueRetirar || resumen.porDevolver > 0) && (
            <div style={{
              background: '#eef4ff', border: '1px solid #dbe6fb', borderLeft: '4px solid var(--steel)',
              borderRadius: 8, padding: '10px 12px', marginTop: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 12 }}>
                {resumen.hayQueRetirar && (
                  <div>
                    <b>{resumen.solicitados} material(es) esperando salida de almacén.</b>
                    {resumen.sinStock > 0 && (
                      <span style={{ color: '#b45309' }}>
                        {' '}· {resumen.sinStock} sin stock suficiente en el catálogo
                      </span>
                    )}
                  </div>
                )}
                {resumen.porDevolver > 0 && (
                  <div style={{ color: '#b45309' }}>
                    {resumen.porDevolver} unidad(es) retiradas y no usadas, sin devolver.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {resumen.hayQueRetirar && can('inventory.manage') && (
                  <button className="btn-primary" disabled={firmando} onClick={generarRetiro}>
                    {firmando ? 'Generando…' : 'Generar retiro de almacén'}
                  </button>
                )}
                {resumen.porDevolver > 0 && editable && (
                  <button className="btn-mini" onClick={devolver}>Devolver lo que sobró</button>
                )}
              </div>
            </div>
          )}

          {resumen?.hayQueRetirar && !can('inventory.manage') && (
            <div className="sign-note" style={{ marginTop: 8 }}>
              La salida de almacén la autoriza el ingeniero. Tu lista ya está
              pedida; no hace falta que hagas nada más.
            </div>
          )}

          {items.length > 0 ? (
            <table style={{ fontSize: 12, marginTop: 10 }}>
              <thead><tr>
                <th>Material</th><th>SAP</th><th>Previsto</th><th>Retirado</th>
                <th>Usado</th><th>Estado</th>{editable && <th></th>}
              </tr></thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.description}
                      {m.alerta && (
                        <div style={{ color: '#b45309', fontSize: 11 }}>{m.alerta}</div>
                      )}
                    </td>
                    <td className="muted">{m.sapCode || '—'}</td>
                    <td>{m.plannedQty ?? '—'} {m.unit || ''}</td>
                    <td>{m.withdrawnQty ?? <span className="muted">—</span>}</td>
                    <td>
                      {/* Lo usado solo se declara sobre lo que YA salió de
                          almacén: apuntar consumo de algo que no se retiró es
                          inventar. */}
                      {editable && m.status === 'RETIRADO' ? (
                        <input type="number" min={0} step="0.5" defaultValue={m.usedQty ?? ''}
                          style={{ width: 70 }}
                          onBlur={(e) => marcarUsado(m, e.target.value)} />
                      ) : (m.usedQty ?? '—')}
                    </td>
                    <td>
                      <EstadoMaterial m={m} />
                      {m.porDevolver > 0 && (
                        <div style={{ fontSize: 10, color: '#b45309' }}>
                          sobran {m.porDevolver}
                        </div>
                      )}
                    </td>
                    {editable && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {m.status === 'SOLICITADO' && (
                          <>
                            <button className="btn-mini" onClick={() => quitar(m)}>Quitar</button>
                            {can('inventory.manage') && (
                              <button className="btn-mini btn-danger" style={{ marginLeft: 4 }}
                                onClick={() => rechazar(m)}>No autorizo</button>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted" style={{ fontSize: 12, padding: '10px 0' }}>
              Sin materiales registrados en esta orden.
            </div>
          )}

          {editable && (
            <form onSubmit={agregar} style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Agregar material</div>

              <label>Del catálogo (con código SAP)</label>
              <select value={nuevo.sparePartId}
                onChange={(e) => setNuevo({ ...nuevo, sparePartId: e.target.value })}>
                <option value="">— no está catalogado —</option>
                {repuestos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.sapCode ? `${r.sapCode} · ` : ''}{r.name}
                    {r.currentStock != null ? ` (hay ${r.currentStock})` : ''}
                  </option>
                ))}
              </select>
              {rep && (
                <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
                  El catálogo refleja {rep.currentStock ?? '—'} {rep.unit || ''} en {rep.warehouse || 'almacén'}.
                </div>
              )}

              <label>Descripción {nuevo.sparePartId ? '(opcional)' : '(obligatoria)'}</label>
              <input value={nuevo.description}
                onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })}
                placeholder="Ej: 30 m de cable Cat6 blindado" />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label>Cantidad prevista</label>
                  <input type="number" min={0} step="0.5" value={nuevo.plannedQty}
                    onChange={(e) => setNuevo({ ...nuevo, plannedQty: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Unidad</label>
                  <input value={nuevo.unit}
                    onChange={(e) => setNuevo({ ...nuevo, unit: e.target.value })}
                    placeholder="rollo, unidad, metro" />
                </div>
              </div>

              <button className="btn" disabled={guardando} style={{ marginTop: 10 }}>
                {guardando ? 'Guardando…' : 'Agregar a la orden'}
              </button>
            </form>
          )}
        </>
      )}

      {/* ------------------------------------------------------- REEMPLAZO */}
      {!cargando && tab === 'reemplazo' && (
        <>
          <div className="sign-note">
            Cuando se cambia un equipo, sale uno y entra otro de almacén. El que
            entra <strong>hereda la ubicación y el gabinete</strong> del que sale;
            el que sale vuelve a <strong>almacén</strong>, no a baja: puede tener
            solo una falla reparable.
          </div>

          {swaps.length > 0 && (
            <table style={{ fontSize: 12, marginTop: 10 }}>
              <thead><tr><th>Salió</th><th>Entró</th><th>Nota</th></tr></thead>
              <tbody>
                {swaps.map((s) => (
                  <tr key={s.id}>
                    <td>{s.removedAsset?.assetCode || '—'}
                      {s.removedAsset && <div className="muted" style={{ fontSize: 10 }}>ahora en {s.removedAsset.status}</div>}
                    </td>
                    <td>{s.installedAsset?.assetCode || '—'}
                      {s.installedAsset && <div className="muted" style={{ fontSize: 10 }}>ahora {s.installedAsset.status}</div>}
                    </td>
                    <td className="muted">{s.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {editable && (
            <form onSubmit={registrarSwap} style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <label>Equipo retirado</label>
              <select value={swap.removedAssetId}
                onChange={(e) => setSwap({ ...swap, removedAssetId: e.target.value })}>
                <option value="">— ninguno —</option>
                {wo.asset && <option value={wo.asset.id}>{wo.asset.assetCode} (el de la orden)</option>}
              </select>

              <label>Equipo instalado (desde almacén)</label>
              <select value={swap.installedAssetId}
                onChange={(e) => setSwap({ ...swap, installedAssetId: e.target.value })}>
                <option value="">— ninguno —</option>
                {stock.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetCode} · {a.type}{a.model ? ` · ${a.model}` : ''}
                  </option>
                ))}
              </select>
              {!stock.length && (
                <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
                  No hay equipos en almacén. Se registran como activos con estado
                  «En stock».
                </div>
              )}

              <label>Nota</label>
              <input value={swap.note} onChange={(e) => setSwap({ ...swap, note: e.target.value })} />

              <button className="btn" disabled={guardando} style={{ marginTop: 10 }}>
                {guardando ? 'Registrando…' : 'Registrar reemplazo'}
              </button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}

/**
 * Etiqueta de estado de una línea de material.
 * Se ve el estado en la propia fila y no solo en un contador: el técnico tiene
 * que saber de un vistazo qué puede ya llevarse y qué sigue esperando firma.
 */
function EstadoMaterial({ m }: { m: any }) {
  const mapa: Record<string, { t: string; c: string; f: string }> = {
    SOLICITADO: { t: 'Pedido',    c: '#92400e', f: '#fff4e5' },
    RETIRADO:   { t: 'Retirado',  c: '#166534', f: '#e7f7ee' },
    DEVUELTO:   { t: 'Cerrado',   c: '#2e5496', f: '#eef4ff' },
    RECHAZADO:  { t: 'No autorizado', c: '#991b1b', f: '#fdecec' },
  };
  const e = mapa[m.status] || mapa.SOLICITADO;
  return (
    <>
      <span style={{
        background: e.f, color: e.c, border: '1px solid ' + e.c + '33',
        borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600,
      }}>{e.t}</span>
      {m.status === 'RECHAZADO' && m.rejectedReason && (
        <div style={{ fontSize: 10, color: '#991b1b', marginTop: 2 }}>{m.rejectedReason}</div>
      )}
    </>
  );
}
