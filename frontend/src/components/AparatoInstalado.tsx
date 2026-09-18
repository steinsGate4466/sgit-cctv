import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';
import { fecha } from '../fechas';
import { mensajeDeError } from '../avisos';

/**
 * QUÉ APARATO ESTÁ PUESTO AQUÍ — bloque 106-B.
 *
 * =============================================================================
 *  POR QUÉ ESTE APARTADO EXISTE
 * =============================================================================
 *  Palabras del usuario: «imagínate que yo cambio la cámara y le pongo el mismo
 *  ID... tiene que ser de cero».
 *
 *  El activo es el SITIO —la cámara del lecho de enfriamiento, columna 14— y
 *  no se mueve. Lo que se cambia es el APARATO de dentro. Hasta el bloque
 *  106-A eran la misma fila, y al cambiar la cámara las tres averías de la
 *  anterior quedaban colgando de la nueva.
 *
 *  Aquí se ve lo que hay puesto, lo que hubo antes, y **cuántas veces se ha
 *  cambiado**: la frase del informe de reemplazo.
 *
 * =============================================================================
 *  MIRAR LO PUEDE TODO EL MUNDO. CAMBIAR, QUIEN EDITA LA FICHA.
 * =============================================================================
 *  No hay ni una credencial en esta respuesta, así que `activos.mirar` basta
 *  para leer. Poner y quitar va con `asset.update`: cambiar la cámara es el
 *  trabajo del técnico un martes por la tarde, y pedirle firma de supervisor
 *  sólo conseguiría que no se registre.
 */

type Props = { assetId: string };

