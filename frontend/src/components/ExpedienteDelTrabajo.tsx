import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { fecha } from '../fechas';
import { mensajeDeError } from '../avisos';
import Icono from './Iconos';

/**
 * EL EXPEDIENTE DEL TRABAJO — bloque 155.
 *
 * Palabras del usuario: «ahí debería almacenarse toda la información,
 * documentos, instalaciones, todo lo que está haciéndose, para los técnicos».
 *
 * Planos, actas, protocolos y configuraciones de UNA instalación o de UNA
 * orden, guardados en ella. El archivo pasa por la misma revisión que en
 * «Documentos» (los bytes tienen que coincidir con la extensión) y el mismo
 * título en el mismo trabajo se guarda como versión nueva: no se pisa.
 *
 * `base` es la ruta del trabajo: `/instalaciones/<id>` o `/work-orders/<id>`.
 */
const TIPOS = [
  { v: 'PLANO', t: 'Plano' },
  { v: 'DIAGRAMA', t: 'Diagrama / esquema' },
  { v: 'FOTO', t: 'Foto' },
  { v: 'CONFIG', t: 'Configuración' },
  { v: 'MANUAL', t: 'Manual / ficha' },
  { v: 'BACKUP', t: 'Respaldo' },
];
const TIPO_ES: Record<string, string> = Object.fromEntries(TIPOS.map((x) => [x.v, x.t]));

export default function ExpedienteDelTrabajo({ base, puedeSubir }: { base: string; puedeSubir: boolean }) {
  const { can } = useAuth();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('PLANO');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const r = await api.get(`${base}/documentos`).then((x) => x.data).catch(() => null);
    setDocs(Array.isArray(r) ? r : null);
  }, [base]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir(e: FormEvent) {
    e.preventDefault();
    if (!archivo) { setError('Elige el archivo.'); return; }
    setSubiendo(true); setError('');
    const fd = new FormData();
    fd.append('file', archivo);
    fd.append('title', titulo.trim() || archivo.name.replace(/\.[^.]+$/, ''));
    fd.append('category', tipo);
    try {
      await api.post(`${base}/documentos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTitulo(''); setArchivo(null);
      (e.target as HTMLFormElement).reset();
      await cargar();
    } catch (err) { setError(mensajeDeError(err, 'subir el documento')); }
    finally { setSubiendo(false); }
  }

  async function descargar(d: any) {
    try {
      const r = await api.get(`/documentos/${d.id}/descargar`, { responseType: 'blob' });
      const nombre = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || d.title;
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { setError(mensajeDeError(err, 'descargar')); }
  }

  return (
    <div className="expediente">
      <div className="section-title"><Icono n="etiqueta" size={14} /> Documentos del trabajo</div>
      {docs === null ? (
        <p className="muted">No se pudieron cargar los documentos.</p>
      ) : docs.length === 0 ? (
        <p className="muted">Todavía no hay documentos.</p>
      ) : (
        <table className="tabla">
          <thead><tr><th>Documento</th><th>Tipo</th><th>Versión</th><th>Subido</th><th></th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{TIPO_ES[d.category] || d.category}</td>
                <td>v{d.version}</td>
                <td>{fecha(d.createdAt)}</td>
                <td>
                  {can('document.read') && (
                    <button type="button" className="btn-mini" onClick={() => descargar(d)}>Descargar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {puedeSubir && (
        <form onSubmit={subir} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <label style={{ flex: '2 1 180px', margin: 0 }}>Título
            <input value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder="Si lo dejas vacío, el nombre del archivo" />
          </label>
          <label style={{ flex: '1 1 140px', margin: 0 }}>Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
            </select>
          </label>
          <label style={{ flex: '2 1 200px', margin: 0 }}>Archivo
            <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </label>
          <button className="btn-primary" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir'}</button>
        </form>
      )}
      {error && <div role="alert" className="aviso-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
