import { useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import BotonConMotivo from './BotonConMotivo';
import LoQueVe from './mapa/LoQueVe';
import { useDialogos } from './Dialogos';
import { mensajeDeError, queFalta } from '../avisos';
import { descargarDeApi } from '../descargar';
import { fecha } from '../fechas';
import type { FichaGuardada, ModeloDeFicha } from './FichaOpticaForm';

/* =============================================================================
   UNA FICHA ÓPTICA, ENTERA — bloque 184
   -----------------------------------------------------------------------------
   Es la pantalla de quien VERIFICA: los números, el PDF a un clic, y quién la
   cargó. Verificar es afirmar que cada número coincide con el PDF; por eso
   se pregunta antes, y no lo puede hacer quien la cargó (lo impide también el
   servidor: dos ojos ven más que uno).
============================================================================= */

export default function FichaOpticaDetalle({ modelo, ficha, yo, puedeVerificar, puedeCorregir, onCorregir, onCambio, onCerrar }: {
  modelo: ModeloDeFicha;
  ficha: FichaGuardada;
  /** El id de quien mira. */
  yo: string | undefined;
  /** `wo.approve`: verificar, y borrar aunque ya esté verificada. */
  puedeVerificar: boolean;
  /** `asset.update`: corregir los números. */
  puedeCorregir: boolean;
  onCorregir: () => void;
  onCambio: (mensaje: string) => void;
  onCerrar: () => void;
}) {
  const { confirmar } = useDialogos();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const suya = !!yo && ficha.declaradaPor?.id === yo;
  const camaras = ficha._count?.camaras ?? 0;
  const enTele = ficha.anguloHTele != null && Math.abs(ficha.doriAnguloRef - ficha.anguloHTele) < 0.05;
  const puedeBorrar = puedeVerificar || (suya && !ficha.verificadaEn);
  const titulo = `${modelo.marca} ${modelo.modelo} · ${ficha.lente}`;

  async function pdf() {
    setError('');
    try { await descargarDeApi(`/modelos/fichas/${ficha.id}/pdf`, `Ficha técnica ${modelo.modelo}.pdf`); }
    catch (e) { setError(mensajeDeError(e, 'descargar el PDF')); }
  }

  async function verificar() {
    const ok = await confirmar({
      titulo: '¿Coinciden con el PDF?',
      mensaje: `Verificar es afirmar que cada número de ${titulo} es el del PDF del fabricante. Queda con tu nombre.`,
      aceptar: 'Sí, los comprobé',
    });
    if (!ok) return;
    setOcupado(true); setError('');
    try {
      await api.post(`/modelos/fichas/${ficha.id}/verificar`);
      onCambio(`Ficha ${ficha.lente} verificada.`);
    } catch (e) { setError(mensajeDeError(e, 'verificar la ficha')); }
    finally { setOcupado(false); }
  }

  async function borrar() {
    const ok = await confirmar({
      titulo: 'Borrar la ficha',
      mensaje: `Se borra ${titulo} con su PDF. No se puede deshacer.`,
      aceptar: 'Borrar', peligro: true,
    });
    if (!ok) return;
    setOcupado(true); setError('');
    try {
      await api.delete(`/modelos/fichas/${ficha.id}`);
      onCambio(`Ficha ${ficha.lente} borrada.`);
    } catch (e) { setError(mensajeDeError(e, 'borrar la ficha')); }
    finally { setOcupado(false); }
  }

  return (
    <Modal title={titulo} onClose={onCerrar} ancho
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cerrar</button>
          <button className="btn-mini" onClick={pdf}>Descargar el PDF</button>
          {puedeBorrar && (
            <BotonConMotivo className="btn-mini btn-peligro" onClick={borrar} ocupado={ocupado}
              falta={queFalta([camaras > 0, `${camaras} cámara(s) la usan: cámbialas de ficha antes de borrarla.`])}>
              Borrar
            </BotonConMotivo>
          )}
          {puedeCorregir && <button className="btn-mini" disabled={ocupado} onClick={onCorregir}>Corregir números</button>}
          {puedeVerificar && !ficha.verificadaEn && (
            <BotonConMotivo onClick={verificar} ocupado={ocupado}
              falta={queFalta([suya, 'La cargaste tú: la tiene que verificar otra persona.'])}>
              Verificar
            </BotonConMotivo>
          )}
        </>
      }
    >
      {error && <div role="alert" className="aviso-error">{error}</div>}
      {ficha.verificadaEn ? (
        <div role="status" className="aviso-ok">
          {`Verificada por ${ficha.verificadaPor?.fullName ?? 'alguien que ya no está'} el ${fecha(ficha.verificadaEn)}.`}
        </div>
      ) : (
        <div role="status" className="aviso-pendiente">
          {`Sin verificar: falta que otra persona compare los números con el PDF. La cargó ${ficha.declaradaPor?.fullName ?? 'alguien'} el ${fecha(ficha.declaradaEn)}.`}
        </div>
      )}

      <div className="ficha-vista">
        <div>
          <h4>{`Según la ficha, ${enTele ? 'con el zoom al máximo' : 'en gran angular'} (${ficha.doriAnguloRef}°)`}</h4>
          <LoQueVe dia={{ identificar: ficha.identificarM, reconocer: ficha.reconocerM, observar: ficha.observarM, detectar: ficha.detectarM }}
            noche irM={ficha.irM} />
        </div>
        <div>
          <h4>La cámara</h4>
          <dl className="kv">
            <dt>Resolución</dt><dd>{`${ficha.resolucionAncho} × ${ficha.resolucionAlto} px`}</dd>
            {ficha.sensor && <><dt>Sensor</dt><dd>{ficha.sensor}</dd></>}
            <dt>Ángulo</dt>
            <dd>{ficha.anguloHTele != null ? `${ficha.anguloH}° a ${ficha.anguloHTele}°` : `${ficha.anguloH}°`}{ficha.anguloV != null ? ` · vertical ${ficha.anguloV}°` : ''}</dd>
            {ficha.zoomOptico != null && <><dt>Zoom óptico</dt><dd>{`${ficha.zoomOptico}x`}</dd></>}
            <dt>La usan</dt><dd>{camaras === 1 ? '1 cámara' : `${camaras} cámaras`}</dd>
          </dl>
        </div>
      </div>
    </Modal>
  );
}