export default function AparatoInstalado({ assetId }: Props) {
  const { can } = useAuth();
  const puedeTocar = can('asset.update');

  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<'' | 'instalar' | 'retirar'>('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    marca: '', modelo: '', serie: '', firmware: '', notas: '', motivoRetiroAnterior: '',
  });
  const [motivoRetiro, setMotivoRetiro] = useState('');

  /* Recarga a mano después de guardar. Aquí no hace falta guardia: la dispara
     el usuario al cerrar el formulario, no un cambio de dependencia. */
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get(`/assets/${assetId}/aparatos`);
      setD(r.data);
    } catch {
      setD(null);
    } finally {
      setCargando(false);
    }
  }, [assetId]);

  /* La guardia del bloque 115: al cambiar de equipo en la ficha se lanza otra
     petición, y si la anterior llega después se quedaría el aparato de la
     cámara que ya no se está mirando. */
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    api.get(`/assets/${assetId}/aparatos`)
      .then((r) => { if (vivo) setD(r.data); })
      .catch(() => { if (vivo) setD(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [assetId]);

  const puesto = d?.items?.find((x: any) => !x.hasta) || null;
  const anteriores = (d?.items || []).filter((x: any) => x.hasta);

  function abrirInstalar() {
    setForm({ marca: '', modelo: '', serie: '', firmware: '', notas: '', motivoRetiroAnterior: '' });
    setError(''); setAbierto('instalar');
  }

  async function instalar() {
    setGuardando(true); setError('');
    try {
      await api.post(`/assets/${assetId}/aparato`, {
        marca: form.marca || undefined,
        modelo: form.modelo || undefined,
        serie: form.serie || undefined,
        firmware: form.firmware || undefined,
        notas: form.notas || undefined,
        motivoRetiroAnterior: puesto ? form.motivoRetiroAnterior : undefined,
      });
      setAbierto('');
      await cargar();
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar el aparato'));
    } finally { setGuardando(false); }
  }

  async function retirar() {
    setGuardando(true); setError('');
    try {
      await api.post(`/assets/${assetId}/aparato/retirar`, { motivo: motivoRetiro });
      setAbierto(''); setMotivoRetiro('');
      await cargar();
    } catch (e: any) {
      setError(mensajeDeError(e, 'retirar el aparato'));
    } finally { setGuardando(false); }
  }

  if (cargando) {
    return <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Consultando el aparato…</div>;
  }

  const nombre = (x: any) => [x.marca, x.modelo].filter(Boolean).join(' ') || 'sin marca ni modelo';

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Aparato instalado</h3>
        {/* LA CIFRA DEL INFORME DE REEMPLAZO. «Esta cámara se cambió tres
            veces» es una frase que hasta este bloque no se podía escribir. */}
        {(d?.reemplazos ?? 0) > 0 && (
          <span className="chip">
            {d.reemplazos === 1 ? 'se cambió 1 vez' : `se cambió ${d.reemplazos} veces`}
          </span>
        )}
      </div>

      {!puesto ? (
        <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>
          Ningún aparato registrado ahora mismo en este sitio.
        </p>
      ) : (
        <div style={{ fontSize: 13, margin: '8px 0' }}>
          <b>{nombre(puesto)}</b>
          {puesto.serie && <span className="muted"> · serie {puesto.serie}</span>}
          {puesto.firmware && <span className="muted"> · firmware {puesto.firmware}</span>}
          <div className="muted">
            Puesto el {fecha(puesto.desde)}
            {/* Una fecha estimada se dice. Las del traspaso del 106-A salieron
                del alta del sitio porque la real no existía en ninguna parte. */}
            {puesto.desdeEsEstimado && ' (fecha estimada)'}
            {puesto.instaladoPor?.fullName ? ` · ${puesto.instaladoPor.fullName}` : ''}
          </div>
        </div>
      )}

      {puedeTocar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-mini" onClick={abrirInstalar}>
            {puesto ? 'Cambiar el aparato' : 'Registrar aparato'}
          </button>
          {puesto && (
            <button type="button" className="btn-mini"
              onClick={() => { setMotivoRetiro(''); setError(''); setAbierto('retirar'); }}>
              Retirar sin reponer
            </button>
          )}
        </div>
      )}

      {anteriores.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Aparatos anteriores</div>
          <table className="tabla">
            <thead>
              <tr><th>Aparato</th><th>Serie</th><th>Estuvo</th><th>Por qué salió</th></tr>
            </thead>
            <tbody>
              {anteriores.map((x: any) => (
                <tr key={x.id}>
                  <td>{nombre(x)}</td>
                  <td className="muted">{x.serie || '—'}</td>
                  <td className="muted">
                    {fecha(x.desde)}{x.desdeEsEstimado ? '*' : ''} → {fecha(x.hasta)}
                  </td>
                  <td>
                    {x.motivoRetiro || <span className="muted">sin motivo registrado</span>}
                    {x.retiradoPor?.fullName && (
                      <div className="muted">{x.retiradoPor.fullName}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {anteriores.some((x: any) => x.desdeEsEstimado) && (
            <p className="muted" style={{ fontSize: 11 }}>
              * La fecha de inicio es estimada: se tomó del alta del sitio.
            </p>
          )}
        </div>
      )}

      {abierto === 'instalar' && (
        <Modal
          title={puesto ? 'Cambiar el aparato de este sitio' : 'Registrar el aparato'}
          onClose={() => setAbierto('')}
          acciones={(
            <>
              <button type="button" className="btn" onClick={() => setAbierto('')}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={instalar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
        >
          {error && <div className="card peligro">{error}</div>}
          <p className="muted" style={{ fontSize: 12 }}>
            El sitio no cambia. Lo que se registra es el aparato que hay dentro.
          </p>
          <label>Marca
            <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
          </label>
          <label>Modelo
            <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          </label>
          <label>Número de serie
            <input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} />
          </label>
          <label>Firmware
            <input value={form.firmware} onChange={(e) => setForm({ ...form, firmware: e.target.value })} />
          </label>
          {puesto && (
            <label>Por qué sale el que estaba
              <input
                value={form.motivoRetiroAnterior}
                onChange={(e) => setForm({ ...form, motivoRetiroAnterior: e.target.value })}
                placeholder="se quemó la fuente, golpe de grúa, fin de vida útil…"
              />
            </label>
          )}
          <label>Notas
            <textarea rows={2} value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </label>
        </Modal>
      )}

      {abierto === 'retirar' && (
        <Modal
          title="Retirar el aparato sin reponer"
          onClose={() => setAbierto('')}
          acciones={(
            <>
              <button type="button" className="btn" onClick={() => setAbierto('')}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={retirar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Retirar'}
              </button>
            </>
          )}
        >
          {error && <div className="card peligro">{error}</div>}
          <p className="muted" style={{ fontSize: 12 }}>
            El sitio se queda sin aparato. Su historial se conserva entero.
          </p>
          <label>Por qué se retira
            <input value={motivoRetiro} onChange={(e) => setMotivoRetiro(e.target.value)}
              placeholder="se lo llevaron al taller, reemplazo pendiente…" />
          </label>
        </Modal>
      )}
    </div>
  );
}
