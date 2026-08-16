import { useState } from 'react';
import { useDialogos } from './Dialogos';

/**
 * FOTOGRAFÍAS EN EL MOMENTO DEL ALTA.
 *
 * POR QUÉ EXISTE
 * Antes las fotos solo se podían subir desde la ficha del activo, DESPUÉS de
 * crearlo: el técnico tenía que registrar el equipo, cerrar el formulario,
 * buscarlo en la lista, abrirlo y recién ahí subir la foto. Parado frente a la
 * cámara, con guantes, en el piso del tren, eso no ocurre nunca — y el mapeo
 * termina sin una sola fotografía.
 *
 * Aquí las fotos se eligen mientras se registra. Se guardan en memoria y se
 * suben en cuanto el activo existe: no se puede subir a un activo que aún no
 * tiene identificador.
 *
 * En el teléfono, `capture="environment"` abre la cámara trasera directamente
 * en vez del explorador de archivos.
 */

export interface FotoPendiente {
  file: File;
  kind: string;
  caption: string;
  /** Vista previa local, para que el técnico confirme que salió bien. */
  url: string;
}

export const TIPOS_FOTO: { v: string; t: string; ayuda: string }[] = [
  {
    v: 'APUNTA',
    t: 'Imagen en pantalla del púlpito',
    ayuda: 'Foto de lo que se ve en el monitor: confirma a qué apunta la cámara.',
  },
  {
    v: 'REFERENCIA',
    t: 'Ubicación de referencia',
    ayuda: 'El entorno del equipo, para que otro pueda encontrarlo. La más importante.',
  },
  {
    v: 'PLANO',
    t: 'Ubicación en plano',
    ayuda: 'Marca del punto sobre un plano, si lo tienes.',
  },
  {
    v: 'GENERAL',
    t: 'Otra del equipo',
    ayuda: 'Rótulo, número de serie, estado del gabinete, daños visibles.',
  },
];

interface Props {
  fotos: FotoPendiente[];
  onChange: (f: FotoPendiente[]) => void;
}

export default function AssetPhotoPicker({ fotos, onChange }: Props) {
  const { avisar } = useDialogos();
  const [kind, setKind] = useState('REFERENCIA');
  const [caption, setCaption] = useState('');

  async function agregar(files: FileList | null) {
    if (!files || !files.length) return;
    const nuevas: FotoPendiente[] = [];
    for (const file of Array.from(files)) {
      // 12 MB es el tope que acepta el servidor. Se avisa aquí para no
      // descubrirlo recién al guardar, cuando ya se perdió el trabajo.
      if (file.size > 12 * 1024 * 1024) {
        await avisar(`"${file.name}" pesa más de 12 MB y no se puede subir.`);
        continue;
      }
      nuevas.push({ file, kind, caption: caption.trim(), url: URL.createObjectURL(file) });
    }
    if (nuevas.length) onChange([...fotos, ...nuevas]);
    setCaption('');
  }

  function quitar(i: number) {
    const f = fotos[i];
    if (f) URL.revokeObjectURL(f.url);
    onChange(fotos.filter((_, k) => k !== i));
  }

  const ayuda = TIPOS_FOTO.find((t) => t.v === kind)?.ayuda;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid #e5e7eb' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
        Fotografías del equipo
      </div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
        Tómalas ahora, estando frente al equipo. Se suben solas al guardar.
        La de <strong>referencia</strong> es la que permite que otro técnico lo
        encuentre después.
      </div>

      <label>Tipo de fotografía</label>
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {TIPOS_FOTO.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
      </select>
      {ayuda && (
        <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>{ayuda}</div>
      )}

      <label>Descripción (opcional)</label>
      <input value={caption} onChange={(e) => setCaption(e.target.value)}
        placeholder="Ej: vista desde el púlpito hacia la grúa 2" />

      <label>Tomar o elegir foto</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => { agregar(e.target.files); e.currentTarget.value = ''; }}
      />
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        En el celular abre la cámara directamente. Puedes agregar varias.
      </div>

      {fotos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            {fotos.length} foto{fotos.length === 1 ? '' : 's'} lista{fotos.length === 1 ? '' : 's'} para subir
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* Bloque 40: la CLAVE es la url del objeto, no el índice.
                Con el índice, al quitar la foto 2 React reutiliza su nodo para
                la 3 y la vista previa que se ve no es la del archivo que
                queda — se borra una y desaparece otra. `URL.createObjectURL`
                devuelve un identificador único y estable mientras la foto
                viva, que es exactamente lo que hace falta. */}
            {fotos.map((f, i) => (
              <div key={f.url} style={{
                border: '1px solid #e5e7eb', borderRadius: 8, padding: 6,
                width: 128, position: 'relative',
              }}>
                <img src={f.url} alt="" style={{
                  width: '100%', height: 80, objectFit: 'cover', borderRadius: 4,
                }} />
                <div style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>
                  {TIPOS_FOTO.find((t) => t.v === f.kind)?.t || f.kind}
                </div>
                {f.caption && (
                  <div className="muted" style={{ fontSize: 10 }}>{f.caption}</div>
                )}
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  title="Quitar"
                  style={{
                    position: 'absolute', top: 2, right: 2, border: 'none',
                    background: '#dc2626', color: '#fff', borderRadius: 4,
                    width: 20, height: 20, cursor: 'pointer', lineHeight: 1,
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
