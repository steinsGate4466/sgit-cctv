import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import Icono from '../components/Iconos';

/**
 * FICHA RÁPIDA DEL TABLERO — destino del QR pegado en su puerta (bloque 146).
 *
 * =============================================================================
 *  POR QUÉ EXISTE
 * =============================================================================
 *  Pedida por el usuario, con el caso de planta delante:
 *
 *  > «Si el switch pierde electricidad, pierde el 220, ¿cómo lo restauramos?
 *  >  **Ni siquiera sabemos dónde está el tablero.** Ese tablero eléctrico
 *  >  también tiene que estar segmentado para poder generarle un QR y saber
 *  >  dónde está ubicado.»
 *
 *  El QR del activo (bloque 5a) sirve cuando ya sabes qué equipo es. El del
 *  gabinete (5c) sirve para llegar al armario. Éste es el TERCERO y el primero
 *  de la cadena: **sin corriente no hay switch, y sin switch no hay cámara.**
 *
 * =============================================================================
 *  SE ESCANEA PARA LO CONTRARIO QUE LOS OTROS DOS
 * =============================================================================
 *  Los otros QR contestan «¿qué es esto?». Éste casi siempre contesta la
 *  pregunta inversa, y con la mano ya en la llave:
 *
 *      **¿QUÉ SE APAGA SI BAJO ESTA LLAVE?**
 *
 *  Por eso el orden de la pantalla no es el de una ficha técnica:
 *
 *    1. QUÉ ES Y DÓNDE — para confirmar que es el tablero correcto. Bajar la
 *       llave equivocada para una nave.
 *    2. LOS RIESGOS — ANTES que ningún dato técnico. Si exige permiso
 *       eléctrico o bloqueo, eso se lee antes de abrir, no después.
 *    3. CADA LLAVE Y LO QUE CUELGA DE ELLA, con nombre. «3 equipos» no sirve
 *       delante del tablero: hace falta saber si uno es el switch que sostiene
 *       medio tren.
 *
 *  SIN CREDENCIALES, como el PDF del técnico desde el bloque 5a: una etiqueta
 *  pegada en una puerta la lee cualquiera que pase por la sala eléctrica.
 */

const TIPO_ES: Record<string, string> = {
  GENERAL: 'General',
  DISTRIBUCION: 'Distribución',
  MCC: 'MCC — centro de control de motores',
  UPS: 'UPS',
  OTRO: 'Otro',
};

const TIPO_EQUIPO: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'Grabador', SWITCH: 'Switch', WIRELESS: 'Antena',
  PC: 'PC', PANTALLA: 'Pantalla', DECODER: 'Decodificador',
};

