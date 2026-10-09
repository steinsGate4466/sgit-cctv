import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * SEGURIDAD ANTES DE EMPEZAR — bloque 168.
 *
 * «Los formularios de seguridad no se autocompletan o dejan a criterio
 * técnico.» Aquí ya no: el servidor calcula, de lo DECLARADO del equipo y su
 * zona (altura, permiso eléctrico, firma de intervención, ambiente, tablero),
 * qué hay que confirmar antes de empezar, qué EPP y qué riesgos. El técnico
 * marca; no decide qué marcar. El servidor vuelve a comprobarlo al abrir.
 *
 * El acompañante no se marca aquí: se elige en la lista de la orden.
 */
export interface Perfil {
  enAltura: boolean; bloqueoElectrico: boolean; parada: boolean; personasMinimas: number;
  medio: string | null; medioOrigen: string | null; alturaM: number | null; comoLlegar: string | null;
  requisitos: { clave: string; texto: string; porque: string }[];
  epp: string[]; riesgos: string[]; impactoProduccion: string; faltaDeclarar: string[];
}

export default function SeguridadAlEmpezar({ ruta, onChange }: {
  /** `/seguridad/orden/<id>` o `/seguridad/activo/<id>`. */
  ruta: string;
  onChange: (marcados: string[], perfil: Perfil | null) => void;
}) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [fallo, setFallo] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    api.get(ruta)
      .then((r) => { if (vivo) { setPerfil(r.data); onChange([], r.data); } })
      .catch(() => { if (vivo) { setFallo(true); onChange([], null); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  function marcar(clave: string, si: boolean) {
    const nuevos = si ? [...new Set([...marcados, clave])] : marcados.filter((c) => c !== clave);
    setMarcados(nuevos);
    onChange(nuevos, perfil);
  }

  if (fallo) return <div className="seguridad-trabajo mal">No se pudo leer la seguridad del trabajo. Sin ella no se puede abrir la orden.</div>;
  if (!perfil) return <div className="seguridad-trabajo">Preparando la seguridad del trabajo…</div>;

  const marcables = perfil.requisitos.filter((r) => r.clave !== 'ACOMPANANTE');
  const completos = marcables.every((r) => marcados.includes(r.clave));
  const etiquetas = [
    perfil.enAltura && `En altura${perfil.alturaM != null ? ` · ${perfil.alturaM} m` : ''}`,
    perfil.medio && `Medio: ${perfil.medio.toLowerCase().replace('_', ' ')}${perfil.medioOrigen === 'zona' ? ' (propuesto por la zona)' : ''}`,
    perfil.bloqueoElectrico && 'Bloqueo eléctrico',
    perfil.parada && 'Con parada',
    perfil.personasMinimas >= 2 && 'Mínimo 2 personas',
  ].filter(Boolean) as string[];

  return (
    <section className={'seguridad-trabajo' + (completos ? ' completa' : '')} aria-label="Seguridad antes de empezar">
      <h4>Seguridad antes de empezar</h4>
      {etiquetas.length > 0 && <div className="seg-etiquetas">{etiquetas.map((e) => <span key={e}>{e}</span>)}</div>}
      <p className="seg-impacto">{perfil.impactoProduccion}</p>
      {perfil.comoLlegar && <p className="seg-llegar"><b>Cómo llegar:</b> {perfil.comoLlegar}</p>}

      <ul className="seg-requisitos">
        {marcables.map((r) => (
          <li key={r.clave}>
            <label>
              <input type="checkbox" checked={marcados.includes(r.clave)} onChange={(e) => marcar(r.clave, e.target.checked)} />
              <span><b>{r.texto}</b><small>{r.porque}</small></span>
            </label>
          </li>
        ))}
      </ul>

      <div className="seg-listas">
        <div><b>Riesgos</b><ul>{perfil.riesgos.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><b>EPP</b><ul>{perfil.epp.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>

      {perfil.faltaDeclarar.length > 0 && (
        <p className="seg-falta">
          {`Sin declarar (el perfil puede quedarse corto): ${perfil.faltaDeclarar.join(' · ')}.`}
        </p>
      )}
    </section>
  );
}
