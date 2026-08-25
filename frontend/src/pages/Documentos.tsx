import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import Icono from '../components/Iconos';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';
import { fecha } from '../fechas';
import { mensajeDeError } from '../avisos';

/**
 * DOCUMENTOS: MANUALES, PLANOS Y FICHAS (bloque 12.7).
 *
 * PARA QUÉ SIRVE
 * El técnico está frente a un NVR que no arranca, a las once de la noche, y
 * necesita el manual. Hoy eso significa llamar a alguien. Con esto, lo tiene.
 *
 * Cada documento cuelga de un equipo o de una ubicación — nunca suelto: un
 * documento que no cuelga de nada no lo encuentra nadie.
 */

const CATEGORIAS = [
  { v: 'MANUAL', t: 'Manual' },
  { v: 'DIAGRAMA', t: 'Diagrama' },
  { v: 'PLANO', t: 'Plano' },
  { v: 'FOTO', t: 'Foto' },
  { v: 'CONFIG', t: 'Configuración' },
  { v: 'BACKUP', t: 'Respaldo' },
];
const ETIQUETA: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.v, c.t]));

export default function Documentos() {
  const { confirmar, avisar } = useDialogos();
  const { can } = useAuth();
  const puedeSubir = can('document.manage');

  const [lista, setLista] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('');

  const [subiendo, setSubiendo] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [cat, setCat] = useState('MANUAL');
  const [assetId, setAssetId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorModal, setErrorModal] = useState('');
  const [activos, setActivos] = useState<any[]>([]);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/documentos', {
        params: { ...(q.trim() ? { q: q.trim() } : {}), ...(categoria ? { categoria } : {}) },
      });
      setLista(r.data || []);
      setFallo('');
    } catch (e: any) {
      setFallo(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver documentos.'
        : 'No se pudieron cargar los documentos.');
    }
  }, [q, categoria]);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function abrirNuevo() {
    setNuevo(true); setTitulo(''); setCat('MANUAL'); setAssetId('');
    setLocationId(''); setArchivo(null); setErrorModal('');
    try {
      const [a, u] = await Promise.all([
        api.get('/assets', { params: { limit: 300 } }).then((r) => r.data?.items || r.data || []),
        api.get('/locations').then((r) => r.data?.items || r.data || []),
      ]);
      setActivos(a); setUbicaciones(u);
    } catch { setActivos([]); setUbicaciones([]); }
  }

  async function guardar() {
    if (!archivo) { setErrorModal('Elige el archivo.'); return; }
    if (!titulo.trim()) { setErrorModal('Ponle un título.'); return; }
    if (!assetId && !locationId) {
      setErrorModal('Indica a qué equipo o a qué ubicación pertenece.');
      return;
    }
    setSubiendo(true); setErrorModal('');
    const fd = new FormData();
    fd.append('file', archivo);
    fd.append('title', titulo.trim());
    fd.append('category', cat);
    if (assetId) fd.append('assetId', assetId);
    if (locationId) fd.append('locationId', locationId);
    try {
      await api.post('/documentos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNuevo(false);
      await cargar();
    } catch (e: any) {
      // El servidor manda mensajes escritos para entenderse ("ese archivo no
      // coincide con su extensión"). Se enseñan tal cual.
      setErrorModal(mensajeDeError(e, 'subir el documento'));
    } finally { setSubiendo(false); }
  }

  async function descargar(id: string, titulo: string) {
    try {
      const r = await api.get(`/documentos/${id}/descargar`, { responseType: 'blob' });
      const nombre =
        /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || titulo;
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo descargar.'); }
  }

  async function borrar(id: string, titulo: string, version: number) {
    if (!(await confirmar(`¿Borrar «${titulo}» v${version}?\n\nNo se puede deshacer.`))) return;
    try { await api.delete(`/documentos/${id}`); await cargar(); }
    catch { await avisar('No se pudo borrar.'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="fila-busqueda" style={{ flex: 1 }}>
          <input aria-label="Buscar documento" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título" />
          <select aria-label="Filtrar por categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
          </select>
        </div>
        {puedeSubir && (
          <button className="btn-primary" onClick={abrirNuevo}>
            <Icono n="etiqueta" size={16} /> Subir documento
          </button>
        )}
      </div>

      <div className="card explica">
        <b>Manuales, planos, fichas y configuraciones.</b> Cada uno cuelga de un
        equipo o de una ubicación, para que aparezca al buscarlo.
        <div style={{ marginTop: 6, fontSize: 12.5 }}>
          Subir un archivo con el mismo título <b>no borra el anterior</b>: crea
          una versión nueva. Un plano viejo sigue diciendo cómo estaba la planta.
        </div>
      </div>

      {fallo && <div className="card aviso-error">{fallo}</div>}
      {cargando && <EsqueletoTabla filas={4} />}

      {!cargando && lista.length === 0 ? (
        <div className="card vacio">
          <h3>Todavía no hay documentos</h3>
          <p>
            Manuales, planos de canalización y configuraciones de switches.
          </p>
        </div>
      ) : !cargando && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Título</th><th>Categoría</th><th>Pertenece a</th>
              <th>Versión</th><th>Subido</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.title}</strong></td>
                <td>{ETIQUETA[d.category] || d.category}</td>
                <td>{d.asset?.assetCode || d.location?.name || '—'}</td>
                <td>v{d.version}</td>
                <td>{fecha(d.createdAt)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => descargar(d.id, d.title)}>Descargar</button>
                  {puedeSubir && (
                    <button className="btn-mini" style={{ marginLeft: 6 }}
                            onClick={() => borrar(d.id, d.title, d.version)}>Borrar</button>
                  )}
                
                  {/* Borrado definitivo. Solo lo pinta si eres Jefe de Mantenimiento. */}
                  <BotonPurgar recurso="documento" id={d.id} onBorrado={() => cargar()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nuevo && (
        <Modal
          title="Subir documento"
          onClose={() => setNuevo(false)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setNuevo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardar} disabled={subiendo}>
                {subiendo ? 'Subiendo…' : 'Subir'}
              </button>
            </>
          }
        >
          {errorModal && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{errorModal}</div>}

          <label className="campo">
            <span>Título</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                   placeholder="Ej: Manual NVR Hikvision DS-7616" maxLength={160} />
          </label>

          <label className="campo">
            <span>Categoría</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
            </select>
          </label>

          <label className="campo">
            <span>Equipo (opcional si eliges ubicación)</span>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">— ninguno —</option>
              {activos.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.assetCode}{a.referencePlace ? ` — ${a.referencePlace}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Ubicación (opcional si eliges equipo)</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— ninguna —</option>
              {ubicaciones.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>

          <label className="campo">
            <span>Archivo</span>
            <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <small className="muted">
              PDF, DOCX, XLSX, JPG, PNG, DWG, TXT, CFG, LOG o CSV. Hasta 25 MB.
              Se comprueba el <b>contenido</b>, no la extensión: un archivo
              renombrado no entra.
            </small>
          </label>
        </Modal>
      )}
    </div>
  );
}
