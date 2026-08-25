import { useState, FormEvent } from 'react';
import { api } from '../api/client';
import Icono from './Iconos';
import BotonConMotivo from './BotonConMotivo';
import { queFalta } from '../avisos';

/**
 * Formulario de solicitud de acceso especial (activo inaccesible / trabajo en altura).
 * Se usa desde DOS lugares con el mismo código, para no duplicar la regla de negocio:
 *  - Activos  → el técnico marca el activo como inaccesible mientras lo está viendo.
 *  - Accesibilidad → alta directa desde la bandeja.
 *
 * Se resuelve en 2 pasos guiados para que el formulario no abrume:
 *  Paso 1: por qué es inaccesible + seguridad (SSOMA)
 *  Paso 2: fotografías que lo evidencian (sin ellas el Jefe no puede aprobar)
 */

export const MEANS = ['MANLIFT', 'GRUA', 'ANDAMIO', 'ESCALERA', 'LINEA_VIDA', 'OTRO'];
export const MEANS_ES: Record<string, string> = {
  MANLIFT: 'Manlift (plataforma elevadora)', GRUA: 'Grúa / izaje', ANDAMIO: 'Andamio',
  ESCALERA: 'Escalera', LINEA_VIDA: 'Línea de vida', OTRO: 'Otro',
};
export const STATUS_ES: Record<string, string> = {
  SOLICITADO: 'Solicitado', EN_REVISION: 'En revisión', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado',
};
export const STATUS_BADGE: Record<string, string> = {
  SOLICITADO: 'MANTENIMIENTO', EN_REVISION: 'CON_INCIDENCIA', APROBADO: 'OPERATIVO', RECHAZADO: 'FUERA_SERVICIO',
};
const LOCATION_KINDS = ['Poste', 'Estructura metálica', 'Grúa / puente grúa', 'Techo', 'Torre', 'Muro alto', 'Otro'];
const REASONS = [
  { v: 'ALTURA', t: 'Altura (no se alcanza sin plataforma)' },
  { v: 'ESTRUCTURA', t: 'Sobre estructura o grúa en movimiento' },
  { v: 'ESPACIO', t: 'Espacio confinado / sin punto de apoyo' },
  { v: 'ENTORNO', t: 'Entorno de riesgo (calor, escoria, tránsito)' },
  { v: 'OTRO', t: 'Otra razón' },
];
export const ALTURA_MIN = 1.8;

interface Props {
  assetId?: string;              // si viene, el activo queda fijo (entrada desde Activos)
  assetCode?: string;
  assets?: any[];                // si no hay assetId, se muestra el selector
  onDone: (created?: any) => void;
}

