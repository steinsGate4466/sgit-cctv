import { useEffect, useState, FormEvent, ReactNode } from 'react';
import { api } from '../api/client';
import Paginacion from '../components/Paginacion';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import { useAuth } from '../auth/AuthContext';
import InventarioHerramientas from '../components/InventarioHerramientas';
import InventarioImportar from '../components/InventarioImportar';
import { useDialogos } from '../components/Dialogos';
import { fecha } from '../formato';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts';

const MOVES = ['INGRESO', 'RETIRO', 'AJUSTE'];

function Kpi({ label, value, cls, hint }: { label: string; value: ReactNode; cls?: string; hint?: string }) {
  return (
    <div className={'kpi ' + (cls || '')}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function stockBadge(r: any) {
  if (r.outOfStock) return <span className="badge FUERA_SERVICIO">Sin stock</span>;
  if (r.lowStock) return <span className="badge" style={{ background: '#fde68a', color: '#92400e' }}>Bajo mínimo</span>;
  return <span className="badge OPERATIVO">OK</span>;
}

export default function Inventory() {
  const { confirmar, avisar } = useDialogos();
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Tres cosas distintas conviven aquí: repuestos que se consumen, herramientas
  // que se prestan, y la carga del catálogo desde SAP. Se separan en pestañas
  // porque mezclarlas en una sola pantalla las hace ilegibles.
  const [tab, setTab] = useState<'repuestos' | 'herramientas' | 'importar'>('repuestos');

  const [fq, setFq] = useState('');
  const [fCat, setFCat] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [meta, setMeta] = useState<any>(null);
  // La página vuelve a 1 al cambiar de filtro: si no, se filtra estando en la
  // página 7 y sale vacío, que se lee como "no hay repuestos" cuando en
  // realidad hay dos, en la página 1.
  const [pagina, setPagina] = useState(1);

  const [form, setForm] = useState<any>(null);      // crear/editar
  const [saving, setSaving] = useState(false);
  const [checkRow, setCheckRow] = useState<any>(null);
  const [chk, setChk] = useState<any>({ countedQty: '', note: '' });
  const [moveRow, setMoveRow] = useState<any>(null);
  const [mv, setMv] = useState<any>({ type: 'RETIRO', quantity: '', sapCode: '', reason: '' });
  const [compat, setCompat] = useState<any>(null);   // detalle/compatibilidad
  const [linkAssetId, setLinkAssetId] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (fq.trim()) params.set('q', fq.trim());
    if (fCat) params.set('category', fCat);
    if (onlyLow) params.set('lowStock', 'true');
    params.set('page', String(pagina));
    params.set('pageSize', '50');
    const [list, sum, ast] = await Promise.all([
      api.get('/inventory?' + params.toString()).then((r) => r.data).catch(() => null),
      api.get('/inventory/summary').then((r) => r.data).catch(() => null),
      api.get('/assets/options').then((r) => r.data).catch(() => []),
    ]);
    // Ahora llega { items, total, page, pages }. Se acepta también un array
    // por si el backend todavía es el anterior: el despliegue va en dos pasos.
    setRows(Array.isArray(list) ? list : list?.items || []);
    setMeta(Array.isArray(list) ? null : list);
    setSummary(sum);
    setAssets(ast || []);
    setLoading(false);
  }
  // ANTES la carga era única al montar y los filtros NO recargaban: se
  // marcaba "solo faltantes" y no pasaba nada hasta pulsar Enter en el
  // buscador. Con el filtro ya en el servidor (y con paginación), tiene que
  // recargar al cambiar cualquier filtro o de página.
  //
  // El buscador de texto NO va aquí a propósito: recargaría en cada letra.
  // Ese sigue disparándose con Enter, que es lo que ya hacía.
   
  useEffect(() => { setPagina(1); }, [fCat, onlyLow]);
  useEffect(() => { load(); }, [fCat, onlyLow, pagina]);

  // (Nota histórica: `load` no se declara como dependencia a propósito.
  // Obligaría a envolverla en useCallback y volvería a consultar el servidor
  // en cada tecla del buscador, que es justo lo que no queremos.)

  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));

  function openNew() { setForm({ name: '', sapCode: '', category: '', brand: '', model: '', unit: 'unidad', warehouse: '', currentStock: 0, minStock: 0 }); }
  function openEdit(r: any) { setForm({ ...r }); }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name, sapCode: form.sapCode || undefined, category: form.category || undefined,
        brand: form.brand || undefined, model: form.model || undefined, unit: form.unit || undefined,
        warehouse: form.warehouse || undefined,
        currentStock: Number(form.currentStock) || 0, minStock: Number(form.minStock) || 0,
      };
      if (form.id) await api.patch('/inventory/' + form.id, body);
      else await api.post('/inventory', body);
      setForm(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el repuesto.');
    } finally { setSaving(false); }
  }
  async function del(r: any) {
    if (!(await confirmar('¿Eliminar el repuesto "' + r.name + '"?'))) return;
    await api.delete('/inventory/' + r.id).catch(async () => await avisar('No se pudo eliminar.'));
    await load();
  }

  async function submitCheck(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/inventory/' + checkRow.id + '/check', { countedQty: Number(chk.countedQty), note: chk.note || undefined });
      setCheckRow(null); setChk({ countedQty: '', note: '' });
      await load();
    } catch { await avisar('No se pudo registrar la comprobación.'); }
  }
  async function submitMove(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/inventory/' + moveRow.id + '/movement', { type: mv.type, quantity: Number(mv.quantity), sapCode: mv.sapCode || undefined, reason: mv.reason || undefined });
      setMoveRow(null); setMv({ type: 'RETIRO', quantity: '', sapCode: '', reason: '' });
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo registrar el movimiento.');
    }
  }

  async function openCompat(r: any) {
    const detail = await api.get('/inventory/' + r.id).then((x) => x.data).catch(() => r);
    setCompat(detail); setLinkAssetId('');
  }
  async function addLink() {
    if (!linkAssetId) return;
    await api.post('/inventory/' + compat.id + '/link', { assetId: linkAssetId }).catch(async () => await avisar('No se pudo vincular.'));
    await openCompat(compat);
  }
  async function removeLink(assetId: string) {
    await api.delete('/inventory/' + compat.id + '/link/' + assetId).catch(() => {});
    await openCompat(compat);
  }

  if (loading) return <div className="loading">Cargando inventario…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Inventario</h1>
          <p className="page-sub">
            {tab === 'repuestos'
              ? 'Repuestos que se consumen · disponibilidad frente al parque en campo'
              : tab === 'herramientas'
              ? 'Herramientas que se llevan y se devuelven'
              : 'Carga del catálogo desde la exportación de SAP'}
          </p>
        </div>
        {tab === 'repuestos' && can('inventory.manage') && (
          <button className="btn-primary" onClick={openNew}>+ Nuevo repuesto</button>
        )}
      </div>

      <div className="tabs" style={{ margin: '14px 0' }}>
        <button className={tab === 'repuestos' ? 'tab active' : 'tab'}
          onClick={() => setTab('repuestos')}>Repuestos</button>
        <button className={tab === 'herramientas' ? 'tab active' : 'tab'}
          onClick={() => setTab('herramientas')}>Herramientas</button>
        {can('inventory.manage') && (
          <button className={tab === 'importar' ? 'tab active' : 'tab'}
            onClick={() => setTab('importar')}>Cargar de SAP</button>
        )}
      </div>

      {tab === 'herramientas' && <InventarioHerramientas />}
      {tab === 'importar' && <InventarioImportar onImportado={load} />}

      {/* Todo lo de abajo es la pestaña de REPUESTOS. Va envuelto en el
          condicional: sin esto, la tabla de repuestos seguiría apareciendo
          debajo de las herramientas y de la carga de SAP. */}
      {tab === 'repuestos' && (
      <>

      {/* Panel resumen */}
      {summary && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <Kpi label="Tipos de repuesto" value={summary.totalItems} />
          <Kpi label="Unidades en stock" value={summary.totalUnits} />
          <Kpi label="Bajo mínimo" value={summary.shortage} cls={summary.shortage ? 'warn' : 'ok'} hint="Riesgo si se malogra algo" />
          <Kpi label="Sin stock" value={summary.outOfStock} cls={summary.outOfStock ? 'crit' : 'ok'} />
          <Kpi label="Sin comprobar" value={summary.stale} cls={summary.stale ? 'warn' : 'ok'} hint="+2 días sin verificar" />
        </div>
      )}

      {/* Gráfico campo vs repuestos */}
      {summary && summary.byCategory?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Campo vs. repuestos por categoría</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={summary.byCategory} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="field" name="Equipos en campo" fill="#2e5496" radius={[3, 3, 0, 0]} />
              <Bar dataKey="stock" name="Repuestos en stock" fill="#16a34a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filtros */}
      <div className="filters">
        <div style={{ flex: 1, minWidth: 180 }}><label>Buscar<input placeholder="nombre, código SAP, modelo…" value={fq} onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /></label></div>
        <div><label>Categoría<select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todas</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label></div>
        <div><label>&nbsp;</label><label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} style={{ width: 'auto' }} /> Solo faltantes</label></div>
        <button className="btn-primary" onClick={load}>Buscar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Repuesto</th><th>Código SAP</th><th>Categoría</th><th>Stock</th><th>Mín.</th><th>Estado</th><th>Últ. comprobación</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}{r.model && <div className="muted" style={{ fontSize: 10 }}>{r.model}</div>}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.sapCode || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.category || '—'}</td>
                <td style={{ fontWeight: 700 }}>{r.currentStock}</td>
                <td className="muted">{r.minStock}</td>
                <td>{stockBadge(r)}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.lastCheckedAt ? fecha(r.lastCheckedAt) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {can('inventory.check') && <button className="btn-mini" onClick={() => { setCheckRow(r); setChk({ countedQty: String(r.currentStock), note: '' }); }}>Comprobar</button>}
                  {can('inventory.check') && <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => { setMoveRow(r); setMv({ type: 'RETIRO', quantity: '', sapCode: '', reason: '' }); }}>Movim.</button>}
                  {can('inventory.read') && <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openCompat(r)}>Compat.</button>}
                  {can('inventory.manage') && <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openEdit(r)}>Editar</button>}
                  {can('inventory.manage') && <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => del(r)}>✕</button>}
                
                  {/* Borrado definitivo. Solo lo pinta si eres Jefe de Mantenimiento. */}
                  <BotonPurgar recurso="repuesto" id={r.id} onBorrado={() => load()} />
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin repuestos registrados</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginacion
        page={meta?.page || 1}
        pages={meta?.pages || 1}
        total={meta?.total ?? rows.length}
        pageSize={meta?.pageSize || 50}
        onChange={setPagina}
        etiqueta="repuesto"
      />

      </>
      )}

      {/* Los modales quedan FUERA del condicional a propósito: solo se abren
          desde la pestaña de repuestos, y si el usuario cambia de pestaña con
          uno abierto es mejor que se cierre por su propio botón que desaparecer
          de golpe con los datos a medio escribir. */}

      {/* Crear / editar */}
      {form && (
        <Modal
          title={form.id ? 'Editar repuesto' : 'Nuevo repuesto'}
          onClose={() => setForm(null)}
          ancho
          acciones={
            <>
              <button type="button" className="btn-mini" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" form="form-repuesto" className="btn" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          }
        >
          <form id="form-repuesto" onSubmit={save}>
            <label>Nombre
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>Código SAP (libre)
              <input value={form.sapCode || ''} onChange={(e) => setForm({ ...form, sapCode: e.target.value })} placeholder="Para retirar de almacén" />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Categoría<input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Cámara, Energía, Antena…" /></label></div>
              <div style={{ flex: 1 }}><label>Modelo compatible<input value={form.model || ''} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="DS-2CD1143G0-I" /></label></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Marca<input value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label></div>
              <div style={{ flex: 1 }}><label>Almacén<input value={form.warehouse || ''} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} /></label></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Stock actual<input type="number" min={0} value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} /></label></div>
              <div style={{ flex: 1 }}><label>Stock mínimo<input type="number" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></label></div>
            </div>
          </form>
        </Modal>
      )}

      {/* Comprobar stock */}
      {checkRow && (
        <Modal title={'Comprobar stock · ' + checkRow.name} onClose={() => setCheckRow(null)}>
          <form onSubmit={submitCheck}>
            <div className="sign-note">Registra la cantidad física que hay hoy en almacén. Otras áreas pueden haber retirado material.</div>
            <label>Cantidad comprobada
              <input type="number" min={0} value={chk.countedQty} onChange={(e) => setChk({ ...chk, countedQty: e.target.value })} required />
            </label>
            <label>Nota (opcional)
              <input value={chk.note} onChange={(e) => setChk({ ...chk, note: e.target.value })} />
            </label>
            <button className="btn">Guardar comprobación</button>
          </form>
        </Modal>
      )}

      {/* Movimiento */}
      {moveRow && (
        <Modal title={'Movimiento · ' + moveRow.name} onClose={() => setMoveRow(null)}>
          <form onSubmit={submitMove}>
            <label>Tipo
              <select value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}>{MOVES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </label>
            <label>Cantidad
              <input type="number" value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} required />
            </label>
            <label>Código SAP (retiro/ingreso)
              <input value={mv.sapCode} onChange={(e) => setMv({ ...mv, sapCode: e.target.value })} />
            </label>
            <label>Motivo (opcional)
              <input value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} />
            </label>
            <button className="btn">Registrar movimiento</button>
          </form>
        </Modal>
      )}

      {/* Compatibilidad / detalle */}
      {compat && (
        <Modal title={'Compatibilidad · ' + compat.name} onClose={() => setCompat(null)}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Este repuesto sirve a estos activos {compat.model ? '(además de todos los del modelo ' + compat.model + ')' : ''}:
          </div>
          {(compat.assets || []).map((a: any) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid #eee' }}>
              <span>{a.asset?.assetCode} <span className="muted">· {a.asset?.type}</span></span>
              {can('inventory.manage') && <button className="btn-mini" onClick={() => removeLink(a.asset.id)}>quitar</button>}
            </div>
          ))}
          {!(compat.assets || []).length && <div className="muted" style={{ fontSize: 12 }}>Sin activos vinculados directamente.</div>}
          {can('inventory.manage') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <select aria-label="&nbsp;" value={linkAssetId} onChange={(e) => setLinkAssetId(e.target.value)} style={{ flex: 1 }}>
                <option value="">— vincular activo —</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
              </select>
              <button className="btn-mini" onClick={addLink}>Vincular</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
