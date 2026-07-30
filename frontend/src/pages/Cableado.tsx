import { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

/**
 * TRAMOS DE CABLE.
 *
 * PARA QUÉ SIRVE
 * Ethernet tiene un límite duro de 90 m de tramo horizontal. Pasado eso el
 * enlace NO deja de funcionar: funciona A VECES. Con frío anda, con calor se
 * cae. Ese es el "se arregla y vuelve a fallar" del que se queja el Jefe, y
 * nadie lo va a descubrir jamás si no está anotado que ese tramo mide 118 m.
 *
 * Además, un cable sin blindaje corriendo por la misma bandeja que la fuerza,
 * en una planta con hornos y centros de control de motores, se llena de ruido:
 * mismo síntoma intermitente e irreproducible.
 *
 * El sistema avisa solo de las dos cosas.
 */

const CATEGORIA: Record<string, string> = {
  CAT5E: 'Cat 5e', CAT6: 'Cat 6', CAT6A: 'Cat 6A',
  FIBRA_MONOMODO: 'Fibra monomodo', FIBRA_MULTIMODO: 'Fibra multimodo',
  COAXIAL: 'Coaxial (analógica)', OTRO: 'Otro',
};
const RUTA: Record<string, string> = {
  AEREA: 'Aérea', CANALETA: 'Canaleta', BANDEJA: 'Bandeja (revisar blindaje)',
  SUBTERRANEA: 'Subterránea', TUBERIA: 'Tubería', INTEMPERIE: 'Intemperie',
};
const ESTADO: Record<string, string> = {
  INSTALADO: 'Instalado', DANADO: 'Dañado',
  A_REEMPLAZAR: 'A reemplazar', RETIRADO: 'Retirado',
};
const BADGE: Record<string, string> = {
  INSTALADO: 'OPERATIVO', DANADO: 'FUERA_SERVICIO',
  A_REEMPLAZAR: 'MEDIA', RETIRADO: 'BAJA',
};

const VACIO = {
  code: '', category: 'CAT6', meters: '', metersEstimated: true, shielded: false,
  route: '', status: 'INSTALADO', fromAssetId: '', fromPortNumber: '', toAssetId: '',
  installedAt: '', notes: '',
};

export default function Cableado() {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [opciones, setOpciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [soloFuera, setSoloFuera] = useState(false);
  const [fEstado, setFEstado] = useState('');

  // Igual que en Activos: depende de los filtros, así que va en useCallback
  // para poder declararla como dependencia sin provocar un bucle de recargas.
  const load = useCallback(async () => {
    const params: any = {};
    if (soloFuera) params.fueraNorma = 'true';
    if (fEstado) params.status = fEstado;
    const [c, r] = await Promise.all([
      api.get('/assets/cables', { params }).then((x) => x.data).catch(() => []),
      api.get('/assets/cables/resumen').then((x) => x.data).catch(() => null),
    ]);
    setRows(c || []);
    setResumen(r);
  }, [soloFuera, fEstado]);

  useEffect(() => {
    api.get('/assets/options').then((r) => setOpciones(r.data || [])).catch(() => setOpciones([]));
  }, []);
  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  function nuevo() { setForm({ ...VACIO }); }
  function editar(c: any) {
    setForm({
      id: c.id, code: c.code || '', category: c.category, meters: c.meters ?? '',
      metersEstimated: !!c.metersEstimated, shielded: !!c.shielded,
      route: c.route || '', status: c.status,
      fromAssetId: c.fromAssetId || '', fromPortNumber: c.fromPortNumber ?? '',
      toAssetId: c.toAssetId || '',
      installedAt: c.installedAt ? String(c.installedAt).slice(0, 10) : '',
      notes: c.notes || '',
    });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = {
        category: form.category,
        metersEstimated: !!form.metersEstimated,
        shielded: !!form.shielded,
        status: form.status,
      };
      if (form.code) body.code = form.code.trim();
      if (form.meters !== '') body.meters = Number(form.meters);
      if (form.route) body.route = form.route;
      if (form.fromAssetId) body.fromAssetId = form.fromAssetId;
      if (form.fromPortNumber !== '') body.fromPortNumber = Number(form.fromPortNumber);
      if (form.toAssetId) body.toAssetId = form.toAssetId;
      if (form.installedAt) body.installedAt = new Date(form.installedAt + 'T08:00:00').toISOString();
      if (form.notes) body.notes = form.notes.trim();

      if (form.id) await api.patch('/assets/cables/' + form.id, body);
      else await api.post('/assets/cables', body);
      setForm(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el tramo.');
    } finally { setSaving(false); }
  }

  async function retirar(c: any) {
    if (!window.confirm(
      `¿Marcar este tramo como retirado?\n\nNo se borra: un tramo retirado sigue ` +
      `explicando fallas pasadas y borrarlo dejaría sin sentido el historial de ` +
      `esas órdenes.`)) return;
    try { await api.delete('/assets/cables/' + c.id); await load(); }
    catch { window.alert('No se pudo retirar el tramo.'); }
  }

  const nombre = (id: string) => opciones.find((o) => o.id === id)?.assetCode || '—';

  if (loading) return <div className="loading">Cargando cableado…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Cableado</h1>
          <p className="page-sub">
            Tramos entre equipos. El límite de norma son {resumen?.limiteM ?? 90} m:
            pasado eso el enlace no falla, falla a veces.
          </p>
        </div>
        {can('asset.update') && <button className="btn-primary" onClick={nuevo}>+ Nuevo tramo</button>}
      </div>

      {resumen && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
          {[
            { t: 'Tramos registrados', v: resumen.total },
            { t: 'Fuera de norma', v: resumen.fueraNorma, c: resumen.fueraNorma ? '#dc2626' : '#16a34a',
              p: `más de ${resumen.limiteM} m` },
            { t: 'Sin medir', v: resumen.sinMedir, c: resumen.sinMedir ? '#d97706' : '#16a34a',
              p: 'no se puede diagnosticar' },
            { t: 'Dañados o a reemplazar', v: resumen.danados, c: resumen.danados ? '#dc2626' : '#16a34a' },
          ].map((k) => (
            <div key={k.t} className="card" style={{ flex: '1 1 170px', minWidth: 150, padding: '14px 16px' }}>
              <div className="muted" style={{ fontSize: 12 }}>{k.t}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: k.c }}>{k.v}</div>
              {k.p && <div className="muted" style={{ fontSize: 11 }}>{k.p}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="filters">
        <div><label>Estado</label>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ESTADO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-end', paddingBottom: 6 }}>
          <input type="checkbox" checked={soloFuera} onChange={(e) => setSoloFuera(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Solo fuera de norma</span>
        </label>
        <button className="btn-mini" onClick={() => { setFEstado(''); setSoloFuera(false); }}>Limpiar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Tramo</th><th>Categoría</th><th>Metros</th><th>Ruta</th><th>Estado</th><th>Avisos</th>{can('asset.update') && <th></th>}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={c.status === 'RETIRADO' ? { opacity: 0.5 } : undefined}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.code || '—'}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {c.fromAsset?.assetCode || nombre(c.fromAssetId)}
                    {c.fromPortNumber ? ` · puerto ${c.fromPortNumber}` : ''}
                    {' → '}
                    {c.toAsset?.assetCode || nombre(c.toAssetId)}
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {CATEGORIA[c.category] || c.category}
                  {c.shielded ? <div style={{ fontSize: 11 }}>blindado</div> : null}
                </td>
                <td style={{ fontWeight: 600 }}>
                  {c.meters ?? '—'}
                  {c.meters != null && (
                    <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>
                      {c.metersEstimated ? 'estimado' : 'medido'}
                    </div>
                  )}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{RUTA[c.route] || '—'}</td>
                <td><span className={'badge ' + (BADGE[c.status] || 'MEDIA')}>{ESTADO[c.status] || c.status}</span></td>
                <td style={{ fontSize: 12, maxWidth: 320 }}>
                  {c.avisos?.length
                    ? c.avisos.map((a: string, i: number) => (
                        <div key={i} style={{ color: '#b45309' }}>· {a}</div>
                      ))
                    : <span className="muted">—</span>}
                </td>
                {can('asset.update') && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-mini" onClick={() => editar(c)}>Editar</button>
                    {c.status !== 'RETIRADO' && (
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => retirar(c)}>Retirar</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                Sin tramos registrados. Empieza por los que ya sospechas que están largos.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar tramo' : 'Nuevo tramo de cable'} onClose={() => setForm(null)}>
          <form onSubmit={guardar}>
            <label>Rótulo del tramo (opcional)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="Si el cable está rotulado en planta" />

            <label>Desde (equipo de origen)</label>
            <select value={form.fromAssetId} onChange={(e) => setForm({ ...form, fromAssetId: e.target.value })}>
              <option value="">— sin definir —</option>
              {opciones.map((o) => <option key={o.id} value={o.id}>{o.assetCode} · {o.type}</option>)}
            </select>

            <label>Puerto de origen</label>
            <input type="number" min={1} value={form.fromPortNumber}
              onChange={(e) => setForm({ ...form, fromPortNumber: e.target.value })} placeholder="Ej: 8" />

            <label>Hasta (equipo de destino)</label>
            <select value={form.toAssetId} onChange={(e) => setForm({ ...form, toAssetId: e.target.value })}>
              <option value="">— sin definir —</option>
              {opciones.map((o) => <option key={o.id} value={o.id}>{o.assetCode} · {o.type}</option>)}
            </select>

            <label>Categoría</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORIA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>

            <label>Metros</label>
            <input type="number" min={0} step="0.5" value={form.meters}
              onChange={(e) => setForm({ ...form, meters: e.target.value })} placeholder="Ej: 45" />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={!form.metersEstimated}
                onChange={(e) => setForm({ ...form, metersEstimated: !e.target.checked })} />
              <span>Medido con metrajo (no estimado)</span>
            </label>
            <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
              Se distingue a propósito: no conviene decidir un reemplazo sobre una
              medida calculada a ojo.
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!form.shielded}
                onChange={(e) => setForm({ ...form, shielded: e.target.checked })} />
              <span>Cable blindado (STP / FTP)</span>
            </label>

            <label>Ruta</label>
            <select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
              <option value="">— sin definir —</option>
              {Object.entries(RUTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
              Si va por bandeja compartida con fuerza y no está blindado, el
              sistema lo avisa: es causa habitual de fallas intermitentes.
            </div>

            <label>Estado</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(ESTADO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>

            <label>Fecha de instalación</label>
            <input type="date" value={form.installedAt}
              onChange={(e) => setForm({ ...form, installedAt: e.target.value })} />

            <label>Observaciones</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} style={{ width: '100%', resize: 'vertical' }} />

            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar tramo'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
