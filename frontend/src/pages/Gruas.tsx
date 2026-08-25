import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import FiltroAmbito, { Ambito, AMBITO_VACIO, conAmbito } from '../components/FiltroAmbito';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { guardarPendiente } from '../cola-offline';
import { fecha } from '../fechas';

/**
 * INSPECCIÓN DE CÁMARAS DE GRÚA (bloque 14).
 *
 * POR QUÉ ESTE FORMULARIO ES LARGO
 * Subir a una grúa cuesta un manlift, un permiso de altura y a veces parar
 * la grúa. Se sube UNA vez y se revisa TODO: cámara, antena, cableado,
 * alimentación, grabación y gabinete. Rellenar veinte campos cuesta menos
 * que volver a subir.
 *
 * EL DATO QUE MÁS VALE: LA DERIVA DE LA SEÑAL
 * -70 dBm puede ser normal en un enlace largo. -70 cuando el mes pasado era
 * -50 es una antena que se está moviendo — y eso se ve venir con semanas.
 * El sistema arrastra solo la lectura anterior; el técnico sólo anota la de
 * hoy.
 */

const ESTADOS = [
  { v: 'NO_REVISADO', t: 'Sin revisar' },
  { v: 'CONFORME', t: 'Conforme' },
  { v: 'OBSERVADO', t: 'Observado' },
  { v: 'NO_CONFORME', t: 'No conforme' },
];
const RESULTADOS = [
  { v: 'OPERATIVA', t: 'Operativa' },
  { v: 'OPERATIVA_CON_OBSERVACIONES', t: 'Operativa con observaciones' },
  { v: 'FUERA_DE_SERVICIO', t: 'Fuera de servicio' },
  { v: 'NO_SE_PUDO_ACCEDER', t: 'No se pudo acceder' },
];
const ETIQUETA_ESTADO: Record<string, string> = Object.fromEntries(ESTADOS.map((e) => [e.v, e.t]));
const ETIQUETA_RESULTADO: Record<string, string> = Object.fromEntries(RESULTADOS.map((e) => [e.v, e.t]));

const VACIO: any = {
  assetId: '', grua: '', posicionEnGrua: '',
  requiereManlift: true, alturaMetros: '', seBajaAPiso: false, requiereParada: false,
  camaraEstado: 'NO_REVISADO', camaraObs: '', lenteSucio: false, carcasaDanada: false, soporteFlojo: false,
  antenaEstado: 'NO_REVISADO', senalDbm: '', antenaAlineada: true, antenaObs: '',
  cableEstado: 'NO_REVISADO', enCadenaPortacables: false, chicoteDanado: false,
  prensaestopaOk: true, conectorOxidado: false, metrosAproximados: '', cableObs: '',
  alimentacionEstado: 'NO_REVISADO', poe: true, alimentacionObs: '',
  grabadorLocal: false, canalNvr: '', grabaOk: true, diasRetencion: '', grabacionObs: '',
  gabineteEstado: 'NO_REVISADO', gabineteHermetico: true, gabineteObs: '',
  resultado: 'OPERATIVA', hallazgos: '', accionesRealizadas: '', requiereSeguimiento: false,
};

