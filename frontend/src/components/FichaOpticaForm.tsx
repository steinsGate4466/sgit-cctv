import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import BotonConMotivo from './BotonConMotivo';
import LoQueVe from './mapa/LoQueVe';
import { mensajeDeError, queFalta, vacio } from '../avisos';
import { textoDelPdf } from '../leer-pdf';
import { metros, type Distancias } from '../dori';

/* =============================================================================
   CARGAR O CORREGIR UNA FICHA ÓPTICA — bloque 184
   -----------------------------------------------------------------------------
   «Los datos los tiene que llenar el técnico, pero tienen que ser
   fehacientes.» Por eso este formulario:

     1. EMPIEZA POR EL PDF del fabricante. Es obligatorio: sin él no hay nada
        con qué comparar los números. Se guarda tal cual como prueba.
     2. PROPONE los números leyendo el texto del PDF (en el navegador), y NO
        los da por buenos: quedan escritos para que el técnico los mire con el
        PDF delante. Lo que no encuentra lo dice, no lo rellena.
     3. AVISA DEL ERROR DE DEDO mientras se escribe, con las mismas reglas que
        aplica el servidor al guardar (`/modelos/revisar-ficha`): un «670» en
        vez de «67» sale antes de subir nada.
     4. PIDE QUE SE DECLARE: los números quedan con el nombre de quien los
        cargó, y después los VERIFICA otra persona. Eso lo dice por delante.
============================================================================= */

export interface ModeloDeFicha { id: string; marca: string; modelo: string }

/** Una ficha ya guardada, tal como la devuelve `GET /modelos`. */
export interface FichaGuardada {
  id: string; lente: string; resolucionAncho: number; resolucionAlto: number; sensor: string | null;
  anguloH: number; anguloV: number | null; anguloHTele: number | null; zoomOptico: number | null; doriAnguloRef: number;
  identificarM: number; reconocerM: number; observarM: number; detectarM: number; irM: number | null;
  declaradaEn: string; verificadaEn: string | null;
  declaradaPor: { id: string; fullName: string } | null;
  verificadaPor: { id: string; fullName: string } | null;
  _count?: { camaras: number };
}

interface Lente { lente: string; anguloH: number | null; anguloV: number | null; doriEn: 'GRAN_ANGULAR' | 'TELE' | null;
  dori: { identificarM: number; reconocerM: number; observarM: number; detectarM: number } | null }
interface Propuesta {
  marca: string | null; modelo: string | null; resolucion: { ancho: number; alto: number } | null; sensor: string | null;
  zoomOptico: number | null; anguloHTele: number | null; irM: number | null; lentes: Lente[]; avisos: string[];
}
interface Vista { angulo: number; zoom: number; zoomMax: number; dia: Distancias; noche: Distancias | null; irM: number | null }
interface Revision { problemas: string[]; gran: Vista | null; tele: Vista | null }

const NUMEROS = ['resolucionAncho', 'resolucionAlto', 'anguloH', 'anguloV', 'anguloHTele', 'zoomOptico',
  'identificarM', 'reconocerM', 'observarM', 'detectarM', 'irM'] as const;
type Campo = (typeof NUMEROS)[number] | 'lente' | 'sensor' | 'doriEn';
type Valores = Record<Campo, string>;

const VACIO: Valores = {
  lente: '', sensor: '', doriEn: '', resolucionAncho: '', resolucionAlto: '', anguloH: '', anguloV: '',
  anguloHTele: '', zoomOptico: '', identificarM: '', reconocerM: '', observarM: '', detectarM: '', irM: '',
};
const MAX_PDF = 25 * 1024 * 1024;
const txt = (n: number | null | undefined) => (n == null ? '' : String(n));
/**
 * «2,8» también vale: en el teclado del teléfono la coma sale antes que el
 * punto. Pero en Perú la coma también separa los miles («2,400 m» en una
 * PTZ): coma seguida de TRES cifras son miles; de una o dos, decimales.
 */
