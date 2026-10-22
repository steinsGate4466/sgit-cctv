import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Modal from './Modal';
import { mensajeDeError } from '../avisos';
import { fechaHora } from '../fechas';
import { avisoDelNumeroSap, normalizarNumeroSap } from '../avisoSap';

/* =============================================================================
   BLOQUE 180 · EL AVISO EN SAP DE UNA INCIDENCIA
   -----------------------------------------------------------------------------
   Dos cosas, en el orden en que pasan:

   1. PARA CREARLO EN SAP. Quien abre el aviso en SAP volvía a escribir lo
      que ya está aquí —dónde, qué y el detalle—, y escrito dos veces se
      escribe distinto. Aquí sale preparado, cada dato con su botón de copiar
      y en el formato de SAP: la ubicación técnica y el texto breve de 40.
   2. EL N° QUE DIO SAP. Se apunta aquí y engancha la incidencia con el aviso.
      Lo apunta quien lo creó, también Producción; cambiarlo o quitarlo lo
      hace Mantenimiento (lo decide el servidor, no esta pantalla).
============================================================================= */

export default function AvisoSapDeIncidencia({ incidencia, puedeCorregir, onHecho, onClose }: {
  incidencia: { id: string; code: string; avisoSap?: string | null };
  /** `incident.update`: cambiar o quitar un número que ya está. */
  puedeCorregir: boolean;
  onHecho: () => void;
  onClose: () => void;
}) {
  const [datos, setDatos] = useState<any>(null);
  const [errorDatos, setErrorDatos] = useState('');
  const [numero, setNumero] = useState(incidencia.avisoSap || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState('');

  useEffect(() => {
    let vigente = true;
    api.get(`/incidents/${incidencia.id}/para-sap`)
      .then((r) => { if (vigente) setDatos(r.data); })
      .catch((e) => { if (vigente) setErrorDatos(mensajeDeError(e, 'preparar los datos del aviso')); });
    return () => { vigente = false; };
  }, [incidencia.id]);

  const yaTiene = !!incidencia.avisoSap;
  const bloqueado = yaTiene && !puedeCorregir;
  const aviso = avisoDelNumeroSap(numero);

  async function copiar(que: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
    } catch {
      setCopiado('');
      setError('El navegador no dejó copiar: selecciona el texto y cópialo a mano.');
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (aviso) { setError(aviso); return; }
    setGuardando(true); setError('');
    try {
      await api.patch(`/incidents/${incidencia.id}/aviso-sap`, { numero: normalizarNumeroSap(numero) });
      onHecho();
      onClose();
    } catch (err: any) {
      setError(mensajeDeError(err, 'guardar el N° del aviso'));
    } finally { setGuardando(false); }
  }

  const fila = (que: string, titulo: string, valor: string, nota?: string) => (
    <div className="para-sap-fila">
      <div>
        <b>{titulo}</b>
        <p className="para-sap-texto num-sap">{valor}</p>
        {nota && <div className="muted" style={{ fontSize: 11 }}>{nota}</div>}
      </div>
      <button type="button" className="btn-mini" onClick={() => copiar(que, valor)}>
        {copiado === que ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );

  return (
    <Modal title={`Aviso SAP · ${incidencia.code}`} onClose={onClose}>
      <form onSubmit={guardar}>
        <label>{'N° del aviso en SAP'}
          <input className="num-sap" value={numero} maxLength={20} inputMode="numeric" placeholder="Ej.: 10000261278"
            disabled={bloqueado} onChange={(e) => { setNumero(e.target.value); setError(''); }} />
        </label>
        {aviso && <div className="num-sap-falta" style={{ fontSize: 12 }}>{aviso}</div>}
        {bloqueado && <div className="muted" style={{ fontSize: 12 }}>{'Cambiarlo lo hace Mantenimiento.'}</div>}
        {error && <div className="error">{error}</div>}
        {!bloqueado && (
          <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar N° de aviso'}</button>
        )}
      </form>

      <h4 style={{ margin: '16px 0 4px' }}>{'Para crearlo en SAP'}</h4>
      {errorDatos && <div className="error">{errorDatos}</div>}
      {!datos && !errorDatos && <div className="muted">{'Preparando…'}</div>}
      {datos && (
        <div className="para-sap">
          {datos.ubicacionTecnica
            ? fila('ut', 'Ubicación técnica', datos.ubicacionTecnica.codigo,
              datos.ubicacionTecnica.propia ? undefined : `La de «${datos.ubicacionTecnica.de}»: el sitio del equipo no tiene la suya.`)
            : (
              <div className="para-sap-fila">
                <div>
                  <b>{'Ubicación técnica'}</b>
                  <span className="num-sap-falta">{'Sin declarar.'}</span>{' '}
                  <Link to="/locations">{'Declárala en Ubicaciones'}</Link>
                </div>
              </div>
            )}
          {fila('breve', `Descripción (${datos.textoBreve.length}/${datos.textoBreveMax})`, datos.textoBreve)}
          {fila('largo', 'Texto largo', datos.textoLargo)}
          {datos.averia && fila('averia', 'Inicio de la avería', fechaHora(datos.averia.inicio),
            datos.averia.estimado ? 'Estimado: es la hora del reporte.' : undefined)}
        </div>
      )}
    </Modal>
  );
}
