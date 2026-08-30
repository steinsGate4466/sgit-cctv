import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTabla } from '../components/Esqueleto';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';
import { fechaTabla } from '../fechas';

/* =============================================================================
   HOJAS DE RUTA — bloque 75
   =============================================================================

   QUÉ ES, en una frase: los PASOS de un mantenimiento preventivo.

   El preventivo ya sabía CUÁNDO tocar cada equipo. No sabía QUÉ hacer. El
   técnico recibía «toca revisar AA-CAM-T1-001» y el detalle vivía en un Excel
   en el PC de alguien.

   -----------------------------------------------------------------------------
   VA POR TIPO DE EQUIPO, NO POR EQUIPO

   Una sola hoja «MANTENIMIENTO PREVENTIVO DE CAMARA» sirve para las
   cuatrocientas cámaras. Por eso la pantalla enseña **cuántos equipos usa cada
   hoja**: es lo que hace entender que tocar ese documento tiene consecuencias.

   -----------------------------------------------------------------------------
   EL CONTADOR DE 40 CARACTERES, QUE ES EL CORAZÓN DE ESTA PANTALLA

   El Excel del ingeniero lleva una columna que cuenta los caracteres de cada
   descripción. No es manía: **SAP corta ese campo en 40**, y si UNA línea se
   pasa, la carga se rechaza ENTERA — no la línea, la carga. Y el mensaje de
   SAP no dice cuál fue.

   Aquí el contador va EN VIVO, junto a cada campo, y se pone rojo al pasarse.
   Se ve mientras se escribe, no al intentar guardar: corregir una frase que
   acabas de escribir cuesta un segundo; corregir setenta al final, media
   mañana.
============================================================================= */

/** El límite de SAP. Mismo número que en el servidor, dicho en los dos sitios
 *  porque el servidor no puede fiarse del navegador y el navegador no puede
 *  esperar al servidor para pintar el contador. */
const MAX = 40;

const TIPOS: [string, string][] = [
  ['CAMERA', 'Cámara'], ['WIRELESS', 'Antena / enlace'], ['SWITCH', 'Switch PoE'],
  ['NVR', 'Grabador (NVR)'], ['CABINET', 'Gabinete'], ['PC', 'PC / iVMS'],
  ['UPS', 'UPS'], ['PANTALLA', 'Pantalla de púlpito'],
  ['TABLERO_ELECTRICO', 'Tablero eléctrico'], ['ROUTER', 'Router'],
  ['SERVER', 'Servidor'], ['DECODER', 'Decodificador'], ['OTHER', 'Otro'],
];
const nombreTipo = (v: string) => TIPOS.find((t) => t[0] === v)?.[1] || v;

interface Paso {
  operacion: number;
  subOperacion: number | null;
  descripcion: string;
}

