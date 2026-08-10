import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';

/**
 * EQUIPOS CONOCIDOS — el diccionario de "¿desde qué PC se hizo esto?"
 *
 * LO QUE HAY QUE DECIR ANTES DE QUE ALGUIEN PREGUNTE:
 * **la MAC no se detecta sola.** Un navegador no puede leerla y un servidor
 * web no la recibe: la MAC es de capa 2 y no pasa del primer router. Lo que
 * llega es la MAC del gateway, la misma para toda la planta.
 *
 * Así que la MAC se escribe A MANO, sacada de donde vive de verdad:
 *   · la reserva DHCP del router, o
 *   · `show mac address-table` en el switch, o
 *   · `ipconfig /all` en el propio PC.
 *
 * Con esta tabla rellena, la auditoría deja de decir "10.20.3.14" y pasa a
 * decir "PC del púlpito del Tren 2". Ésa es toda la diferencia entre un dato
 * y una respuesta.
 */

const TIPOS = ['PC', 'LAPTOP', 'CELULAR', 'TABLET', 'SERVIDOR', 'OTRO'];
const VACIO = {
  id: '', nombre: '', ip: '', mac: '', tipo: 'PC',
  area: '', ubicacion: '', responsable: '', notas: '', activo: true,
};

export default function Equipos() {
  const { can } = useAuth();
  const puedeEditar = can('asset.update');

  const [lista, setLista] = useState<any[]>([]);
  const [huerfanas, setHuerfanas] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (texto: string) => {
    const [l, h] = await Promise.all([
      api.get('/equipos', { params: texto ? { q: texto } : undefined }).then((r) => r.data).catch(() => []),
      api.get('/equipos/sin-registrar').then((r) => r.data).catch(() => []),
    ]);
    setLista(l || []);
    setHuerfanas(h || []);
  }, []);

  // El buscador espera a que dejes de teclear. Sin esto son seis consultas
  // para escribir "pulpito".
  useEffect(() => {
    setCargando(true);
    const t = setTimeout(() => { cargar(q).finally(() => setCargando(false)); }, 300);
    return () => clearTimeout(t);
  }, [q, cargar]);

  async function guardar() {
    setGuardando(true); setError('');
    const { id, ...datos } = form;
    // Los vacíos se mandan como ausentes: una IP en blanco no es una IP,
    // y guardarla como '' hace chocar el índice único con el siguiente vacío.
    const cuerpo: any = {};
    for (const [k, v] of Object.entries(datos)) {
      if (v === '' || v === null) continue;
      cuerpo[k] = v;
    }
    cuerpo.activo = !!datos.activo;
    try {
      if (id) await api.patch(`/equipos/${id}`, cuerpo);
      else await api.post('/equipos', cuerpo);
      setMsg(id ? 'Equipo actualizado.' : 'Equipo registrado.');
      setForm(null);
      await cargar(q);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo guardar.');
    } finally { setGuardando(false); }
  }

  async function borrar(e: any) {
    if (!confirm(`¿Quitar "${e.nombre}" del registro?\n\nLa auditoría antigua NO cambia: guarda el nombre copiado.`)) return;
    try {
      await api.delete(`/equipos/${e.id}`);
      setMsg(`Quitado "${e.nombre}" del registro.`);
      await cargar(q);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo quitar.');
    }
  }

  return (
    <div className="page">
      <div className="card explica">
        <b>Para qué sirve esta pantalla.</b> Traduce una IP en un sitio de la planta.
        Sin ella, la auditoría dice <code>10.20.3.14</code>; con ella dice
        <b> «PC del púlpito del Tren 2»</b>.
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <b>Por qué la MAC se escribe a mano.</b> Porque no se puede detectar: la
          dirección MAC es de capa 2 y muere en el primer router. Al servidor le
          llega la del gateway, idéntica para toda la planta. La real se saca de
          la <b>reserva DHCP</b>, de <code>show mac address-table</code> en el switch,
          o de <code>ipconfig /all</code> en el propio equipo.
        </div>
      </div>

      {msg && <div className="aviso-ok" onClick={() => setMsg('')}>{msg}</div>}
      {error && <div className="aviso-error" onClick={() => setError('')}>{error}</div>}

      {/* Lo que falta por registrar. Es la lista de trabajo, así que va arriba. */}
      {huerfanas.length > 0 && (
        <div className="card peligro">
          <b>{huerfanas.length} dirección(es) han entrado al sistema y no están registradas.</b>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {huerfanas.map((h) => (
              <button key={h.ip} className="btn-mini"
                      disabled={!puedeEditar}
                      title={`${h.accesos} acceso(s) en los últimos 30 días`}
                      onClick={() => setForm({ ...VACIO, ip: h.ip })}>
                {h.ip} <span className="muted">· {h.accesos}</span>
              </button>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Pulsa una para registrarla. Mientras no lo estén, la auditoría sólo
            puede decir el número.
          </div>
        </div>
      )}

      <div className="filters">
        <input placeholder="Buscar por nombre, IP, MAC, área o responsable…"
               value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} />
        {puedeEditar && (
          <button className="btn-primary" onClick={() => { setForm({ ...VACIO }); setError(''); }}>
            + Registrar equipo
          </button>
        )}
      </div>

      {cargando ? <EsqueletoTabla filas={5} /> : lista.length === 0 ? (
        <div className="card vacio">
          <h3>Todavía no hay equipos registrados</h3>
          <p>
            Empieza por los fijos: el PC del púlpito de cada tren, el de la sala
            de control y el del taller. Son los que más aparecen en la auditoría.
          </p>
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Equipo</th><th>IP</th><th>MAC</th><th>Tipo</th>
              <th>Dónde</th><th>Responsable</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} style={e.activo ? undefined : { opacity: .55 }}>
                <td>
                  <strong>{e.nombre}</strong>
                  {!e.activo && <span className="chip est-BAJA" style={{ marginLeft: 6 }}>inactivo</span>}
                  {e.notas && <div className="muted" style={{ fontSize: 11.5 }}>{e.notas}</div>}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.ip || <span className="muted">—</span>}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.mac || <span className="muted">—</span>}</td>
                <td>{e.tipo}</td>
                <td>{[e.area, e.ubicacion].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
                <td>{e.responsable || <span className="muted">—</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {puedeEditar && <>
                    <button className="btn-mini" onClick={() => { setForm({ ...VACIO, ...e }); setError(''); }}>Editar</button>
                    <button className="btn-mini btn-danger" style={{ marginLeft: 4 }} onClick={() => borrar(e)}>✕</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form && (
        <Modal
          title={form.id ? `Editar ${form.nombre}` : 'Registrar equipo'}
          onClose={() => setForm(null)}
          ancho
          acciones={
            <>
              <button className="btn-mini" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn-primary" onClick={guardar} disabled={guardando || form.nombre.trim().length < 2}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          }
        >
          {error && <div className="aviso-error">{error}</div>}

          <div className="form-grid">
            <label className="campo campo-ancho">
              <span>Nombre del equipo <b className="campo-req">*</b></span>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                     placeholder="PC Púlpito Tren 2" />
              <small className="muted">
                Ponle el nombre con el que se le llama en planta, no el del dominio.
                Quien lea la auditoría tiene que saber a qué sitio ir.
              </small>
            </label>

            <label className="campo">
              <span>Dirección IP</span>
              <input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value.trim() })}
                     placeholder="10.20.3.14" inputMode="decimal" autoComplete="off" />
              <small className="muted">
                Sólo sirve si es <b>fija o reservada por DHCP</b>. Si el equipo
                coge una IP distinta cada mañana, deja esto vacío: una IP que
                cambia apunta al PC equivocado.
              </small>
            </label>

            <label className="campo">
              <span>Dirección MAC</span>
              <input value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value.trim() })}
                     placeholder="00:1A:2B:3C:4D:5E" autoComplete="off" />
              <small className="muted">
                De <code>ipconfig /all</code>, de la reserva DHCP o de
                <code> show mac address-table</code>. Se acepta con dos puntos,
                con guiones o en formato Cisco.
              </small>
            </label>

            <label className="campo">
              <span>Tipo</span>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label className="campo">
              <span>Área</span>
              <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
                     placeholder="Laminación · Tren 2" />
            </label>

            <label className="campo">
              <span>Ubicación exacta</span>
              <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                     placeholder="Púlpito, escritorio de la ventana" />
            </label>

            <label className="campo">
              <span>Responsable</span>
              <input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                     placeholder="Turno A · Operador de púlpito" />
            </label>

            <label className="campo campo-ancho">
              <span>Notas</span>
              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
                        placeholder="Comparte pantalla con el HMI. No apagar." />
            </label>

            <label className="campo campo-ancho" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!form.activo} style={{ width: 18, height: 18, minHeight: 18 }}
                     onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              <span style={{ margin: 0 }}>
                En servicio
                <small className="muted" style={{ display: 'block' }}>
                  Un equipo retirado se deja aquí desmarcado en vez de borrarlo:
                  así la auditoría vieja se sigue entendiendo.
                </small>
              </span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