export default function TableroScan() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  /* Bloque 115: la guardia va aunque `id` no cambie. Con la red de planta una
     respuesta vieja puede llegar después de la buena. */
  useEffect(() => {
    let vivo = true;
    api.get(`/electricidad/tableros/${id}/ficha`)
      .then((r) => { if (vivo) setD(r.data); })
      .catch((e) => {
        if (!vivo) return;
        setFallo(
          e?.response?.status === 404
            ? 'Este tablero ya no existe en el sistema.'
            : 'No se pudo cargar. Comprueba la señal y vuelve a intentarlo.',
        );
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id]);

  if (cargando) return <div className="loading">Abriendo el tablero…</div>;

  if (fallo) {
    return (
      <div className="scan-wrap">
        <h1 className="page-title">Tablero eléctrico</h1>
        <div className="card vacio">
          <h3>No se pudo abrir</h3>
          <p>{fallo}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-wrap">
      <h1 className="page-title">Tablero eléctrico</h1>

      {/* ---------- 1. QUÉ ES Y DÓNDE ---------- */}
      <div className="scan-head">
        <div>
          <div className="scan-code">{d.codigo}</div>
          <div className="muted" style={{ fontSize: 13 }}>{d.nombre}</div>
        </div>
        <span className="badge">{TIPO_ES[d.tipo] || d.tipo}</span>
      </div>

      {(d.donde || d.referencia) && (
        <div className="scan-note" style={{ marginTop: 10 }}>
          <Icono n="ubicacion" size={16} />
          <span>{[d.donde, d.referencia].filter(Boolean).join(' · ')}</span>
        </div>
      )}

      {d.comoLlegar && (
        <div className="scan-note">
          <Icono n="acceso" size={16} />
          <span>{d.comoLlegar}</span>
        </div>
      )}

      {/* ---------- 2. LOS RIESGOS, ANTES DE ABRIR ----------
          Va aquí y no al final a propósito: un aviso que se lee después de
          abrir la puerta no es un aviso. */}
      {d.riesgos && (
        <div className="error" style={{ marginTop: 12 }}>
          <b>Antes de abrir.</b> {d.riesgos}
        </div>
      )}

      {/* Los datos eléctricos, juntos y sin adornos. */}
      {(d.tensionV || d.fases || d.corrienteNominalA) && (
        <div className="card scan-card">
          <div className="frow">
            <span className="k">Tensión</span>
            <span className="v">{d.tensionV ? `${d.tensionV} V` : '—'}</span>
          </div>
          <div className="frow">
            <span className="k">Fases</span>
            <span className="v">{d.fases ?? '—'}</span>
          </div>
          <div className="frow">
            <span className="k">Corriente nominal</span>
            <span className="v">{d.corrienteNominalA ? `${d.corrienteNominalA} A` : '—'}</span>
          </div>
        </div>
      )}

      {/* DE DÓNDE VIENE LA CORRIENTE. Si este tablero está muerto, el
          siguiente sitio a mirar es el de arriba, y conviene tenerlo a mano
          sin volver a buscar. */}
      {d.alimentadoDe && (
        <div className="scan-note">
          <Icono n="electricidad" size={16} />
          <span>Cuelga de <b>{d.alimentadoDe.codigo}</b> · {d.alimentadoDe.nombre}</span>
        </div>
      )}

      {/* ---------- 3. QUÉ SE APAGA CON CADA LLAVE ---------- */}
      <div className="section-title">Qué se apaga con cada llave</div>

      {d.sinLevantar ? (
        <div className="card vacio">
          <h3>Este tablero no tiene circuitos cargados</h3>
          <p>
            Eso no significa que no los tenga: significa que <b>nadie los ha
            levantado todavía</b>. Hasta entonces no se puede saber qué se
            apaga al bajar una llave.
          </p>
        </div>
      ) : (
        <div className="card scan-card">
          {d.circuitos.map((c: any) => (
            <div className="frow" key={c.id}>
              <span className="k">
                <b>{c.numero}</b>
                {c.amperajeA ? <span className="muted"> · {c.amperajeA} A</span> : null}
                {c.esCctv && <span className="chip">CCTV</span>}
                <br />
                <span style={{ fontSize: 11 }}>{c.designacion || 'sin designación'}</span>
              </span>
              <span className="v">
                {c.alimenta.length === 0
                  ? <span className="muted" style={{ fontSize: 12 }}>nada declarado</span>
                  : c.alimenta.map((a: any) => (
                    <div key={a.assetCode} style={{ fontSize: 12 }}>
                      <b>{a.assetCode}</b>
                      <span className="muted">
                        {' '}{TIPO_EQUIPO[a.tipo] || a.tipo}
                        {a.viaPoe ? ' · por PoE' : ''}
                      </span>
                    </div>
                  ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Lo que está atornillado DENTRO. Distinto de lo que alimenta: eso
          puede estar a cien metros de aquí. */}
      {d.equiposMontados?.length > 0 && (
        <>
          <div className="section-title">Montado dentro de este tablero</div>
          <div className="card scan-card">
            {d.equiposMontados.map((e: any) => (
              <div className="frow" key={e.assetCode}>
                <span className="k"><b>{e.assetCode}</b></span>
                <span className="v">{TIPO_EQUIPO[e.type] || e.type}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="scan-note" style={{ marginTop: 14 }}>
        <Icono n="alerta" size={16} />
        <span>
          Esta ficha no lleva contraseñas: la etiqueta está en una puerta y la
          puede escanear cualquiera que pase.
        </span>
      </div>
    </div>
  );
}
