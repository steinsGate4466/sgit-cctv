import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';

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

  const editable = wo.status !== 'CERRADA' && wo.status !== 'CANCELADA' && can('wo.update');

  async function cargar() {
    const [m, r, s, st] = await Promise.all([
      api.get(`/work-orders/${wo.id}/materials`).then((x) => x.data).catch(() => []),
      api.get('/inventory?pageSize=500').then((x) => x.data).catch(() => null),
      api.get(`/work-orders/${wo.id}/swaps`).then((x) => x.data).catch(() => []),
      api.get(`/work-orders/${wo.id}/stock-assets`).then((x) => x.data).catch(() => []),
    ]);
    setItems(m || []);
    setRepuestos(Array.isArray(r) ? r : r?.data || r?.items || []);
    setSwaps(s || []);
    setStock(st || []);
  }
  useEffect(() => { cargar().finally(() => setCargando(false)); }, [wo.id]);

  function error(err: any) {
    const m = err?.response?.data?.message;
    window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo completar la acción.');
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
    if (!window.confirm(`¿Quitar "${item.description}" de la orden?`)) return;
    try { await api.delete(`/work-orders/${wo.id}/materials/${item.id}`); await cargar(); }
    catch (err) { error(err); }
  }

  async function registrarSwap(e: FormEvent) {
    e.preventDefault();
    if (!swap.removedAssetId && !swap.installedAssetId) {
      window.alert('Indica al menos el equipo retirado o el instalado.');
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

          {items.length > 0 ? (
            <table style={{ fontSize: 12, marginTop: 10 }}>
              <thead><tr><th>Material</th><th>SAP</th><th>Previsto</th><th>Usado</th>{editable && <th></th>}</tr></thead>
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
                    <td>
                      {editable ? (
                        <input type="number" min={0} step="0.5" defaultValue={m.usedQty ?? ''}
                          style={{ width: 70 }}
                          onBlur={(e) => marcarUsado(m, e.target.value)} />
                      ) : (m.usedQty ?? '—')}
                    </td>
                    {editable && (
                      <td><button className="btn-mini" onClick={() => quitar(m)}>Quitar</button></td>
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
