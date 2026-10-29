import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * QUÉ FICHA TÉCNICA TIENE ESTA CÁMARA — bloque 184.
 *
 * De la ficha (modelo + lente) sale lo que el mapa dibuja: hasta dónde se ve
 * una cara, a una persona, qué hace o que hay alguien. Se ELIGE del catálogo,
 * nunca se escribe aquí: los números los carga alguien con el PDF del
 * fabricante y los verifica otra persona (Equipos › Fichas técnicas).
 *
 * Las del MISMO modelo que la cámara salen primero: lo normal es elegir sólo
 * la lente. Las demás quedan debajo, por si el modelo se escribió distinto.
 */
interface Ficha { id: string; lente: string; marca: string; modelo: string; verificada: boolean }

const igual = (a?: string | null, b?: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export default function ElegirFichaOptica({ valor, marca, modelo, onChange }: {
  valor: string | null | undefined;
  marca?: string;
  modelo?: string;
  /** `null` = quitarle la ficha (es una respuesta, no un vacío). */
  onChange: (id: string | null) => void;
}) {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);

  useEffect(() => {
    let vivo = true;
    api.get('/modelos/fichas')
      .then((r) => { if (vivo) setFichas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) setFichas([]); });
    return () => { vivo = false; };
  }, []);

  const suyas = (fichas ?? []).filter((f) => igual(f.marca, marca) && igual(f.modelo, modelo));
  const otras = (fichas ?? []).filter((f) => !suyas.includes(f));
  const fila = (f: Ficha, conModelo: boolean) => (
    <option key={f.id} value={f.id}>
      {(conModelo ? `${f.marca} ${f.modelo} · ` : '') + f.lente + (f.verificada ? '' : ' (sin verificar)')}
    </option>
  );

  return (
    <>
      <label>Ficha técnica (lo que ve)
        <select value={valor || ''} disabled={fichas === null}
          onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{fichas === null ? 'Cargando fichas…' : '— sin ficha —'}</option>
          {suyas.length > 0 && <optgroup label="De este modelo">{suyas.map((f) => fila(f, false))}</optgroup>}
          {otras.length > 0 && <optgroup label="Otros modelos">{otras.map((f) => fila(f, true))}</optgroup>}
        </select>
      </label>
      {fichas !== null && !suyas.length && (
        <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
          {modelo ? 'Este modelo no tiene ficha todavía. ' : 'Escribe arriba la marca y el modelo. '}
          <a href={`/fichas${modelo ? `?q=${encodeURIComponent(modelo)}` : ''}`} target="_blank" rel="noopener noreferrer">
            Fichas técnicas
          </a>
        </div>
      )}
    </>
  );
}
