import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import { EsqueletoTabla } from '../components/Esqueleto';

/**
 * ROLES QUE CREA EL INGENIERO.
 *
 * Hasta ahora los roles venían fijos y cada rol nuevo era código y despliegue.
 *
 * LO DIFÍCIL DE ESTA PANTALLA NO ES GUARDAR: ES QUE ELIJA BIEN.
 * Una lista de 31 códigos sueltos (`wo.approve`, `credential.read`) termina
 * siempre igual: se marca todo por si acaso, que es justo el agujero que
 * esto venía a cerrar. Por eso cada permiso lleva nombre en castellano, una
 * frase de qué deja hacer, y un aviso cuando es delicado.
 *
 * Y por eso lo primero que se ofrece no es una lista vacía, sino PLANTILLAS:
 * "Jefe de línea", "Técnico de red", "Contratista". Se parte de algo que ya
 * tiene sentido y se ajusta.
 */
export default function Roles() {
  const [roles, setRoles] = useState<any[]>([]);
  const [catalogo, setCatalogo] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [edita, setEdita] = useState<any>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [rs, cat] = await Promise.all([
      api.get('/roles-admin').then((r) => r.data).catch(() => []),
      api.get('/roles-admin/catalogo').then((r) => r.data).catch(() => null),
    ]);
    setRoles(rs || []);
    setCatalogo(cat);
  }, []);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  function abrir(rol: any | null) {
    setError('');
    setEdita(rol || { nuevo: true });
    setNombre(rol?.nombre || '');
    setDescripcion(rol?.descripcion || '');
    setMarcados(new Set(rol?.permisos || []));
  }

  function alternar(code: string) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code); else s.add(code);
      return s;
    });
  }

  function usarPlantilla(p: any) {
    setMarcados(new Set(p.permisos));
    if (!nombre) setNombre(p.nombre);
    if (!descripcion) setDescripcion(p.descripcion);
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      const cuerpo = { nombre, descripcion, permisos: [...marcados] };
      if (edita?.nuevo) await api.post('/roles-admin', cuerpo);
      else await api.patch('/roles-admin/' + edita.id, cuerpo);
      setEdita(null);
      await cargar();
    } catch (e: any) {
      // El servidor manda el motivo en castellano a propósito: aquí se
      // muestra tal cual. Un "400 Bad Request" no le dice nada a nadie.
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(rol: any) {
    if (!window.confirm(`¿Borrar el rol "${rol.nombre}"?`)) return;
    try {
      await api.delete('/roles-admin/' + rol.id);
      await cargar();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo borrar.');
    }
  }

  if (cargando) return <EsqueletoTabla filas={5} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Roles y permisos</h1>
          <p className="page-sub">
            Qué puede hacer cada tipo de usuario. Los roles del sistema no se borran.
          </p>
        </div>
        <button className="btn-primary" onClick={() => abrir(null)}>+ Nuevo rol</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Rol</th><th>Para qué es</th><th>Permisos</th><th>Usuarios</th><th></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.nombre}
                  {r.sistema && <span className="badge MEDIA" style={{ marginLeft: 8 }}>del sistema</span>}
                  {r.soloConsulta && <span className="badge STOCK" style={{ marginLeft: 8 }}>sólo mira</span>}
                </td>
                <td className="muted">{r.descripcion || '—'}</td>
                <td>{r.permisos.length}</td>
                <td>{r.usuarios}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => abrir(r)}>
                    <Icono n="orden" size={14} /> Editar
                  </button>{' '}
                  {!r.sistema && r.usuarios === 0 && (
                    <button className="btn-mini btn-danger" onClick={() => borrar(r)}>Borrar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edita && (
        <Modal title={edita.nuevo ? 'Nuevo rol' : `Editar: ${edita.nombre}`} onClose={() => setEdita(null)}>
          {edita.nuevo && (
            <>
              <label>Nombre del rol</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Jefe de línea Tren 2" />
            </>
          )}
          <label>Para qué es</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Una frase: quién lo usa y para qué" />

          {/* PLANTILLAS. Antes eran diez botones con sólo el nombre, y elegir
              entre «Técnico de red» y «Técnico de campo (CCTV)» a ciegas es
              exactamente la duda que hace que alguien marque el más amplio
              «por si acaso». Ahora cada una dice a QUÉ PUESTO corresponde y
              cuántos permisos trae, y las delicadas llevan su aviso. */}
          {edita.nuevo && catalogo?.plantillas?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 13 }}>Empieza por una plantilla</b>
              <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>
                Son un punto de partida, no una jaula: después se ajusta casilla
                por casilla. El tren que ve cada persona se configura aparte, en
                su ficha de usuario.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
                {catalogo.plantillas.map((p: any) => (
                  <button key={p.nombre} type="button"
                    className="card"
                    onClick={() => usarPlantilla(p)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                      display: 'block', font: 'inherit',
                      borderLeft: p.advertencia ? '3px solid var(--warn,#d97706)' : undefined,
                    }}>
                    <b style={{ fontSize: 13 }}>{p.nombre}</b>
                    {p.paraQuien && (
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{p.paraQuien}</div>
                    )}
                    <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>{p.descripcion}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                      {p.permisos.length} permisos
                      {p.necesitaAmbito && ' · exige ámbito de tren'}
                    </div>
                    {p.advertencia && (
                      <div style={{ fontSize: 11.5, marginTop: 6, color: '#8c1414', lineHeight: 1.4 }}>
                        <Icono n="alerta" size={12} /> {p.advertencia}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {(catalogo?.grupos || []).map((g: any) => (
              <div key={g.grupo} className="detail-sec">
                <h4>{g.grupo}</h4>
                {g.nota && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{g.nota}</div>}
                {g.permisos.map((p: any) => (
                  <label key={p.code} className="permiso">
                    <input type="checkbox" checked={marcados.has(p.code)}
                      onChange={() => alternar(p.code)} />
                    <span>
                      <b>{p.nombre}</b>
                      <span className="permiso-explica">{p.explica}</span>
                      {p.cuidado && (
                        <span className="permiso-cuidado">
                          <Icono n="alerta" size={13} /> {p.cuidado}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            {marcados.size} permiso(s) marcado(s).
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" onClick={guardar} disabled={guardando || !nombre.trim()}>
            {guardando ? 'Guardando…' : edita.nuevo ? 'Crear rol' : 'Guardar cambios'}
          </button>
        </Modal>
      )}
    </div>
  );
}
