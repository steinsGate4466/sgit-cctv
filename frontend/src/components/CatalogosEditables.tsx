import { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from './Dialogos';

/**
 * CATÁLOGOS EDITABLES — causas, síntomas, acciones y motivos.
 *
 * POR QUÉ EXISTE ESTA PANTALLA
 * Las causas de cierre vivían en un enum de 17 valores dentro del código.
 * Añadir una exigía migración y despliegue. Eso significa que la gente que
 * sabe cómo se llaman las cosas en el Tren 2 no podía nombrarlas.
 *
 * Es el mismo error que cometí inventándome las etapas del proceso, y por eso
 * esta pantalla existe: yo pongo la estructura vacía, ustedes la llenan.
 *
 * SÍNTOMAS, ACCIONES Y MOTIVOS ESTÁN VACÍOS A PROPÓSITO. No sé qué síntomas
 * ve un técnico ni cómo los llama. Se crean aquí.
 */

const TIPOS = [
  { k: 'CAUSA', t: 'Causas de cierre', d: 'Por qué falló. Es lo que permite contar por qué se repite algo.' },
  { k: 'SINTOMA', t: 'Síntomas', d: 'Qué vio el técnico ANTES de intervenir. Sin imagen, imagen con rayas, se congela…' },
  { k: 'ACCION', t: 'Acciones', d: 'Qué hizo. Limpiar carcasa, recrimpar, cambiar fuente…' },
  { k: 'MOTIVO_AVANCE', t: 'Motivos de no avanzar', d: 'Por qué se quedó a medias. No llegó el repuesto, se acortó la parada…' },
];

const VACIO = { id: '', code: '', name: '', group: '', sequence: 0, notes: '' };

export default function CatalogosEditables() {
  const { confirmar, avisar } = useDialogos();
  const { can } = useAuth();
  const editable = can('location.manage');

  const [tipo, setTipo] = useState('CAUSA');
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [verTodas, setVerTodas] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api
      .get(`/catalogos/${tipo}` + (verTodas ? '?todas=true' : ''))
      .then((x) => x.data)
      .catch(() => null);
    setDatos(r);
  }, [tipo, verTodas]);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  const error = async (err: any) => {
    const m = err?.response?.data?.message;
    await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo completar la acción.');
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      if (form.id) {
        await api.patch('/catalogos/' + form.id, {
          name: form.name, group: form.group, sequence: Number(form.sequence) || 0, notes: form.notes,
        });
      } else {
        await api.post('/catalogos', {
          kind: tipo,
          name: form.name,
          // El código se deja vacío a propósito: lo genera el servidor a partir
          // del nombre. Pedirle a alguien que invente un código mientras
          // escribe un nombre es pedirle dos trabajos, y el segundo sale mal.
          group: form.group,
          sequence: Number(form.sequence) || 0,
          notes: form.notes,
        });
      }
      setForm(null);
      await cargar();
    } catch (err) { error(err); } finally { setGuardando(false); }
  }

  async function alternarActiva(item: any) {
    try {
      if (item.active) {
        if (!(await confirmar(
          `"${item.name}" dejará de ofrecerse al cerrar órdenes.\n\n` +
          'NO se borra: las órdenes que ya la usaron la seguirán mostrando.\n\n¿Continuar?'))) return;
        await api.delete('/catalogos/' + item.id);
      } else {
        await api.patch('/catalogos/' + item.id, { active: true });
      }
      await cargar();
    } catch (err) { error(err); }
  }

  const info = TIPOS.find((t) => t.k === tipo);

  return (
    <div>
      <div className="sign-note">
        Estas listas son las que verá el técnico al cerrar una orden. Nadie mejor
        que ustedes sabe cómo se llaman las cosas en planta: por eso se editan
        aquí y no están escritas en el código.
      </div>

      <div className="tabs" style={{ margin: '14px 0' }}>
        {TIPOS.map((t) => (
          <button
            key={t.k}
            className={tipo === t.k ? 'tab active' : 'tab'}
            onClick={() => { setTipo(t.k); setForm(null); }}
          >
            {t.t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="muted" style={{ fontSize: 12, maxWidth: 560 }}>{info?.d}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
            Ver también las desactivadas
          </label>
          {editable && (
            <button className="btn-primary" onClick={() => setForm({ ...VACIO })}>+ Nueva</button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="loading">Cargando…</div>
      ) : !datos?.items?.length ? (
        <div className="card" style={{ padding: 36, textAlign: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>
            Todavía no hay ninguna entrada en «{info?.t}»
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Está vacío a propósito. Yo no sé qué {tipo === 'SINTOMA' ? 'síntomas ve' : 'términos usa'} un
            técnico en el Tren 2 ni cómo los llama, y ya me equivoqué una vez
            inventando nombres de planta.
            <br />Créalas tú: en cuanto haya una, aparecerá al cerrar las órdenes.
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr><th>Nombre</th><th>Familia</th><th>Código</th><th>Orden</th><th>Estado</th>{editable && <th></th>}</tr>
            </thead>
            <tbody>
              {datos.items.map((i: any) => (
                <tr key={i.id} style={{ opacity: i.active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>
                    {i.name}
                    {i.notes && <div className="muted" style={{ fontSize: 11 }}>{i.notes}</div>}
                  </td>
                  <td className="muted">{i.group || '—'}</td>
                  <td className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{i.code}</td>
                  <td className="muted">{i.sequence}</td>
                  <td>
                    <span className={'badge ' + (i.active ? 'OPERATIVO' : 'STOCK')}>
                      {i.active ? 'Activa' : 'Desactivada'}
                    </span>
                  </td>
                  {editable && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-mini" onClick={() => setForm({
                        id: i.id, code: i.code, name: i.name,
                        group: i.group || '', sequence: i.sequence, notes: i.notes || '',
                      })}>Editar</button>
                      <button className="btn-mini" style={{ marginLeft: 4 }}
                        onClick={() => alternarActiva(i)}>
                        {i.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <form className="panel" style={{ marginTop: 12 }} onSubmit={guardar}>
          <h3>{form.id ? 'Editar entrada' : 'Nueva entrada en ' + info?.t}</h3>

          <label>Nombre — como lo diría el técnico</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ej. Conector RJ45 mal ponchado" required />

          <label>Familia — para agrupar la lista</label>
          <input value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}
            placeholder="ej. Cableado" list="familias-catalogo" />
          <datalist id="familias-catalogo">
            {[...new Set((datos?.items || []).map((i: any) => i.group).filter(Boolean))].map((g: any) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
            Con muchas opciones en una lista plana, y con la parada corriendo, se
            elige la primera que se ve. Agrupadas se encuentran.
          </div>

          <label>Orden dentro de su familia</label>
          <input type="number" value={form.sequence}
            onChange={(e) => setForm({ ...form, sequence: e.target.value })} />

          <label>Nota interna (opcional)</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {form.id && (
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              El código <b>{form.code}</b> no se puede cambiar: es lo que está
              guardado en las órdenes ya cerradas. Cambiarlo reescribiría el pasado.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn-mini" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