export default function Gruas() {
  const { can } = useAuth();
  const puedeRegistrar = can('wo.update');

  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [lista, setLista] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any[]>([]);
  const [camaras, setCamaras] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState<any>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState('');
  const [hecho, setHecho] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [l, r] = await Promise.all([
        api.get('/gruas', { params: conAmbito({}, ambito) }).then((x) => x.data),
        api.get('/gruas/resumen').then((x) => x.data),
      ]);
      setLista(l || []);
      setResumen(r || []);
      setFallo('');
    } catch (e: any) {
      setFallo(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver las inspecciones.'
        : 'No se pudieron cargar las inspecciones. Vuelve a intentarlo.');
    }
  }, [ambito]);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function abrirNueva() {
    setF(VACIO); setErrorModal(''); setHecho(''); setNueva(true);
    try {
      const r = await api.get('/assets', { params: { type: 'CAMERA', limit: 300 } });
      setCamaras(r.data?.items || r.data || []);
    } catch { setCamaras([]); }
  }

  const set = (k: string) => (e: any) =>
    setF((v: any) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function aNumero(v: any) { return v === '' || v == null ? undefined : Number(v); }

  async function guardar() {
    if (!f.assetId) { setErrorModal('Elige la cámara inspeccionada.'); return; }
    if (!f.grua.trim()) { setErrorModal('Indica de qué grúa se trata.'); return; }
    setGuardando(true); setErrorModal('');

    const cuerpo = {
      ...f,
      grua: f.grua.trim(),
      alturaMetros: aNumero(f.alturaMetros),
      senalDbm: aNumero(f.senalDbm),
      metrosAproximados: aNumero(f.metrosAproximados),
      canalNvr: aNumero(f.canalNvr),
      diasRetencion: aNumero(f.diasRetencion),
    };
    // Los vacíos no se mandan: `''` no es un número ni un texto válido y el
    // servidor lo rechazaría con un mensaje que no ayuda a nadie.
    Object.keys(cuerpo).forEach((k) => { if ((cuerpo as any)[k] === '') delete (cuerpo as any)[k]; });

    try {
      const r = await api.post('/gruas', cuerpo);
      setHecho(`Inspección ${r.data?.code} registrada.`);
      setNueva(false);
      await cargar();
    } catch (e: any) {
      const estado = e?.response?.status;
      // Sin señal en la grúa es lo normal, no la excepción. Se guarda.
      if (!estado || estado >= 500) {
        await guardarPendiente({
          url: '/gruas', metodo: 'post', cuerpo,
          titulo: `Inspección de grúa ${cuerpo.grua}`,
        });
        setHecho('Guardado en este teléfono. Se sube solo cuando haya señal.');
        setNueva(false);
      } else {
        setErrorModal(e?.response?.data?.message || 'No se pudo registrar. Revisa los datos.');
      }
    } finally { setGuardando(false); }
  }

  const Casilla = ({ k, t }: { k: string; t: string }) => (
    <label className="casilla">
      <input type="checkbox" checked={!!f[k]} onChange={set(k)} /> {t}
    </label>
  );
  const Estado = ({ k, t }: { k: string; t: string }) => (
    <label className="campo">
      <span>{t}</span>
      <select value={f[k]} onChange={set(k)}>
        {ESTADOS.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}
      </select>
    </label>
  );

  return (
    <div className="page">
      <div className="page-head">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
        {puedeRegistrar && (
          <button className="btn-primary" onClick={abrirNueva}>
            <Icono n="preventivo" size={16} /> Nueva inspección
          </button>
        )}
      </div>

      <div className="card explica">
        <b>Las cámaras de grúa fallan distinto.</b> El cable se fatiga en la cadena
        portacables, la antena se desalinea con el movimiento y no se llega sin
        manlift. Por eso se sube <b>una vez</b> y se revisa <b>todo</b>.
      </div>

      {hecho && <div className="card" style={{ borderColor: '#7fbf8f', background: '#eef8f0' }}>{hecho}</div>}
      {fallo && <div className="card aviso-error">{fallo}</div>}
      {cargando && <EsqueletoTabla filas={4} />}

      {!cargando && resumen.length > 0 && (
        <>
          <div className="section-title">Por grúa — a cuál subir primero</div>
          <div className="rejilla-tarjetas">
            {resumen.map((g) => (
              <div key={g.grua} className="tarjeta-grabador" style={{ cursor: 'default' }}>
                <div className="tg-cabecera">
                  <strong>{g.grua}</strong>
                  {g.requiereManlift && <span className="chip est-MANTENIMIENTO">Manlift</span>}
                </div>
                <div className="tg-cifras">
                  <div><b>{g.camaras}</b><span>cámaras</span></div>
                  <div className={g.pendientes > 0 ? 'lleno' : ''}>
                    <b>{g.pendientes}</b><span>por revisar</span>
                  </div>
                </div>
                <div className="tg-sitio">
                  Última: {fecha(g.ultima)} · {ETIQUETA_RESULTADO[g.resultado] || g.resultado}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Inspecciones registradas</div>
      {!cargando && lista.length === 0 ? (
        <div className="card vacio">
          <h3>Todavía no hay inspecciones de grúa</h3>
          <p>
            Registra la primera con «Nueva inspección». A partir de la segunda, el
            sistema empieza a mostrar la <strong>deriva de la señal</strong>: es lo
            que avisa de una antena que se está desalineando antes de que se caiga.
          </p>
        </div>
      ) : !cargando && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th><th>Grúa</th><th>Cámara</th><th>Fecha</th>
              <th>Resultado</th><th>Señal</th><th>Deriva</th><th>Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.code}</strong></td>
                <td>{i.grua}{i.posicion ? ` · ${i.posicion}` : ''}</td>
                <td>{i.equipo || '—'}</td>
                <td>{fecha(i.fecha)}</td>
                <td>{ETIQUETA_RESULTADO[i.resultado] || i.resultado}</td>
                <td>{i.senalDbm != null ? `${i.senalDbm} dBm` : '—'}</td>
                <td>
                  {i.deriva == null ? '—' : (
                    <span style={{ color: i.deriva < -5 ? '#b3261e' : i.deriva > 5 ? '#166534' : undefined, fontWeight: 600 }}>
                      {i.deriva > 0 ? '+' : ''}{i.deriva} dB
                    </span>
                  )}
                </td>
                <td>{i.pendientes > 0 ? <b style={{ color: '#b3261e' }}>{i.pendientes}</b> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nueva && (
        <Modal
          title="Inspección de cámara de grúa"
          ancho
          onClose={() => setNueva(false)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setNueva(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Registrar inspección'}
              </button>
            </>
          }
        >
          {errorModal && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{errorModal}</div>}

          <div className="section-title" style={{ marginTop: 0 }}>Qué y dónde</div>
          <label className="campo">
            <span>Cámara inspeccionada</span>
            <select value={f.assetId} onChange={set('assetId')}>
              <option value="">— elegir cámara —</option>
              {camaras.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.assetCode}{c.referencePlace ? ` — ${c.referencePlace}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Grúa</span>
            <input value={f.grua} onChange={set('grua')} placeholder="Ej: Puente grúa 2 / GRU-107" maxLength={120} />
            <small className="muted">Como la llama Producción. No hay catálogo: se escribe tal cual.</small>
          </label>
          <label className="campo">
            <span>Posición en la grúa</span>
            <input value={f.posicionEnGrua} onChange={set('posicionEnGrua')} placeholder="cabina / pluma / lecho / gancho / sala eléctrica" maxLength={120} />
          </label>

          <div className="section-title">Acceso — lo que decide si se puede ir mañana</div>
          <div className="casillas">
            <Casilla k="requiereManlift" t="Requiere manlift" />
            <Casilla k="seBajaAPiso" t="La grúa se puede bajar a piso" />
            <Casilla k="requiereParada" t="Hay que parar la grúa (coordinar con Producción)" />
          </div>
          <label className="campo">
            <span>Altura aproximada (m)</span>
            <input type="number" min={0} step="0.5" value={f.alturaMetros} onChange={set('alturaMetros')} />
          </label>

          <div className="section-title">Cámara</div>
          <Estado k="camaraEstado" t="Estado de la cámara" />
          <div className="casillas">
            <Casilla k="lenteSucio" t="Lente sucio" />
            <Casilla k="carcasaDanada" t="Carcasa dañada" />
            <Casilla k="soporteFlojo" t="Soporte flojo" />
          </div>
          <label className="campo"><span>Observaciones de la cámara</span>
            <textarea rows={2} value={f.camaraObs} onChange={set('camaraObs')} maxLength={600} /></label>

          <div className="section-title">Antena / radioenlace</div>
          <Estado k="antenaEstado" t="Estado de la antena" />
          <label className="campo">
            <span>Señal (dBm)</span>
            <input type="number" min={-100} max={0} value={f.senalDbm} onChange={set('senalDbm')} placeholder="Ej: -65" />
            <small className="muted">
              Siempre negativo. −45 buena · −70 justa · −80 se cae. Se compara con la anterior.
            </small>
          </label>
          <div className="casillas"><Casilla k="antenaAlineada" t="Antena alineada" /></div>
          <label className="campo"><span>Observaciones de la antena</span>
            <textarea rows={2} value={f.antenaObs} onChange={set('antenaObs')} maxLength={600} /></label>

          <div className="section-title">Cableado — donde más falla y menos se mira</div>
          <Estado k="cableEstado" t="Estado del cableado" />
          <div className="casillas">
            <Casilla k="enCadenaPortacables" t="Va en cadena portacables / festón" />
            <Casilla k="chicoteDanado" t="Chicote (tramo flexible) dañado" />
            <Casilla k="prensaestopaOk" t="Prensaestopa en buen estado" />
            <Casilla k="conectorOxidado" t="Conector oxidado o picado" />
          </div>
          <label className="campo">
            <span>Metros aproximados</span>
            <input type="number" min={0} step="1" value={f.metrosAproximados} onChange={set('metrosAproximados')} />
            <small className="muted">Pasados los 90 m, Ethernet falla de forma intermitente.</small>
          </label>
          <label className="campo"><span>Observaciones del cableado</span>
            <textarea rows={2} value={f.cableObs} onChange={set('cableObs')} maxLength={600} /></label>

          <div className="section-title">Alimentación</div>
          <Estado k="alimentacionEstado" t="Estado de la alimentación" />
          <div className="casillas"><Casilla k="poe" t="Alimentada por PoE" /></div>
          <label className="campo"><span>Observaciones</span>
            <textarea rows={2} value={f.alimentacionObs} onChange={set('alimentacionObs')} maxLength={600} /></label>

          <div className="section-title">Grabación</div>
          <div className="casillas">
            <Casilla k="grabadorLocal" t="Tiene grabador local en la grúa" />
            <Casilla k="grabaOk" t="Está grabando correctamente" />
          </div>
          <label className="campo"><span>Canal en el grabador</span>
            <input type="number" min={1} value={f.canalNvr} onChange={set('canalNvr')} /></label>
          <label className="campo"><span>Días de retención</span>
            <input type="number" min={0} value={f.diasRetencion} onChange={set('diasRetencion')} /></label>
          <label className="campo"><span>Observaciones de grabación</span>
            <textarea rows={2} value={f.grabacionObs} onChange={set('grabacionObs')} maxLength={600} /></label>

          <div className="section-title">Gabinete en la grúa</div>
          <Estado k="gabineteEstado" t="Estado del gabinete" />
          <div className="casillas"><Casilla k="gabineteHermetico" t="Cierra hermético" /></div>
          <label className="campo"><span>Observaciones del gabinete</span>
            <textarea rows={2} value={f.gabineteObs} onChange={set('gabineteObs')} maxLength={600} /></label>

          <div className="section-title">Resultado</div>
          <label className="campo">
            <span>Resultado de la inspección</span>
            <select value={f.resultado} onChange={set('resultado')}>
              {RESULTADOS.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
            </select>
            <small className="muted">
              «No se pudo acceder» no admite componentes revisados: o se llegó al
              equipo, o no.
            </small>
          </label>
          <label className="campo"><span>Hallazgos</span>
            <textarea rows={3} value={f.hallazgos} onChange={set('hallazgos')} maxLength={2000} /></label>
          <label className="campo"><span>Acciones realizadas</span>
            <textarea rows={3} value={f.accionesRealizadas} onChange={set('accionesRealizadas')} maxLength={2000} /></label>
          <div className="casillas"><Casilla k="requiereSeguimiento" t="Requiere volver" /></div>
        </Modal>
      )}
    </div>
  );
}