function aNumero(s: string): number {
  const t = s.trim().replace(/\s/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  return Number(t.replace(',', '.'));
}
const esNumero = (s: string) => s.trim() !== '' && Number.isFinite(aNumero(s));

function desdeGuardada(f: FichaGuardada): Valores {
  return {
    lente: f.lente, sensor: f.sensor ?? '',
    doriEn: f.anguloHTele != null && Math.abs(f.doriAnguloRef - f.anguloHTele) < 0.05 ? 'TELE' : 'GRAN_ANGULAR',
    resolucionAncho: txt(f.resolucionAncho), resolucionAlto: txt(f.resolucionAlto), anguloH: txt(f.anguloH),
    anguloV: txt(f.anguloV), anguloHTele: txt(f.anguloHTele), zoomOptico: txt(f.zoomOptico),
    identificarM: txt(f.identificarM), reconocerM: txt(f.reconocerM), observarM: txt(f.observarM),
    detectarM: txt(f.detectarM), irM: txt(f.irM),
  };
}

/** Lo que se manda al servidor: números de verdad, y lo vacío no se manda. */
function cuerpo(v: Valores): Record<string, string | number> {
  const c: Record<string, string | number> = { lente: v.lente.trim(), doriEn: v.doriEn || 'GRAN_ANGULAR' };
  if (v.sensor.trim()) c.sensor = v.sensor.trim();
  for (const k of NUMEROS) if (esNumero(v[k])) c[k] = aNumero(v[k]);
  return c;
}

export default function FichaOpticaForm({ modelo, ficha, onCerrar, onGuardada }: {
  modelo: ModeloDeFicha;
  /** Con ficha: se corrigen sus números (el PDF no cambia). */
  ficha?: FichaGuardada | null;
  onCerrar: () => void;
  onGuardada: (mensaje: string) => void;
}) {
  const corrigiendo = !!ficha;
  const [v, setV] = useState<Valores>(() => (ficha ? desdeGuardada(ficha) : VACIO));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [aviso, setAviso] = useState('');
  const [revision, setRevision] = useState<(Revision & { de: string }) | null>(null);
  const [confirmo, setConfirmo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const conZoom = esNumero(v.anguloHTele) || (esNumero(v.zoomOptico) && aNumero(v.zoomOptico) > 1);
  const pon = (k: Campo, valor: string) => { setV((x) => ({ ...x, [k]: valor })); setConfirmo(false); };

  /* LEER EL PDF — sólo propone. Si el PDF es una imagen escaneada no tiene
     texto: se dice, y los números se copian a mano mirándolo. */
  const lecturaVigente = useRef(0);
  async function elegirPdf(f: File | null) {
    setError(''); setAviso(''); setPropuesta(null);
    if (!f) { setArchivo(null); return; }
    if (f.type && f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      setArchivo(null); setError('Tiene que ser el PDF de la ficha del fabricante.'); return;
    }
    if (f.size > MAX_PDF) { setArchivo(null); setError('El PDF pesa más de 25 MB.'); return; }
    setArchivo(f);
    const turno = ++lecturaVigente.current;
    setLeyendo(true);
    try {
      const texto = await textoDelPdf(f);
      if (turno !== lecturaVigente.current) return;
      if (texto.trim().length < 40) {
        setAviso('Este PDF no trae texto (parece escaneado). Copia los números a mano mirando el PDF.');
        return;
      }
      const r = await api.post('/modelos/leer-ficha', { texto });
      if (turno !== lecturaVigente.current) return;
      aplicar(r.data as Propuesta);
    } catch (e) {
      if (turno === lecturaVigente.current) setAviso(`No se pudo leer la ficha (${mensajeDeError(e, 'leer la ficha')}). Copia los números a mano.`);
    } finally {
      if (turno === lecturaVigente.current) setLeyendo(false);
    }
  }

  function aplicar(p: Propuesta) {
    setPropuesta(p);
    setV((x) => ({
      ...x,
      resolucionAncho: p.resolucion ? String(p.resolucion.ancho) : x.resolucionAncho,
      resolucionAlto: p.resolucion ? String(p.resolucion.alto) : x.resolucionAlto,
      sensor: p.sensor ?? x.sensor,
      zoomOptico: p.zoomOptico != null ? String(p.zoomOptico) : x.zoomOptico,
      anguloHTele: p.anguloHTele != null ? String(p.anguloHTele) : x.anguloHTele,
      irM: p.irM != null ? String(p.irM) : x.irM,
    }));
    /* Con UNA lente se pone. Con varias NO se elige por el técnico: la lente
       va en la etiqueta de la cámara, y elegir mal pinta un cono equivocado. */
    if (p.lentes.length === 1) elegirLente(p.lentes[0]);
    const otro = p.modelo && !normal(p.modelo).includes(normal(modelo.modelo)) && !normal(modelo.modelo).includes(normal(p.modelo));
    if (otro) setAviso(`El PDF parece del modelo ${p.modelo} y estás cargando ${modelo.modelo}. Comprueba que es la ficha correcta.`);
  }

  function elegirLente(l: Lente) {
    setConfirmo(false);
    setV((x) => ({
      ...x,
      lente: l.lente,
      anguloH: l.anguloH != null ? String(l.anguloH) : x.anguloH,
      anguloV: l.anguloV != null ? String(l.anguloV) : x.anguloV,
      doriEn: l.doriEn ?? x.doriEn,
      identificarM: l.dori ? String(l.dori.identificarM) : '',
      reconocerM: l.dori ? String(l.dori.reconocerM) : '',
      observarM: l.dori ? String(l.dori.observarM) : '',
      detectarM: l.dori ? String(l.dori.detectarM) : '',
    }));
  }

  /* REVISAR MIENTRAS SE ESCRIBE — con las reglas del servidor, no con unas
     propias: si el formulario tuviera las suyas, un día dejaría pasar lo que
     el servidor rechaza. Espera a que el técnico deje de teclear. */
  const completo = !vacio(v.lente) && ['resolucionAncho', 'resolucionAlto', 'anguloH', 'identificarM', 'reconocerM', 'observarM', 'detectarM']
    .every((k) => esNumero(v[k as Campo]));
  const clave = completo ? JSON.stringify(cuerpo({ ...v, doriEn: conZoom ? v.doriEn : 'GRAN_ANGULAR' })) : '';
  useEffect(() => {
    if (!clave) { setRevision(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      api.post('/modelos/revisar-ficha', JSON.parse(clave))
        .then((r) => { if (vivo) setRevision({ ...(r.data as Revision), de: clave }); })
        .catch((e) => { if (vivo) setRevision({ problemas: [mensajeDeError(e, 'revisar los números')], gran: null, tele: null, de: clave }); });
    }, 450);
    return () => { vivo = false; clearTimeout(t); };
  }, [clave]);
  /* Sólo vale la revisión de los números que hay AHORA escritos: la de hace
     un segundo podía decir «todo bien» de un número que ya se cambió. */
  const vigente = revision && revision.de === clave ? revision : null;
  const malEscrito = ([['anguloV', 'El ángulo vertical'], ['zoomOptico', 'El zoom óptico'], ['anguloHTele', 'El ángulo en tele'],
    ['irM', 'El alcance infrarrojo']] as const).find(([k]) => !vacio(v[k]) && !esNumero(v[k]));

  const falta = queFalta(
    [!corrigiendo && !archivo, 'Sube primero el PDF de la ficha del fabricante.'],
    [leyendo, 'Espera a que termine de leer el PDF.'],
    [vacio(v.lente), propuesta && propuesta.lentes.length > 1 ? 'Elige la lente de tus cámaras.' : 'Escribe la lente, como en la ficha: «2.8 mm».'],
    [!esNumero(v.resolucionAncho) || !esNumero(v.resolucionAlto), 'Falta la resolución: ancho y alto en píxeles.'],
    [!esNumero(v.anguloH), 'Falta el ángulo horizontal.'],
    [conZoom && vacio(v.doriEn), 'Di si las distancias de la ficha son en gran angular o en tele.'],
    [!['identificarM', 'reconocerM', 'observarM', 'detectarM'].every((k) => esNumero(v[k as Campo])), 'Faltan distancias: identificar, reconocer, observar y detectar.'],
    [!!malEscrito, malEscrito ? `${malEscrito[1]} no es un número.` : ''],
    [!vigente, 'Revisando los números…'],
    [!!vigente?.problemas.length, vigente?.problemas[0] ?? ''],
    [!confirmo, 'Marca que copiaste los números del PDF.'],
  );

  async function guardar() {
    setGuardando(true); setError('');
    const datos = cuerpo({ ...v, doriEn: conZoom ? v.doriEn : 'GRAN_ANGULAR' });
    try {
      if (corrigiendo) {
        await api.patch(`/modelos/fichas/${ficha!.id}`, datos);
        onGuardada(`Ficha ${datos.lente} corregida. Vuelve a necesitar que otra persona la verifique.`);
      } else {
        const fd = new FormData();
        fd.append('file', archivo!);
        for (const [k, x] of Object.entries(datos)) fd.append(k, String(x));
        await api.post(`/modelos/${modelo.id}/fichas`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        onGuardada(`Ficha ${datos.lente} cargada. Falta que otra persona la verifique con el PDF.`);
      }
    } catch (e) {
      setError(mensajeDeError(e, 'guardar la ficha'));
    } finally {
      setGuardando(false);
    }
  }

  const numero = (k: Campo, etiqueta: string, req = false, ayuda?: string) => (
    <label className="campo">
      <span>{etiqueta}{req && <b className="campo-req">*</b>}</span>
      <input inputMode="decimal" autoComplete="off" value={v[k]} onChange={(e) => pon(k, e.target.value)} />
      {ayuda && <small className="muted">{ayuda}</small>}
    </label>
  );

  return (
    <Modal
      title={`${corrigiendo ? 'Corregir' : 'Nueva'} ficha · ${modelo.marca} ${modelo.modelo}`}
      onClose={onCerrar}
      ancho
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cancelar</button>
          <BotonConMotivo onClick={guardar} ocupado={guardando} falta={falta}>
            {guardando ? 'Guardando…' : corrigiendo ? 'Guardar corrección' : 'Guardar ficha'}
          </BotonConMotivo>
        </>
      }
    >
      {error && <div role="alert" className="aviso-error">{error}</div>}

      {!corrigiendo && (
        <label className="campo campo-ancho">
          <span>PDF de la ficha del fabricante<b className="campo-req">*</b></span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => elegirPdf(e.target.files?.[0] ?? null)} />
          <small className="muted">
            {leyendo ? 'Leyendo la ficha…' : 'Se guarda como prueba. Los números que encuentre se proponen; tú los compruebas.'}
          </small>
        </label>
      )}
      {corrigiendo && (
        <div role="status" className="aviso-pendiente">Al corregir, la ficha vuelve a quedar sin verificar.</div>
      )}

      {aviso && <div role="status" className="aviso-pendiente">{aviso}</div>}
      {!!propuesta?.avisos.length && (
        <div role="status" className="aviso-pendiente">
          <b>El PDF no lo dice todo:</b>
          <ul>{propuesta.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      {propuesta && propuesta.lentes.length > 1 && (
        <div role="group" aria-label="Lente de tus cámaras">
          <span className="muted" style={{ fontSize: 12.5 }}>Esta ficha trae varias lentes. ¿Cuál llevan tus cámaras?</span>
          <div className="lente-elegir">
            {propuesta.lentes.map((l) => (
              <button key={l.lente} type="button" className="btn-mini" aria-pressed={v.lente === l.lente} onClick={() => elegirLente(l)}>
                {l.lente}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-grid">
        <label className="campo">
          <span>Lente<b className="campo-req">*</b></span>
          <input value={v.lente} onChange={(e) => pon('lente', e.target.value)} placeholder="2.8 mm" autoComplete="off" />
        </label>
        <label className="campo">
          <span>Sensor</span>
          <input value={v.sensor} onChange={(e) => pon('sensor', e.target.value)} placeholder='1/3" CMOS' autoComplete="off" />
        </label>
        {numero('resolucionAncho', 'Resolución: ancho (px)', true)}
        {numero('resolucionAlto', 'Resolución: alto (px)', true)}
        {numero('anguloH', 'Ángulo horizontal (°)', true, conZoom ? 'Con el zoom al mínimo (gran angular).' : undefined)}
        {numero('anguloV', 'Ángulo vertical (°)')}
        {numero('zoomOptico', 'Zoom óptico (x)', false, 'Sólo el óptico. El digital no cuenta.')}
        {numero('anguloHTele', 'Ángulo horizontal en tele (°)', false, 'Con el zoom al máximo. Vacío si es fija.')}
        {conZoom && (
          <label className="campo campo-ancho">
            <span>¿A qué ángulo da la ficha las distancias?<b className="campo-req">*</b></span>
            <select value={v.doriEn} onChange={(e) => pon('doriEn', e.target.value)}>
              <option value="">— elige —</option>
              <option value="GRAN_ANGULAR">En gran angular (zoom al mínimo)</option>
              <option value="TELE">En tele (zoom al máximo)</option>
            </select>
          </label>
        )}
        {numero('identificarM', 'Identificar (m)', true, 'Se ve la cara: se sabe quién es.')}
        {numero('reconocerM', 'Reconocer (m)', true, 'Se reconoce a alguien conocido.')}
        {numero('observarM', 'Observar (m)', true, 'Se ve qué está haciendo.')}
        {numero('detectarM', 'Detectar (m)', true, 'Sólo se nota que hay alguien.')}
        {numero('irM', 'Alcance infrarrojo (m)', false, 'Hasta dónde ve de noche con su luz IR.')}
      </div>

      {vigente && vigente.problemas.length > 0 && (
        <div role="alert" className="aviso-error">
          <b>Esto no cuadra:</b>
          <ul>{vigente.problemas.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {vigente?.gran && (
        <div className="ficha-vista">
          <div>
            <h4>{vigente.tele ? `En gran angular (${Math.round(vigente.gran.angulo)}°)` : `Lo que verá (${Math.round(vigente.gran.angulo)}°)`}</h4>
            <LoQueVe dia={vigente.gran.dia} noche irM={vigente.gran.irM} />
          </div>
          {vigente.tele && (
            <div>
              <h4>{`Con el zoom al máximo (${vigente.tele.angulo}°)`}</h4>
              <LoQueVe dia={vigente.tele.dia} />
              <small className="muted">{`Detecta hasta ${metros(vigente.tele.dia.detectar)}.`}</small>
            </div>
          )}
        </div>
      )}

      <label className="campo campo-ancho" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)}
          style={{ width: 18, height: 18, minHeight: 18 }} />
        <span style={{ margin: 0 }}>
          Copié estos números del PDF del fabricante.
          <small className="muted" style={{ display: 'block' }}>Quedan con tu nombre; otra persona los verifica.</small>
        </span>
      </label>
    </Modal>
  );
}

function normal(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}
