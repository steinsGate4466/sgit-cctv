import { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';
import { WO_TYPES, WO_TYPE_ES } from '../pages/omCatalogos';
import { useDialogos } from './Dialogos';

/**
 * CATÁLOGO DE HERRAMIENTAS + informe de las que más faltan.
 *
 * POR QUÉ ESTÁ SEPARADO DE LOS REPUESTOS
 * Una herramienta no se consume: el engrimpador se lleva y se devuelve. Tratarla
 * como repuesto daría un stock que nunca baja, es decir un dato falso permanente.
 *
 * EL CATÁLOGO ARRANCA VACÍO a propósito. Los nombres los pone el personal de
 * planta: inventar nombres genéricos ya salió mal con las etapas del proceso.
 *
 * EL INFORME DE FALTANTES es lo que convierte la encuesta en una decisión de
 * compra: si el engrimpador falta en 8 de 10 salidas, el problema no es el
 * técnico —hay que comprar engrimpadores—.
 */

const VACIO = { code: '', name: '', category: '', notes: '', suggestedFor: [] as string[] };

export default function InventarioHerramientas() {
  const { confirmar, avisar } = useDialogos();
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [faltantes, setFaltantes] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  // useCallback porque la consulta SÍ cambia con "ver también las inactivas".
  // Así entra como dependencia del efecto sin recrearse en cada render, que es
  // lo que provocaría un bucle de recargas.
  const cargar = useCallback(async () => {
    const [t, f] = await Promise.all([
      api.get('/inventory/tools' + (verTodas ? '?todas=true' : '')).then((r) => r.data).catch(() => []),
      api.get('/inventory/tools/faltantes').then((r) => r.data).catch(() => []),
    ]);
    setRows(t || []);
    setFaltantes(f || []);
  }, [verTodas]);
  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  function nueva() { setForm({ ...VACIO }); }
  function editar(t: any) {
    setForm({
      id: t.id, code: t.code || '', name: t.name, category: t.category || '',
      notes: t.notes || '', suggestedFor: t.suggestedFor || [], active: t.active,
    });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const body = {
        code: form.code?.trim() || undefined,
        name: form.name?.trim(),
        category: form.category?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        suggestedFor: form.suggestedFor || [],
      };
      if (form.id) await api.patch('/inventory/tools/' + form.id, body);
      else await api.post('/inventory/tools', body);
      setForm(null);
      await cargar();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la herramienta.');
    } finally { setGuardando(false); }
  }

  async function desactivar(t: any) {
    if (!(await confirmar(
      `¿Desactivar "${t.name}"?\n\nNo se borra: las verificaciones pasadas de las ` +
      `órdenes la referencian y borrarla dejaría esos registros sin sentido.`))) return;
    try { await api.delete('/inventory/tools/' + t.id); await cargar(); }
    catch { await avisar('No se pudo desactivar.'); }
  }

  function alternarTipo(tipo: string) {
    const ya = form.suggestedFor || [];
    setForm({
      ...form,
      suggestedFor: ya.includes(tipo) ? ya.filter((t: string) => t !== tipo) : [...ya, tipo],
    });
  }

  if (cargando) return <div className="muted" style={{ fontSize: 12 }}>Cargando herramientas…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div className="muted" style={{ fontSize: 12, maxWidth: 620 }}>
          Las herramientas no se consumen: se llevan y se devuelven. El técnico
          confirma cuáles lleva al abrir la orden, y aquí se ve qué falta más seguido.
        </div>
        {can('inventory.manage') && <button className="btn-primary" onClick={nueva}>+ Nueva herramienta</button>}
      </div>

      {/* --------------------------------------------- las que más faltan */}
      {faltantes.length > 0 && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
          padding: '12px 14px', margin: '14px 0', color: '#92400e',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Herramientas que más faltan</div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Si una falta en la mayoría de las salidas, el problema no es el técnico:
            hay que comprar.
          </div>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>Herramienta</th><th>Faltó</th><th>De</th><th>%</th></tr></thead>
            <tbody>
              {faltantes.slice(0, 8).map((f) => (
                <tr key={f.toolId}>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td>{f.vecesFaltó}</td>
                  <td>{f.vecesRevisada}</td>
                  <td style={{ fontWeight: 700 }}>{f.porcentaje}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
        <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
        <span style={{ fontSize: 13 }}>Mostrar también las desactivadas</span>
      </label>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Herramienta</th><th>Familia</th><th>Se sugiere en</th><th>Revisada</th>{can('inventory.manage') && <th></th>}</tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={t.active === false ? { opacity: 0.45 } : undefined}>
                <td className="muted">{t.code || '—'}</td>
                <td>
                  <strong>{t.name}</strong>
                  {t.active === false && <span className="muted" style={{ fontSize: 11 }}> · desactivada</span>}
                  {t.notes && <div className="muted" style={{ fontSize: 11 }}>{t.notes}</div>}
                </td>
                <td className="muted">{t.category || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {t.suggestedFor?.length
                    ? t.suggestedFor.map((x: string) => WO_TYPE_ES[x] || x).join(', ')
                    : 'todas las órdenes'}
                </td>
                <td>{t.vecesRevisada ?? 0}</td>
                {can('inventory.manage') && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-mini" onClick={() => editar(t)}>Editar</button>
                    {t.active !== false && (
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => desactivar(t)}>Desactivar</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                Todavía no hay herramientas. Registra las que usa tu equipo:
                engrimpador, probador de red, multímetro, metrajo, etiquetadora.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar herramienta' : 'Nueva herramienta'} onClose={() => setForm(null)}>
          <form onSubmit={guardar}>
            <label>Nombre
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Engrimpador RJ45" required />
            </label>

            <label>Código (opcional)
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="Si el taller las rotula" />
            </label>

            <label>Familia
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Red, Eléctrica, Medición, Altura, Seguridad" />
            </label>

            <label>Se sugiere en estos tipos de orden</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {WO_TYPES.map((t) => {
                const activo = (form.suggestedFor || []).includes(t);
                return (
                  <button key={t} type="button" className="btn-mini"
                    style={activo ? { background: '#2563eb', color: '#fff', borderColor: '#2563eb' } : undefined}
                    onClick={() => alternarTipo(t)}>
                    {WO_TYPE_ES[t] || t}
                  </button>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: -4, marginBottom: 8 }}>
              Si no marcas ninguno, se sugiere en <strong>todas</strong>. Es mejor
              sugerir de más que ocultar una herramienta necesaria porque nadie
              configuró en qué tipos aplica.
            </div>

            <label>Nota para el técnico
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ej: el del taller de red, no el eléctrico" />
            </label>

            <button className="btn" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar herramienta'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