export default function AccessRequestForm({ assetId, assetCode, assets, onDone }: Props) {
  const [step, setStep] = useState(1);
  const [created, setCreated] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [f, setF] = useState<any>({
    assetId: assetId || '',
    reason: 'ALTURA',
    heightMeters: '',
    means: 'MANLIFT',
    locationKind: 'Poste',
    justification: '',
    accessRoute: '',
    requiresPetar: true,
    hasIperc: false,
    hasAts: false,
    personnelCount: 2,
    eppDetail: 'Arnés de cuerpo entero, línea de vida con absorbedor, casco con barbiquejo',
    risks: '',
    productionImpact: '',
  });

  // Fotos (paso 2)
  const [photos, setPhotos] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const enAltura = Number(f.heightMeters) >= ALTURA_MIN;

  async function submitStep1(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!f.assetId) { setErr('Selecciona el activo.'); return; }
    if ((f.justification || '').trim().length < 20) {
      setErr('Describe con detalle por qué es inaccesible (mínimo 20 caracteres). Es el sustento del gasto de manlift.');
      return;
    }
    setSaving(true);
    try {
      const motivo = REASONS.find((r) => r.v === f.reason)?.t || '';
      const body: any = {
        assetId: f.assetId,
        means: f.means,
        locationKind: f.locationKind || undefined,
        justification: `[${motivo}] ${f.justification}`,
        accessRoute: f.accessRoute || undefined,
        requiresPetar: !!f.requiresPetar,
        hasIperc: !!f.hasIperc,
        hasAts: !!f.hasAts,
        eppDetail: f.eppDetail || undefined,
        risks: f.risks || undefined,
        productionImpact: f.productionImpact || undefined,
      };
      if (f.heightMeters) body.heightMeters = Number(f.heightMeters);
      if (f.personnelCount) body.personnelCount = Number(f.personnelCount);
      const res = await api.post('/access-requests', body);
      setCreated(res.data);
      setStep(2);
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(', ') : m || 'No se pudo registrar la solicitud.');
    } finally { setSaving(false); }
  }

  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!file) { setErr('Selecciona una imagen.'); return; }
    setUploading(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file); if (caption) fd.append('caption', caption);
      await api.post('/access-requests/' + created.id + '/photos', fd);
      setFile(null); setCaption('');
      const ph = await api.get('/access-requests/' + created.id + '/photos').then((r) => r.data).catch(() => []);
      setPhotos(ph || []);
    } catch { setErr('No se pudo subir la imagen.'); }
    finally { setUploading(false); }
  }

  // ---------------- Paso 2: evidencia ----------------
  if (step === 2) {
    return (
      <div>
        <div className="sign-note" style={{ background: '#e7f7ee', borderColor: '#bfe9cf', color: '#15803d' }}>
          ✓ Solicitud <b>{created?.code}</b> registrada. Ahora adjunta las fotos que evidencian
          la inaccesibilidad: <b>sin evidencia el Jefe no puede aprobarla</b>.
        </div>
        <form onSubmit={uploadPhoto}>
          <label>Fotografía (JPG / PNG)
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <label>¿Qué muestra?
            <input value={caption} onChange={(e) => setCaption(e.target.value)}
            placeholder="Ej: altura del montaje sobre el puente grúa" />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="btn-mini" style={{ marginTop: 10 }} disabled={uploading}>
            {uploading ? 'Subiendo…' : '+ Agregar fotografía'}
          </button>
        </form>

        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            {photos.length} fotografía(s) adjuntas
          </div>
          {photos.map((p) => (
            <div key={p.id} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #eee' }}>
              <Icono n="camara" size={14} /> {p.caption || '(sin descripción)'}
            </div>
          ))}
          {!photos.length && (
            <div className="error">Aún sin evidencia fotográfica.</div>
          )}
        </div>

        <BotonConMotivo className="btn" onClick={() => onDone(created)}
          falta={queFalta([!photos.length,
            'Adjunta al menos una foto. Sin evidencia el Jefe no puede revisar el acceso.'])}>
          {photos.length ? 'Finalizar y enviar a revisión del Jefe' : 'Adjunta al menos una foto'}
        </BotonConMotivo>
      </div>
    );
  }

  // ---------------- Paso 1: sustento ----------------
  return (
    <form onSubmit={submitStep1}>
      <div className="sign-note">
        <b>Paso 1 de 2 · Sustento</b><br />
        Indica por qué el equipo no se puede intervenir de forma normal.
      </div>

      {assetId ? (
        <div className="frow" style={{ marginBottom: 6 }}>
          <span className="k">Activo</span><span className="v">{assetCode}</span>
        </div>
      ) : (
        <>
          <label>Activo inaccesible
            <select value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })} required>
            <option value="">— selecciona —</option>
            {(assets || []).map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
          </select>
          </label>
        </>
      )}

      <label>Motivo principal
        <select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
        {REASONS.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
      </select>
      </label>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label>Altura estimada (m)
            <input type="number" step="0.1" min="0" value={f.heightMeters}
            onChange={(e) => setF({ ...f, heightMeters: e.target.value, requiresPetar: Number(e.target.value) >= ALTURA_MIN ? true : f.requiresPetar })} />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <label>Medio requerido
            <select value={f.means} onChange={(e) => setF({ ...f, means: e.target.value })}>
            {MEANS.map((m) => <option key={m} value={m}>{MEANS_ES[m]}</option>)}
          </select>
          </label>
        </div>
      </div>

      {enAltura && (
        <div className="error" style={{ marginTop: 8 }}>
          ⚠️ Clasifica como <b>trabajo en altura</b> (≥ 1.80 m): exige PETAR, personal acreditado y EPP anticaídas.
        </div>
      )}

      <label>¿Dónde está montado?
        <select value={f.locationKind} onChange={(e) => setF({ ...f, locationKind: e.target.value })}>
        {LOCATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      </label>

      <label>¿Por qué no se puede intervenir sin ese medio?
        <textarea value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })}
        rows={3} style={{ width: '100%', resize: 'vertical' }}
        placeholder="Ej: cámara a 7 m sobre la estructura del puente grúa; no hay punto de anclaje ni escalera fija, y el tránsito de material impide armar andamio." required />
      </label>

      <label>Ruta de acceso / restricciones
        <input value={f.accessRoute} onChange={(e) => setF({ ...f, accessRoute: e.target.value })}
        placeholder="Ej: ingreso por nave 2; coordinar detención del puente grúa" />
      </label>

      <h4 style={{ marginTop: 16, marginBottom: 6 }}><Icono n="seguridad" size={15} /> Seguridad (SSOMA)</h4>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
          <input type="checkbox" checked={!!f.requiresPetar} onChange={(e) => setF({ ...f, requiresPetar: e.target.checked })} style={{ width: 'auto' }} />
          PETAR
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
          <input type="checkbox" checked={!!f.hasIperc} onChange={(e) => setF({ ...f, hasIperc: e.target.checked })} style={{ width: 'auto' }} />
          IPERC
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
          <input type="checkbox" checked={!!f.hasAts} onChange={(e) => setF({ ...f, hasAts: e.target.checked })} style={{ width: 'auto' }} />
          ATS
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Personal</span>
          <input aria-label="Impacto en producción" type="number" min={1} value={f.personnelCount}
            onChange={(e) => setF({ ...f, personnelCount: e.target.value })} style={{ width: 70 }} />
        </div>
      </div>

      <label>EPP requerido
        <textarea value={f.eppDetail} onChange={(e) => setF({ ...f, eppDetail: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }} />
      </label>
      <label>Riesgos identificados
        <textarea value={f.risks} onChange={(e) => setF({ ...f, risks: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }}
        placeholder="Ej: caída a distinto nivel, carga suspendida, calor radiante del horno" />
      </label>
      <label>Impacto en producción
        <input value={f.productionImpact} onChange={(e) => setF({ ...f, productionImpact: e.target.value })}
        placeholder="Ej: detener puente grúa 40 min, coordinar con Jefe de Línea" />
      </label>

      {err && <div className="error">{err}</div>}
      <button className="btn" disabled={saving}>{saving ? 'Registrando…' : 'Continuar a evidencia fotográfica →'}</button>
    </form>
  );
}
