import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Icono from '../components/Iconos';

/**
 * FICHA RÁPIDA DEL GABINETE — destino del QR pegado en la puerta (5a).
 *
 * POR QUÉ EXISTE, SI YA HAY QR EN CADA EQUIPO
 * El técnico que llega a planta no se planta delante de una cámara: se
 * planta delante de un ARMARIO CERRADO. El QR del activo sirve cuando ya
 * sabes cuál es; éste sirve para LLEGAR, que es el paso de antes.
 *
 * Lo primero que se ve son dos cosas, en este orden:
 *   1. ¿Hay algo mal aquí dentro?
 *   2. ¿Ya hay alguien en ello?
 *
 * La segunda importa más de lo que parece: sin ella, dos técnicos se plantan
 * el mismo día delante del mismo armario a hacer el mismo trabajo.
 *
 * Se reutiliza el diseño de la ficha del activo (`scan-*`): quien escanea un
 * QR debe encontrarse siempre lo mismo, venga de un equipo o de un armario.
 */
export default function CabinetScan() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    api.get(`/cabinets/${id}/ficha`)
      .then((r) => setD(r.data))
      .catch((e) => setFallo(
        e?.response?.status === 404
          ? 'Este gabinete ya no existe en el sistema.'
          : 'No se pudo cargar. Comprueba la señal y vuelve a intentarlo.',
      ))
      .finally(() => setCargando(false));
  }, [id]);

  if (cargando) return <div className="loading">Abriendo el gabinete…</div>;

  if (fallo) {
    return (
      <div className="scan-wrap">
        <div className="card vacio">
          <h3>No se pudo abrir</h3>
          <p>{fallo}</p>
        </div>
      </div>
    );
  }

  const mal = d.caidos > 0;

  return (
    <div className="scan-wrap">
      <div className="scan-head">
        <div>
          <div className="scan-code">{d.code}</div>
          <div className="muted" style={{ fontSize: 13 }}>{d.name}</div>
        </div>
        <span className={'badge ' + (mal ? 'FUERA_SERVICIO' : 'OPERATIVO')}>
          {mal ? `${d.caidos} con problema` : 'Todo operativo'}
        </span>
      </div>

      {/* Lo primero, en una frase. El número solo no dice si preocuparse. */}
      <div className={mal ? 'error' : 'sign-note'}>{d.resumen}</div>

      {(d.lugar || d.ubicacion) && (
        <div className="scan-note" style={{ marginTop: 10 }}>
          <Icono n="ubicacion" size={16} />
          <span>{[d.lugar, d.ubicacion].filter(Boolean).join(' · ')}</span>
        </div>
      )}

      {/* ------ ¿YA HAY ALGUIEN EN ESTO? Va ANTES que la lista de equipos:
                 es lo que evita que dos técnicos hagan el mismo trabajo. ---- */}
      {d.ordenes?.length > 0 && (
        <>
          <div className="section-title">Ya hay trabajo abierto aquí</div>
          <div className="card scan-card">
            {d.ordenes.map((o: any) => (
              <div className="frow" key={o.id}>
                <span className="k">
                  <b>{o.code}</b> · {o.asset?.assetCode || 'sin equipo'}
                  <br />
                  <span style={{ fontSize: 11 }}>{o.activity || '—'}</span>
                </span>
                <span className="v">
                  <span className={'badge ' + o.status}>{o.status}</span>
                  <br />
                  <span style={{ fontSize: 11 }}>{o.technician?.fullName || 'sin asignar'}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Qué hay dentro</div>
      {d.equipos.length === 0 ? (
        <div className="card vacio">
          <h3>Sin equipos registrados</h3>
          <p>
            Este gabinete todavía no tiene equipos en el sistema. Si dentro hay
            algo, es un punto de mapeo pendiente.
          </p>
        </div>
      ) : (
        <div className="card scan-card">
          {d.equipos.map((a: any) => (
            <div className="frow" key={a.id}>
              <span className="k">
                <b>{a.assetCode}</b>
                <br />
                <span style={{ fontSize: 11 }}>{a.referencePlace || a.type}</span>
              </span>
              <span className="v">
                <span className={'badge ' + a.estadoEfectivo}>{a.estadoEfectivo}</span>
                {/* Se puede saltar del armario al equipo: es el recorrido
                    natural — llego, veo cuál falla, lo abro. */}
                <br />
                <button className="btn-mini" style={{ marginTop: 4 }}
                        onClick={() => nav(`/a/${a.id}`)}>
                  Abrir ficha
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {d.tieneFoto && (
        <>
          <div className="section-title">Foto del gabinete</div>
          <img
            src={`${(import.meta as any).env?.VITE_API_URL || ''}/cabinets/${d.id}/photo`}
            alt={`Gabinete ${d.code}`}
            style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)' }}
          />
        </>
      )}

      {d.notas && (
        <div className="scan-note" style={{ marginTop: 14 }}>
          <Icono n="mapeo" size={16} />
          <span>{d.notas}</span>
        </div>
      )}

      <div className="scan-actions">
        <button className="btn-primary" onClick={() => nav('/incidents')}>
          Reportar algo de este gabinete
        </button>
        <button className="btn-mini" onClick={() => nav('/cabinets')}>
          Ver todos los gabinetes
        </button>
      </div>
    </div>
  );
}