export default function HojasDeRuta() {
  const { can } = useAuth();
  const [filas, setFilas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [edita, setEdita] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);
  const [bajando, setBajando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api.get('/hojas-de-ruta').then((x) => x.data).catch(() => []);
    setFilas(r || []);
  }, []);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  async function descargar(id?: string) {
    setBajando(true); setError('');
    try {
      const url = id ? `/hojas-de-ruta/${id}/excel` : '/hojas-de-ruta/excel';
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = id ? 'hoja-de-ruta.xlsx' : 'hojas-de-ruta.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(mensajeDeError(e, 'descargar el Excel'));
    } finally { setBajando(false); }
  }

  async function cargarLasDelIngeniero() {
    setGuardando(true); setError('');
    try {
      const r = await api.post('/hojas-de-ruta/cargar-las-del-ingeniero', {});
      setMsg(`${r.data.creadas} hoja(s) cargadas.`
        + (r.data.yaEstaban?.length ? ` ${r.data.yaEstaban.length} ya estaban y no se tocaron.` : ''));
      await cargar();
    } catch (e: any) {
      setError(mensajeDeError(e, 'cargar las hojas del ingeniero'));
    } finally { setGuardando(false); }
  }

  function abrirNueva() {
    setError('');
    api.get('/hojas-de-ruta/plantilla').then((r) => {
      /* Una hoja NUEVA nace con la seguridad y la documentación puestas. Quien
         la crea no tiene que acordarse del EPP ni del bloqueo de energía — y
         sobre todo, no puede olvidarse. */
      const pasos: Paso[] = (r.data.pasos || []).map((p: any) => ({
        operacion: p.op, subOperacion: p.sub, descripcion: p.texto,
      }));
      setEdita({
        tipoEquipo: 'CAMERA',
        descripcion: '',
        frecuencia: '3 MESES',
        puestoTrabajo: 'LAM1ELECT1',
        centro: '2100',
        grupoPlanif: 'M06',
        trabajoTotalH: 8,
        numPersonas: 2,
        duracionH: 4,
        operaciones: [
          { operacion: 10, subOperacion: null, descripcion: '' },
          ...pasos,
        ],
      });
    }).catch((e) => setError(mensajeDeError(e, 'preparar la hoja nueva')));
  }

  async function abrirExistente(id: string) {
    setError('');
    try {
      const h = await api.get(`/hojas-de-ruta/${id}`).then((r) => r.data);
      setEdita({
        ...h,
        operaciones: h.operaciones.map((o: any) => ({
          operacion: o.operacion,
          subOperacion: o.subOperacion,
          descripcion: o.descripcion,
        })),
      });
    } catch (e: any) { setError(mensajeDeError(e, 'abrir la hoja')); }
  }

  async function guardar() {
    setGuardando(true); setError('');
    try {
      await api.post('/hojas-de-ruta', edita);
      setMsg('Hoja de ruta guardada.');
      setEdita(null);
      await cargar();
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar la hoja de ruta'));
    } finally { setGuardando(false); }
  }

  // --------------------------------------------------------- editar los pasos
  const cambiarPaso = (i: number, campo: keyof Paso, valor: any) => {
    setEdita((e: any) => {
      const ops = [...e.operaciones];
      ops[i] = { ...ops[i], [campo]: valor };
      return { ...e, operaciones: ops };
    });
  };
  const anadirPaso = () => setEdita((e: any) => {
    /* El número siguiente se calcula: de diez en diez, como en SAP. Deja hueco
       para meter un paso entre dos sin renumerar toda la hoja. */
    const subs = e.operaciones.map((o: Paso) => o.subOperacion ?? 0);
    const siguiente = Math.max(0, ...subs) + 10;
    return { ...e, operaciones: [...e.operaciones, { operacion: 10, subOperacion: siguiente, descripcion: '' }] };
  });
  const quitarPaso = (i: number) => setEdita((e: any) => ({
    ...e, operaciones: e.operaciones.filter((_: Paso, j: number) => j !== i),
  }));
  const mover = (i: number, hacia: -1 | 1) => setEdita((e: any) => {
    const ops = [...e.operaciones];
    const j = i + hacia;
    if (j < 1 || j >= ops.length) return e;   // el paso 0 es el principal
    [ops[i], ops[j]] = [ops[j], ops[i]];
    /* Se renumeran las suboperaciones para que el orden que se ve sea el que
       se guarda. Si no, arrastrar una fila cambiaría la pantalla y no el
       documento — y en SAP saldría en el orden viejo. */
    let n = 10;
    for (const o of ops) if (o.subOperacion != null) { o.subOperacion = n; n += 10; }
    return { ...e, operaciones: ops };
  });

  const pasosLargos = (edita?.operaciones || [])
    .filter((o: Paso) => (o.descripcion || '').length > MAX).length;
  const sinTexto = (edita?.operaciones || [])
    .filter((o: Paso) => !(o.descripcion || '').trim()).length;

  if (cargando) return <EsqueletoTabla filas={5} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="page-title">Hojas de ruta</h1>
          <p className="page-sub">{filas.length} hojas · los pasos de cada preventivo</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-mini" disabled={bajando} onClick={() => descargar()}>
            <Icono n="exportar" size={14} /> {bajando ? 'Generando…' : 'Descargar todas (Excel SAP)'}
          </button>
          {can('wo.approve') && (
            <button className="btn-primary" onClick={abrirNueva}>+ Nueva hoja</button>
          )}
        </div>
      </div>

      {/* El texto es corto a propósito: esto es una lista de trabajo, no un
          manual. Un párrafo encima de la tabla se salta a la segunda vez. */}
      <div className="scan-note" style={{ marginBottom: 12 }}>
        <b>Una hoja por tipo de equipo.</b> La de cámara vale para todas.
      </div>

      {msg && <div className="card ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {error && <div className="card peligro" style={{ marginBottom: 12 }}>{error}</div>}

      {!filas.length ? (
        <div className="panel" style={{ textAlign: 'center', padding: 34 }}>
          <div className="muted" style={{ marginBottom: 14 }}>
            Todavía no hay hojas de ruta.
          </div>
          {can('wo.approve') && (
            <button className="btn-primary" disabled={guardando} onClick={cargarLasDelIngeniero}>
              {guardando ? 'Cargando…' : 'Cargar las 5 del ingeniero'}
            </button>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Cámara · Antena · Switch PoE · Gabinete · PC
          </div>
        </div>
      ) : (
        <div className="panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Descripción</th>
                  <th>Frecuencia</th>
                  <th>Pasos</th>
                  <th>Equipos</th>
                  <th>Aprobada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((h) => (
                  <tr key={h.id}>
                    <td><b>{nombreTipo(h.tipoEquipo)}</b></td>
                    <td style={{ fontSize: 13 }}>{h.descripcion}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{h.frecuencia}</td>
                    <td>{h.totalPasos}</td>
                    {/* Cuántos equipos dependen de esta hoja. Es lo que hace
                        entender que cambiar un paso afecta a cuatrocientas
                        intervenciones, no a una. */}
                    <td>
                      <b>{h.equiposQueLaUsan}</b>
                      <div className="muted" style={{ fontSize: 11 }}>la usan</div>
                    </td>
                    <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {h.aprobadaEn
                        ? <>{h.aprobadaPor?.fullName || 'sí'}<div style={{ fontSize: 11 }}>{fechaTabla(h.aprobadaEn)}</div></>
                        : <span className="muted">sin firmar</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn-mini" onClick={() => abrirExistente(h.id)}>
                          {can('wo.approve') ? 'Editar' : 'Ver'}
                        </button>
                        <button className="btn-mini" disabled={bajando} onClick={() => descargar(h.id)}>
                          Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================== EL FORMULARIO */}
      {edita && (
        <Modal
          title={`Hoja de ruta · ${nombreTipo(edita.tipoEquipo)}`}
          ancho
          onClose={() => setEdita(null)}
          acciones={can('wo.approve') ? (
            <>
              <button className="btn-mini" onClick={() => setEdita(null)}>Cancelar</button>
              <BotonConMotivo
                ocupado={guardando}
                onClick={guardar}
                falta={queFalta(
                  [!edita.descripcion?.trim(), 'Ponle un título a la hoja.'],
                  [edita.descripcion?.length > MAX,
                    `El título tiene ${edita.descripcion?.length} caracteres. SAP acepta ${MAX}.`],
                  [sinTexto > 0, `Hay ${sinTexto} paso(s) sin texto. Escríbelos o quítalos.`],
                  [pasosLargos > 0,
                    `Hay ${pasosLargos} paso(s) de más de ${MAX} caracteres. SAP rechazaría la carga entera.`],
                )}
              >
                {guardando ? 'Guardando…' : 'Guardar hoja'}
              </BotonConMotivo>
            </>
          ) : <button className="btn-mini" onClick={() => setEdita(null)}>Cerrar</button>}
        >
          {error && <div className="card peligro" style={{ marginBottom: 12 }}>{error}</div>}

          {/* -------------------------------------------------- LA CABECERA */}
          <div className="section-title" style={{ marginTop: 0 }}>Cabecera</div>
          <div className="form-grid">
            <label className="campo">
              <span>Tipo de equipo</span>
              <select
                value={edita.tipoEquipo}
                disabled={!!edita.id || !can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, tipoEquipo: e.target.value })}
              >
                {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              {/* No se puede cambiar después: la hoja está atada a su tipo por
                  un índice único, y moverla dejaría a los equipos del tipo
                  viejo sin procedimiento sin que nadie se entere. */}
              {edita.id && <small className="muted">El tipo no se cambia. Crea otra hoja si hace falta.</small>}
            </label>

            <label className="campo campo-ancho">
              <span>
                Descripción principal{' '}
                <b className={(edita.descripcion || '').length > MAX ? 'hr-pasa' : 'hr-cabe'}>
                  {(edita.descripcion || '').length}/{MAX}
                </b>
              </span>
              <input
                value={edita.descripcion || ''}
                readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, descripcion: e.target.value })}
                placeholder="MANTENIMIENTO PREVENTIVO DE CAMARA"
              />
            </label>

            <label className="campo">
              <span>Frecuencia</span>
              <input value={edita.frecuencia || ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, frecuencia: e.target.value })}
                placeholder="3 MESES" />
            </label>
            <label className="campo">
              <span>Puesto de trabajo</span>
              <input value={edita.puestoTrabajo || ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, puestoTrabajo: e.target.value })}
                placeholder="LAM1ELECT1" />
            </label>
            <label className="campo">
              <span>Centro</span>
              <input value={edita.centro || ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, centro: e.target.value })} placeholder="2100" />
            </label>
            <label className="campo">
              <span>Grupo planificador</span>
              <input value={edita.grupoPlanif || ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, grupoPlanif: e.target.value })} placeholder="M06" />
            </label>
            <label className="campo">
              <span>Trabajo total (h)</span>
              <input type="number" value={edita.trabajoTotalH ?? ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, trabajoTotalH: Number(e.target.value) })} />
            </label>
            <label className="campo">
              <span>Personas</span>
              <input type="number" value={edita.numPersonas ?? ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, numPersonas: Number(e.target.value) })} />
            </label>
            <label className="campo">
              <span>Duración (h)</span>
              <input type="number" value={edita.duracionH ?? ''} readOnly={!can('wo.approve')}
                onChange={(e) => setEdita({ ...edita, duracionH: Number(e.target.value) })} />
            </label>
          </div>

          {/* ----------------------------------------------------- LOS PASOS */}
          <div className="section-title">
            Pasos
            <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
              {edita.operaciones.length}
            </span>
          </div>

          <div className="hr-pasos">
            {edita.operaciones.map((o: Paso, i: number) => {
              const largo = (o.descripcion || '').length;
              const principal = o.subOperacion == null;
              return (
                <div key={i} className={'hr-paso' + (principal ? ' hr-principal' : '')}>
                  <div className="hr-num">
                    {principal
                      ? <span title="Operación principal (PM01)">PM01</span>
                      : <span title="Suboperación (PM04)">{o.subOperacion}</span>}
                  </div>
                  <label className="hr-texto">
                    <input
                      value={o.descripcion}
                      readOnly={!can('wo.approve')}
                      maxLength={MAX + 20}
                      onChange={(e) => cambiarPaso(i, 'descripcion', e.target.value.toUpperCase())}
                      placeholder={principal ? 'El trabajo (ej. LIMPIEZA DE CAMARAS)' : 'El paso'}
                    />
                  </label>
                  {/* EL CONTADOR, EN VIVO. Rojo al pasarse de 40. Es lo que
                      evita que SAP rechace la carga entera. */}
                  <div className={'hr-cont ' + (largo > MAX ? 'hr-pasa' : 'hr-cabe')}>
                    {largo}/{MAX}
                  </div>
                  {can('wo.approve') && !principal && (
                    <div className="hr-acc">
                      <button className="btn-mini" title="Subir" onClick={() => mover(i, -1)}>↑</button>
                      <button className="btn-mini" title="Bajar" onClick={() => mover(i, 1)}>↓</button>
                      <button className="btn-mini btn-danger" title="Quitar" onClick={() => quitarPaso(i)}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {can('wo.approve') && (
            <button className="btn-mini" style={{ marginTop: 10 }} onClick={anadirPaso}>
              + Añadir paso
            </button>
          )}

          {pasosLargos > 0 && (
            <div className="card peligro" style={{ marginTop: 12 }}>
              <b>{pasosLargos} paso(s) pasan de {MAX} caracteres.</b> SAP rechazaría
              la carga entera, no sólo esas líneas.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
