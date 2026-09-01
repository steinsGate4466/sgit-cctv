import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { enviarConRespaldo, TEXTO_PENDIENTE } from '../envio-seguro';
import FiltroAmbito, { Ambito, AMBITO_VACIO, conAmbito, AvisoAmbito } from '../components/FiltroAmbito';
import Modal from '../components/Modal';
import AccessRequestForm, { MEANS_ES, STATUS_ES as ACC_STATUS_ES, STATUS_BADGE as ACC_BADGE } from '../components/AccessRequestForm';
import { useAuth } from '../auth/AuthContext';
import { useAutoOcultar } from '../auth/useInactivity';
import AssetSpecFields, { FICHA_DE } from '../components/AssetSpecFields';
import AssetPhotoPicker, { FotoPendiente } from '../components/AssetPhotoPicker';
import HistorialActivo from '../components/HistorialActivo';
import CriticidadActivo from '../components/CriticidadActivo';
import RepuestosDelActivo from '../components/RepuestosDelActivo';
import BorrarDefinitivo from '../components/BorrarDefinitivo';
import Icono from '../components/Iconos';
import { useDialogos } from '../components/Dialogos';
import { useOcultarAlSalir } from '../useVolverALaPantalla';
import { fecha, plural } from '../formato';
import { fechaTabla } from '../fechas';
import { mensajeDeError } from '../avisos';

/* LOS TIPOS QUE SE PUEDEN DAR DE ALTA — bloque 74.
   ---------------------------------------------------------------------------
   `FIBER` YA NO ESTÁ, y es la regla 1 del estándar de activos:

       UN CABLE NO ES UN ACTIVO. Es lo que CONECTA dos activos.

   Un tramo de fibra no tiene marca ni serie, no se le hace una rutina, y no se
   pide como repuesto con un código: se compra por metro. Lo que sí se hace es
   declararlo en «Conexiones», que es donde vive un enlace entre dos equipos.

   Cuando un tramo se corta, la orden NO se abre sobre el cable: se abre sobre
   el equipo que se quedó sin comunicación, y en el diagnóstico se dice que fue
   el tramo. Que es como se trabaja en planta.

   Y ya no existe en la base tampoco: la migración
   `20260906000000_la_fibra_no_es_un_activo` la borró de la lista, después de
   comprobar que ninguna de las cinco tablas que la usan tenía un solo
   registro. Queda además un verificador que lo caza si alguien lo vuelve a
   poner. */
const TYPES = ['CAMERA', 'NVR', 'SWITCH', 'WIRELESS', 'DECODER', 'PANTALLA', 'PC', 'ROUTER', 'FIREWALL', 'SERVER', 'UPS', 'CABINET', 'TABLERO_ELECTRICO', 'OTHER'];
const STATES = ['OPERATIVO', 'FUERA_SERVICIO', 'MANTENIMIENTO', 'BAJA', 'STOCK'];
const CRITS = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
// Tipos montados en rack: es obligatorio indicar en qué gabinete están.
/* Los colores de la letra A/B/C (bloque 78). Mismos que en la ficha y en la
   pantalla de Gestión: si un mismo dato se pinta de dos colores según dónde
   se mire, deja de reconocerse de un vistazo. */
const LETRA_FONDO: Record<string, string> = { A: '#fee2e2', B: '#ffedd5', C: '#e0e7ff' };
/* Las tarjetas del reparto llevan también el ámbar de «sin clasificar»: un
   pendiente no es un error, es trabajo por hacer. El rojo se reserva para lo
   que ya falló. */
const LETRA_FONDO_T: Record<string, string> = { ...LETRA_FONDO, SIN_CLASIFICAR: '#fef3c7' };
const LETRA_COLOR: Record<string, string> = { A: '#991b1b', B: '#9a3412', C: '#3730a3' };
const LETRA_COLOR_T: Record<string, string> = { ...LETRA_COLOR, SIN_CLASIFICAR: '#92400e' };

const CABINET_REQUIRED = ['NVR', 'SWITCH', 'SERVER', 'DECODER', 'ROUTER', 'FIREWALL'];
// Tipos de fotografía del activo.
// Zona productiva de la planta a la que pertenece el activo.
// El tren ya no es un campo del activo: se deduce del árbol de ubicaciones.
const AMBIENTE_ES: Record<string, string> = {
  CALOR_RADIANTE: 'Calor radiante (horno)',
  VAPOR_AGUA: 'Vapor y agua (tren)',
  POLVO_METALICO: 'Polvo metálico / cascarilla',
  INTEMPERIE_SALINA: 'Intemperie (patio, almacén)',
  EMI_ALTA: 'Sala eléctrica / MCC',
  CLIMATIZADO: 'Climatizado (púlpito)',
};

const PHOTO_KINDS = ['APUNTA', 'REFERENCIA', 'PLANO', 'GENERAL'];
const PHOTO_KIND_ES: Record<string, string> = { APUNTA: 'Imagen en pantalla (púlpito)', REFERENCIA: 'Ubicación de referencia', PLANO: 'Ubicación en plano', GENERAL: 'General' };

// Etiquetas en español (los valores internos siguen en inglés para no romper datos)
const TYPE_ES: Record<string, string> = { CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router', FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', CABINET: 'Gabinete', DECODER: 'Decodificador', PC: 'PC / iVMS-4200', PANTALLA: 'Pantalla de púlpito', OTHER: 'Otro' };
const STATUS_ES: Record<string, string> = { OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento', CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock' };
const CRIT_ES: Record<string, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };
const tEs = (v: string) => TYPE_ES[v] || v;
const sEs = (v: string) => STATUS_ES[v] || v;
const cEs = (v: string) => CRIT_ES[v] || v;

function Frow({ k, v }: { k: string; v: any }) {
  return (
    <div className="frow">
      <span className="k">{k}</span>
      <span className="v">{v === null || v === undefined || v === '' ? '—' : String(v)}</span>
    </div>
  );
}

export default function Assets() {
  const { confirmar, avisar, pedirTexto } = useDialogos();
  const { can, user } = useAuth();
  // Si se llega desde una OM de mapeo (/assets?om=...), los activos que se
  // registren quedan ligados a esa orden: así se puede reconstruir después
  // quién los levantó, cuándo y con quién iba.
  const [params] = useSearchParams();
  const omMapeo = params.get('om');
  const omCodigo = params.get('codigo');
  /* `?activo=<id>` — se llega desde el QR con «Ver la ficha completa».
     Antes ese botón mandaba a `/assets?search=CODIGO`, o sea a una LISTA
     FILTRADA: el técnico escaneaba justo para no tener que buscar el equipo,
     y acababa delante de una tabla teniendo que pulsar otra vez la fila. Con
     esto la ficha se abre sola, que es lo que la palabra «ficha» promete. */
  const activoPedido = params.get('activo');
  const [rows, setRows] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [cabinets, setCabinets] = useState<any[]>([]);
  // Tableros eléctricos: en planta hay switches pequeños atornillados dentro.
  const [tableros, setTableros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  // Borrado DEFINITIVO. No es la baja: la baja retira un equipo real y le
  // conserva el historial; esto es para el registro que nunca debió existir
  // (una prueba, un duplicado, un código mal tecleado). Sólo el Jefe.
  const [aPurgar, setAPurgar] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [creds, setCreds] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<any>({});

  // Fotografías del activo (a qué apunta, referencia, plano)
  const [photos, setPhotos] = useState<any[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoKind, setPhotoKind] = useState('REFERENCIA');
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Solicitud de acceso especial (activo inaccesible)
  const [accessFor, setAccessFor] = useState<any>(null);
  // Contraseñas reveladas en la tabla (bajo demanda, auditado)
  const [rowPass, setRowPass] = useState<Record<string, string>>({});
  // Filtros y paginación — AHORA EN EL SERVIDOR.
  // Antes se filtraba en el navegador sobre la lista completa. Con paginación
  // eso sería un error silencioso: el filtro solo miraría la página visible y
  // el usuario creería que no hay más coincidencias.
  const [fq, setFq] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({ total: 0, page: 1, pageSize: 50, pages: 1 });
  /* ESTRUCTURA DE ACTIVOS (bloque 81).
     El reparto de TODA la planta —no de la página—: es lo que se pinta en las
     cuatro tarjetas de arriba. Un recuento por página sería un número que
     cambia al pasar de hoja, y eso destruye la confianza en la cifra. */
  const [reparto, setReparto] = useState<Record<string, number>>(
    { A: 0, B: 0, C: 0, SIN_CLASIFICAR: 0 },
  );
  const [fLetra, setFLetra] = useState('');
  // QR del activo
  const [qrFor, setQrFor] = useState<any>(null);
  const [qrUrl, setQrUrl] = useState('');

  // Alta firmada de activo
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [tries, setTries] = useState(5);

  // Actualización de estado (Técnico / Técnico de Red)
  const [newStatus, setNewStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Edición de red y accesos (Jefe de Mantenimiento / Técnico de Red = credential.manage)
  const [ipEdit, setIpEdit] = useState('');
  const [savingIp, setSavingIp] = useState(false);
  const [cred, setCred] = useState<any>({ username: '', type: '', secret: '' });

  // Edición rápida (tiempo real) de IP + contraseña desde la tabla
  const [quick, setQuick] = useState<any>(null);
  const [qIp, setQIp] = useState('');
  const [qPass, setQPass] = useState('');
  const [qSaving, setQSaving] = useState(false);

  // Ficha propia del tipo (cámara, grabador, switch, antena, decodificador,
  // pantalla, PC). Se envía en su propio bloque dentro del cuerpo del alta.
  const [spec, setSpec] = useState<any>({});
  // Lista ligera de activos, para los desplegables de dependencia:
  // "esta cámara entra al grabador X", "esta antena cuelga del AP Y".
  const [opciones, setOpciones] = useState<any[]>([]);
  // Fotos elegidas DURANTE el alta. Se suben cuando el activo ya existe: no se
  // puede subir a un activo que todavía no tiene identificador.
  const [fotosNuevas, setFotosNuevas] = useState<FotoPendiente[]>([]);

  // useCallback y NO una función suelta: esta consulta SÍ depende de los
  // filtros, así que tiene que entrar en las dependencias del efecto. Sin
  // useCallback la función se recrea en cada render y el efecto se dispararía
  // en bucle. Con él, solo cambia cuando cambia un filtro de verdad.
  const loadAssets = useCallback(async (p?: number) => {
    const params: any = conAmbito({ page: p ?? page, pageSize: 50 }, ambito);
    if (fq.trim()) params.search = fq.trim();
    if (fType) params.type = fType;
    if (fStatus) params.status = fStatus;
    if (fLetra) params.letra = fLetra;
    const r = await api.get('/assets', { params }).then((x) => x.data).catch(() => null);
    if (!r) return;
    setRows(r.items || []);
    setMeta({ total: r.total, page: r.page, pageSize: r.pageSize, pages: r.pages });
    if (r.reparto) setReparto(r.reparto);
  }, [page, fq, fType, fStatus, fLetra, ambito]);

  // Catálogos que no cambian con el filtro: se cargan una sola vez.
  useEffect(() => {
    Promise.all([
      api.get('/locations').then((r) => r.data).catch(() => []),
      api.get('/cabinets').then((r) => r.data).catch(() => []),
      api.get('/assets/options').then((r) => r.data).catch(() => []),
      api.get('/electricidad/tableros').then((r) => r.data).catch(() => []),
    ]).then(([l, c, o, t]) => {
      setLocations(l || []); setCabinets(c || []); setOpciones(o || []); setTableros(t || []);
    });
  }, []);

  // Recarga al cambiar filtros o página. El retardo de 350 ms evita disparar
  // una consulta por cada tecla que el usuario escribe en el buscador.
  useEffect(() => {
    const t = setTimeout(() => { loadAssets(page).finally(() => setLoading(false)); }, 350);
    return () => clearTimeout(t);
  }, [loadAssets, page]);

  // Cualquier cambio de filtro vuelve a la primera página: si estabas en la
  // página 4 y filtras, la 4 puede no existir en el resultado nuevo.
  useEffect(() => { setPage(1); }, [fq, fType, fStatus, ambito]);

  /* Abrir la ficha que venía en la dirección. Se dispara UNA sola vez —de ahí
     la lista de dependencias con sólo el identificador—: si se relanzara en
     cada repintado, cerrar la ficha la volvería a abrir y no habría forma de
     salir de ella. */
  useEffect(() => {
    if (activoPedido) openDetail(activoPedido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activoPedido]);

  // Las contraseñas reveladas se borran solas al minuto: aunque el usuario siga
  // trabajando, una clave no debe quedarse escrita en pantalla —basta que
  // alguien pase por detrás del púlpito—.
  //
  // ATENCIÓN: estos hooks van AQUÍ, junto al resto, y NUNCA después del
  // `if (loading) return ...`. React exige que se llame siempre a los mismos
  // hooks en el mismo orden: si una salida temprana los saltea en el primer
  // render y luego sí se ejecutan, React aborta el componente y la pantalla
  // queda en blanco. TypeScript no detecta esto; solo se ve al ejecutarlo.
  useAutoOcultar(rowPass, () => setRowPass({}), 60);
  useAutoOcultar(revealed, () => setRevealed({}), 60);

  /* Bloque 37 — EL TELÉFONO ES DEL TÉCNICO.
     Al cambiar de aplicación, Android e iOS guardan una captura de la última
     pantalla para el conmutador. Si había una contraseña de cámara a la
     vista, esa imagen queda en su teléfono y no hay forma de borrarla desde
     aquí. Los 60 segundos de `useAutoOcultar` no cubren el instante exacto
     del cambio de app; esto sí. */
  useOcultarAlSalir(() => { setRowPass({}); setRevealed({}); });

  function openNew() {
    setFormErr('');
    setTries(5);
    setSpec({});
    setFotosNuevas([]);
    setForm({ assetCode: '', type: 'CAMERA', brand: '', model: '', serialNumber: '', ipAddress: '', devicePass: '', status: 'OPERATIVO', criticality: 'MEDIA', locationId: '', cabinetId: '', tableroId: '', referencePlace: '', sapId: '', responsibleArea: '', email: user?.email || '', password: '' });
  }
  function openEdit(a: any) {
    setFormErr(''); setTries(5); setDetail(null); setFotosNuevas([]);
    // Precarga la ficha del tipo que ya tenga guardada. Se copian solo los
    // campos editables: el identificador y las relaciones no se envían de vuelta.
    const bloque = FICHA_DE[a.type];
    const guardada = bloque ? (a as any)[bloque] : null;
    if (guardada) {
      const { assetId, asset, vlan, switchPort, poeSourcePort, outputs, cells, fedByOutputs, ...campos } = guardada;
      setSpec(campos);
    } else {
      setSpec({});
    }
    setForm({
      id: a.id, assetCode: a.assetCode || '', type: a.type || 'CAMERA', brand: a.brand || '', model: a.model || '',
      serialNumber: a.serialNumber || '', ipAddress: a.ipAddress || '', status: a.status || 'OPERATIVO',
      criticality: a.criticality || 'MEDIA', locationId: a.locationId || '', cabinetId: a.cabinetId || '', tableroId: a.tableroId || '', referencePlace: a.referencePlace || '', sapId: a.sapId || '',
      responsibleArea: a.responsibleArea || '', devicePass: '', email: user?.email || '', password: '',
    });
  }
  async function submitNew(e: any) {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      const body: any = {
        assetCode: form.assetCode, type: form.type, status: form.status, criticality: form.criticality,
        brand: form.brand || undefined, model: form.model || undefined, serialNumber: form.serialNumber || undefined,
        ipAddress: form.ipAddress || undefined, referencePlace: form.referencePlace || undefined,
        locationId: form.locationId || undefined, cabinetId: form.cabinetId || undefined, tableroId: form.tableroId || undefined, sapId: form.sapId || undefined, responsibleArea: form.responsibleArea || undefined,
        email: form.email, password: form.password,
      };
      // Vínculo con la orden de mapeo, si se llegó desde ella.
      if (omMapeo && !form.id) body.mappedInWorkOrderId = omMapeo;
      // La ficha del tipo va en su propio bloque, con el nombre que espera el
      // servidor. Solo se envía si tiene algún dato: un bloque vacío haría
      // creer que la ficha ya está hecha y falsearía el avance del mapeo.
      const bloqueFicha = FICHA_DE[form.type];
      if (bloqueFicha) {
        const limpia: any = {};
        for (const [k, val] of Object.entries(spec || {})) {
          if (val !== undefined && val !== null && val !== '') limpia[k] = val;
        }
        if (Object.keys(limpia).length) body[bloqueFicha] = limpia;
      }
      /* SIN SEÑAL NO SE PIERDE LO ESCRITO.
         Este es EL formulario del mapeo: el que se va a usar 300 veces dentro
         de una nave de estructura metálica con datos móviles. Hasta ahora era
         justo el que NO tenía red de seguridad — la cola existía y sólo la
         usaban dos pantallas de ejemplo.
         `enviarConRespaldo` guarda en el teléfono si no hay red o si el
         servidor falla, y RELANZA si el servidor rechazó el contenido (4xx):
         eso hay que corregirlo, no encolarlo. */
      let assetId = form.id;
      const r = form.id
        ? await enviarConRespaldo('patch', '/assets/' + form.id + '/edit', body,
            `Editar activo ${form.assetCode || form.id}`)
        : await enviarConRespaldo('post', '/assets', body,
            `Alta de activo ${form.assetCode || '(sin código)'}`);

      if (r.pendiente) {
        // Las fotos NO se encolan: pesan y el aviso tiene que ser honesto.
        setForm(null); setSpec({});
        if (fotosNuevas.length) {
          await avisar(
            TEXTO_PENDIENTE +
            `\n\nLas ${fotosNuevas.length} foto(s) NO se guardaron: tendrás que ` +
            'volver a tomarlas desde la ficha cuando el activo suba.',
          );
        } else {
          await avisar(TEXTO_PENDIENTE);
        }
        setFotosNuevas([]);
        setSaving(false);
        return;
      }
      assetId = form.id || (r.datos as any)?.id;
      /* LA CONTRASEÑA DEL EQUIPO NO SE PIERDE EN SILENCIO (bloque 77).
         ANTES: `.catch(() => {})`. Si el guardado fallaba, el activo se creaba,
         la pantalla decía «guardado» y la contraseña NO estaba en ningún sitio.
         Nadie se enteraba hasta que alguien iba a conectarse a la cámara —
         semanas después, y sin forma de saber qué pasó.

         Se avisa Y se dice qué hacer. El alta del activo SÍ salió bien: no hay
         que repetirla, sólo volver a poner la contraseña desde la ficha. */
      if (form.devicePass && assetId) {
        try {
          await api.post('/credentials', { assetId, username: 'admin', secret: form.devicePass, type: 'equipo' });
        } catch (e: any) {
          await avisar(
            `El activo se registró, pero la contraseña del equipo NO se guardó.\n\n${mensajeDeError(e, 'guardar la contraseña')}\n\n`
            + 'Vuelve a ponerla desde la ficha del activo. El alta no hay que repetirla.',
          );
        }
      }

      // Fotos tomadas durante el alta. Se suben una por una: si alguna falla no
      // se pierden las demás y al final se avisa cuáles quedaron sin subir.
      if (fotosNuevas.length && assetId) {
        const fallidas: string[] = [];
        for (const f of fotosNuevas) {
          const fd = new FormData();
          fd.append('file', f.file);
          fd.append('kind', f.kind);
          if (f.caption) fd.append('caption', f.caption);
          const ok = await api.post('/assets/' + assetId + '/photos', fd)
            .then(() => true).catch(() => false);
          if (!ok) fallidas.push(f.file.name);
          URL.revokeObjectURL(f.url);
        }
        if (fallidas.length) {
          await avisar(
            'El activo se guardó, pero estas fotos no se pudieron subir:\n' +
            fallidas.join('\n') +
            '\n\nPuedes volver a subirlas desde la ficha del activo.',
          );
        }
      }
      setForm(null);
      setSpec({});
      setFotosNuevas([]);
      await loadAssets();
      // Si la ficha quedó incompleta se avisa, pero NO se bloquea: el técnico
      // registra en campo con lo que tiene y completa después.
      if (assetId) {
        const d = await api.get('/assets/' + assetId).then((r) => r.data).catch(() => null);
        if (d?.pendiente) {
          await avisar(
            `Activo guardado.\n\n${d.pendiente}\n\n` +
            'Queda marcado como ficha incompleta: puedes completarlo después, ' +
            'incluso escaneando su QR desde el celular en planta.',
          );
        }
      }
    } catch (err: any) {
      const m = err?.response?.data?.message;
      const msg = Array.isArray(m) ? m.join(', ') : m || 'No se pudo registrar el activo.';
      // Firma incorrecta: alerta con intentos restantes, sin cerrar sesión.
      if (/firma inv|contrase/i.test(msg)) {
        const left = tries - 1;
        setTries(left);
        setFormErr(left > 0 ? `Contraseña incorrecta. Te quedan ${left} intento(s).` : 'Contraseña incorrecta. Sin intentos restantes; vuelve a intentarlo más tarde.');
      } else setFormErr(msg);
    } finally { setSaving(false); }
  }

  async function openDetail(id: string) {
    setRevealed({});
    setCreds([]);
    setPhotoFile(null); setPhotoCaption(''); setPhotoKind('REFERENCIA');
    const d = await api.get('/assets/' + id).then((r) => r.data).catch(() => null);
    setDetail(d);
    setPhotos(d?.photos || []);
    setNewStatus(d?.status || '');
    setIpEdit(d?.ipAddress || '');
    setCred({ username: '', type: '', secret: '' });
    if (d && can('credential.read')) {
      const c = await api.get('/credentials?assetId=' + id).then((r) => r.data).catch(() => []);
      setCreds(c || []);
    }
  }

  /** Revela la clave de un equipo desde la tabla (una sola, auditada en el servidor). */
  async function revealRow(a: any) {
    if (!a.credentialId) return;
    const r = await api.get('/credentials/' + a.credentialId + '/reveal').then((res) => res.data).catch(() => null);
    if (r) setRowPass((p) => ({ ...p, [a.id]: r.secret }));
    else await avisar('No se pudo revelar la contraseña.');
  }

  /** Muestra el QR del activo para pegarlo en el equipo. */
  async function openQr(a: any) {
    setQrFor(a); setQrUrl('');
    try {
      const res = await api.get('/assets/' + a.id + '/qr', { responseType: 'blob' });
      setQrUrl(URL.createObjectURL(res.data));
    } catch { await avisar('No se pudo generar el QR.'); }
  }
  async function downloadQrSheet() {
    try {
      const res = await api.get('/assets/qr/sheet', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = 'etiquetas-qr.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo generar la hoja de etiquetas.'); }
  }

  async function reveal(credId: string) {
    const r = await api.get('/credentials/' + credId + '/reveal').then((res) => res.data).catch(() => null);
    if (r) setRevealed((prev: any) => ({ ...prev, [credId]: r.secret }));
  }

  async function uploadPhoto() {
    if (!photoFile || !detail) { await avisar('Selecciona una imagen.'); return; }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', photoFile);
      fd.append('kind', photoKind);
      if (photoCaption) fd.append('caption', photoCaption);
      await api.post('/assets/' + detail.id + '/photos', fd);
      setPhotoFile(null); setPhotoCaption('');
      const ph = await api.get('/assets/' + detail.id + '/photos').then((r) => r.data).catch(() => []);
      setPhotos(ph || []);
    } catch { await avisar('No se pudo subir la foto.'); }
    finally { setUploadingPhoto(false); }
  }
  async function viewPhoto(ph: any) {
    try {
      const res = await api.get('/assets/photos/' + ph.id + '/file', { responseType: 'blob' });
      // res.data ya es un Blob con su Content-Type (image/jpeg|png); usarlo directo
      // preserva el tipo para que el navegador lo muestre como imagen y no como texto.
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { await avisar('No se pudo abrir la foto.'); }
  }
  async function delPhoto(ph: any) {
    if (!(await confirmar('¿Eliminar esta foto?'))) return;
    /* Si el borrado falla se DICE (bloque 77). Antes se tragaba el error, se
       recargaba la lista y la foto seguía ahí: el usuario la ve, vuelve a
       pulsar, sigue ahí, y concluye —con razón— que el software no funciona. */
    try {
      await api.delete('/assets/photos/' + ph.id);
    } catch (e: any) {
      await avisar(mensajeDeError(e, 'eliminar la foto'));
      return;
    }
    const list = await api.get('/assets/' + detail.id + '/photos').then((r) => r.data).catch(() => []);
    setPhotos(list || []);
  }
  /**
   * Informe del equipo en PDF.
   *
   * Recibe el activo como parámetro para poder llamarlo TAMBIÉN desde la tabla.
   * Antes leía `detail`, así que solo funcionaba con la ficha abierta: desde el
   * listado el informe era invisible y nadie sabía que existía.
   */
  async function descargarInforme(activo: any) {
    if (!activo?.id) return;
    try {
      const res = await api.get('/assets/' + activo.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = (activo.assetCode || 'informe') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo generar el informe.'); }
  }

  async function saveStatus() {
    if (!detail || !newStatus || newStatus === detail.status) return;
    setSavingStatus(true);
    try {
      await api.patch('/assets/' + detail.id + '/status', { status: newStatus });
      setDetail({ ...detail, status: newStatus });
      await loadAssets();
    } catch { await avisar('No se pudo actualizar el estado.'); }
    finally { setSavingStatus(false); }
  }

  async function saveIp() {
    setSavingIp(true);
    try {
      await api.patch('/assets/' + detail.id + '/network', { ipAddress: ipEdit || undefined });
      setDetail({ ...detail, ipAddress: ipEdit });
      await loadAssets();
    } catch { await avisar('No se pudo actualizar la IP.'); }
    finally { setSavingIp(false); }
  }

  // Guarda IP + contraseña del equipo juntas (la contraseña va cifrada como credencial).
  function openQuickEdit(a: any) {
    setQuick(a); setQIp(a.ip || ''); setQPass(a.password || '');
  }
  async function saveQuick() {
    setQSaving(true);
    try {
      if (qIp !== (quick.ip || '')) {
        await api.patch('/assets/' + quick.id + '/network', { ipAddress: qIp || undefined });
      }
      if (qPass && qPass !== (quick.password || '')) {
        await api.post('/credentials', { assetId: quick.id, username: 'admin', secret: qPass, type: 'equipo' });
      }
      setQuick(null);
      await loadAssets();
    } catch { await avisar('No se pudo actualizar la IP / contraseña.'); }
    finally { setQSaving(false); }
  }

  async function saveAccess() {
    setSavingIp(true);
    try {
      if (ipEdit !== (detail.ipAddress || '')) {
        await api.patch('/assets/' + detail.id + '/network', { ipAddress: ipEdit || undefined });
        setDetail({ ...detail, ipAddress: ipEdit });
      }
      if (cred.secret) {
        await api.post('/credentials', { assetId: detail.id, username: cred.username || 'admin', secret: cred.secret, type: 'equipo' });
        setCred({ username: '', type: '', secret: '' });
        const c = await api.get('/credentials?assetId=' + detail.id).then((r) => r.data).catch(() => []);
        setCreds(c || []);
      }
      await loadAssets();
    } catch { await avisar('No se pudo guardar el acceso.'); }
    finally { setSavingIp(false); }
  }
  async function addCredential() {
    if (!cred.secret) { await avisar('La contraseña del equipo es obligatoria.'); return; }
    try {
      await api.post('/credentials', { assetId: detail.id, username: cred.username || 'admin', secret: cred.secret, type: cred.type || undefined });
      setCred({ username: '', type: '', secret: '' });
      const c = await api.get('/credentials?assetId=' + detail.id).then((r) => r.data).catch(() => []);
      setCreds(c || []);
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la credencial.');
    }
  }
  /** Baja de activo: limpieza de registros de prueba o equipos retirados de planta. */
  async function removeAsset(a: any) {
    const paso1 = await confirmar(
      `¿Dar de baja el activo ${a.assetCode}?\n\n` +
      'Dejará de aparecer en listados, planes preventivos y tableros.\n' +
      'Su historial (OM, incidencias, auditoría) se conserva como evidencia.',
    );
    if (!paso1) return;
    const conf = await pedirTexto(`Confirma escribiendo el código del activo: ${a.assetCode}`);
    if (conf !== a.assetCode) {
      if (conf !== null) await avisar('El código no coincide. No se dio de baja.');
      return;
    }
    try {
      await api.delete('/assets/' + a.id);
      setDetail(null);
      await loadAssets();
      await avisar('Activo dado de baja.');
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo dar de baja el activo.');
    }
  }

  async function delCredential(id: string) {
    if (!(await confirmar('¿Eliminar esta credencial?'))) return;
    /* ÉSTE ES EL PEOR DE LOS TRES (bloque 77). Antes se tragaba el error: el
       usuario creía que había borrado la contraseña de una cámara y la
       contraseña seguía guardada. No es un fallo de comodidad, es de
       seguridad — alguien da de baja a un contratista, borra sus accesos,
       falla el borrado y nadie se entera. */
    try {
      await api.delete('/credentials/' + id);
    } catch (e: any) {
      await avisar(
        `${mensajeDeError(e, 'eliminar la credencial')}\n\nLA CREDENCIAL SIGUE GUARDADA. Vuelve a intentarlo.`,
      );
      return;
    }
    const c = await api.get('/credentials?assetId=' + detail.id).then((r) => r.data).catch(() => []);
    setCreds(c || []);
  }

  if (loading) return <div className="loading">Cargando activos…</div>;

  // El servidor ya devuelve la página filtrada: aquí solo se pinta.
  const visibles = rows;
  const hayFiltro = !!(fq.trim() || fType || fStatus);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {/* ESTRUCTURA DE ACTIVOS (bloque 81).
              Se llamaba «Activos Tecnológicos». En la hoja del ingeniero es el
              paso ① y se llama «Estructura de activos» — y el nombre importa
              porque describe lo que hay que hacer con la pantalla: no mirar
              una lista, sino ver cómo está REPARTIDA la planta. */}
          <h1 className="page-title">Estructura de activos</h1>
          <p className="page-sub">
            {hayFiltro
              ? `${meta.total} equipos encontrados`
              : `${meta.total} equipos · pulsa uno para ver su ficha`}
            {meta.pages > 1 && ` · página ${meta.page} de ${meta.pages}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-mini" onClick={downloadQrSheet}><Icono n="qr" size={14} /> Etiquetas QR (PDF)</button>
          {can('asset.create') && <button className="btn-primary" onClick={openNew}>+ Nuevo activo</button>}
        </div>
      </div>
      {/* ============================================================ b81
           EL REPARTO DE LA PLANTA POR CRITICIDAD
           --------------------------------------------------------------
           Es lo primero que se ve, y contesta la pregunta con la que se
           abre esta pantalla: **¿qué es lo importante de lo que tengo?**

           Una lista plana de cuatrocientas filas no lo contesta. Cuatro
           números sí, y además FILTRAN: pulsar «A» deja sólo las A.

           LOS SIN CLASIFICAR NO SE ESCONDEN. Son lo único accionable de
           las cuatro tarjetas —una letra no se «arregla», un pendiente
           sí— y por eso van con su color de aviso, no en gris.
           ============================================================ */}
      <div className="ea-reparto">
        {([
          { k: 'A', et: 'Criticidad A', pie: 'Lo más exigente' },
          { k: 'B', et: 'Criticidad B', pie: 'Exigencia media' },
          { k: 'C', et: 'Criticidad C', pie: 'Puede esperar' },
          { k: 'SIN_CLASIFICAR', et: 'Sin clasificar', pie: 'Falta declararlos' },
        ] as const).map((x) => (
          <button
            key={x.k}
            type="button"
            className={`ea-tarjeta${fLetra === x.k ? ' ea-activa' : ''}`}
            style={{ background: LETRA_FONDO_T[x.k], color: LETRA_COLOR_T[x.k] }}
            aria-pressed={fLetra === x.k}
            onClick={() => { setFLetra(fLetra === x.k ? '' : x.k); setPage(1); }}
          >
            <span className="ea-num">{reparto[x.k] ?? 0}</span>
            <span className="ea-et">{x.et}</span>
            <span className="ea-pie">{x.pie}</span>
          </button>
        ))}
      </div>

      {/* Filtrando por letra, el paginador cuenta lo de ESTA página y no la
          tabla entera: la letra se recalcula en cada consulta y no se puede
          filtrar en la base. Se dice, porque callarlo haría leer «8 de letra
          A» creyendo que son los 8 de la planta. */}
      {fLetra && (
        <div className="ea-aviso">
          Viendo sólo <b>{fLetra === 'SIN_CLASIFICAR' ? 'los pendientes' : `criticidad ${fLetra}`}</b>{' '}
          dentro de esta página. El total de la planta es el de la tarjeta.
          <button className="btn-mini" onClick={() => { setFLetra(''); setPage(1); }}>
            Ver todos
          </button>
        </div>
      )}

      {omMapeo && (
        <div style={{
          background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8,
          padding: '10px 14px', margin: '12px 0', fontSize: 13, color: '#1e40af',
        }}>
          Estás registrando dentro de la orden de mapeo <strong>{omCodigo || omMapeo}</strong>.
          Cada activo que crees quedará ligado a ella.
        </div>
      )}

      {msg && (
        <div role="status" className="aviso-ok aviso-cerrable" onClick={() => setMsg('')} title="Toca para cerrar este aviso">{msg}</div>
      )}
      <AvisoAmbito valor={ambito} total={meta?.total} />

      <div className="filters">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Buscar
            <input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="código, marca, modelo, serie, IP, referencia…" />
          </label>
        </div>
        <div><label>Tipo
            <select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Todos</option>
            {TYPES.map((t) => <option key={t} value={t}>{tEs(t)}</option>)}
          </select>
          </label>
        </div>
        <div><label>Estado
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos</option>
            {['OPERATIVO', 'MANTENIMIENTO', 'CON_INCIDENCIA', 'FUERA_SERVICIO', 'STOCK'].map((s) => (
              <option key={s} value={s}>{sEs(s)}</option>
            ))}
          </select>
          </label>
        </div>
        <button className="btn-mini" onClick={() => { setFq(''); setFType(''); setFStatus(''); }}>Limpiar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            {/* LA COLUMNA DE ACTUALIZACIÓN, Y POR QUÉ SE AGRUPÓ EL RESTO (b81).
                --------------------------------------------------------------
                El usuario pidió la fecha de actualización al costado. Añadirla
                a secas dejaba la tabla en DOCE columnas, y en la pantalla del
                púlpito (1366 px) eso obliga a desplazarse de lado para leer
                una fila.

                Así que en vez de añadir, se AGRUPA lo que va junto:
                  · el tipo baja debajo del código
                  · el tren y la etapa bajan debajo de la ubicación
                Quedan las mismas once, con la fecha dentro y sin desplazar. */}
            <tr><th>Equipo</th><th>Ficha</th><th>Marca / Modelo</th>{can('credential.read') && <th>IP</th>}{can('credential.read') && <th>Contraseña</th>}<th>Estado</th><th>Criticidad</th><th>Ubicación</th><th>Actualizado</th><th></th></tr>
          </thead>
          <tbody>
            {visibles.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(a.id)}>
                {/* `dato-fijo`: un código no se parte nunca. Ver styles.css. */}
                {/* `dato-fijo`: un código no se parte nunca. Ver styles.css. */}
                <td className="dato-fijo">
                  <div style={{ fontWeight: 600 }}>{a.assetCode}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{tEs(a.type)}</div>
                </td>
                <td style={{ minWidth: 74 }}>
                  {/* Avance de la ficha. Es lo que permite repartir el trabajo
                      de mapeo y saber cuánto falta de los 400 activos. */}
                  <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${a.fichaPct ?? 0}%`, height: '100%',
                      background: (a.fichaPct ?? 0) >= 80 ? '#16a34a'
                        : (a.fichaPct ?? 0) >= 40 ? '#f59e0b' : '#dc2626',
                    }} />
                  </div>
                  <div className="muted" style={{ fontSize: 10 }}>
                    {a.fichaPct ?? 0}%{a.isDraft ? ' · incompleta' : ''}
                  </div>
                </td>
                <td>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                {can('credential.read') && <td className="muted dato-fijo" style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.ip || '—'}</td>}
                {can('credential.read') && (
                  <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {/* La clave no viaja en el listado: se revela una a una y queda auditado. */}
                    {!a.hasPassword ? '—'
                      : rowPass[a.id]
                        ? <b>{rowPass[a.id]}</b>
                        : <button className="btn-mini" onClick={(e) => { e.stopPropagation(); revealRow(a); }}>••••• ver</button>}
                  </td>
                )}
                <td><span className={'badge ' + (a.effectiveStatus || a.status)}>{sEs(a.effectiveStatus || a.status)}</span></td>
                {/* LA LETRA A/B/C VA EN LA COLUMNA QUE YA EXISTE (bloque 78).
                    No se abre una columna nueva: la tabla tiene 11 y en la
                    pantalla del púlpito ya hay que desplazarse de lado. Y las
                    dos cosas contestan preguntas hermanas —cuánto importa esa
                    zona / cada cuánto se revisa ese equipo—, así que juntas se
                    leen mejor que separadas. */}
                <td>
                  <span className={'badge ' + a.criticality}>{cEs(a.criticality)}</span>
                  {a.criticidadAbc && a.criticidadAbc !== 'SIN_CLASIFICAR' && (
                    <span
                      className="crit-pastilla"
                      style={{
                        marginLeft: 4,
                        background: LETRA_FONDO[a.criticidadAbc],
                        color: LETRA_COLOR[a.criticidadAbc],
                      }}
                      title={`Criticidad ${a.criticidadAbc}: se revisa cada ${a.diasEntreRevisiones} días`}
                    >
                      {a.criticidadAbc}
                    </span>
                  )}
                  {a.criticidadAbc === 'SIN_CLASIFICAR' && (
                    /* Se marca, pero con un guión y no con la palabra: en una
                       lista de cuatrocientas filas, «sin letra» repetido es
                       ruido que tapa a las que SÍ la tienen.
                       El sitio para trabajarlos es Criticidad → pestaña «Sin
                       clasificar», donde salen juntos y se pueden declarar. */
                    <span
                      className="muted"
                      style={{ fontSize: 12, marginLeft: 4 }}
                      title="Sin criticidad A/B/C. Se declara en Criticidad A/B/C."
                    >—</span>
                  )}
                </td>
                <td>
                  <div>{a.location?.name || '—'}</div>
                  {/* El tren y la etapa BAJAN aquí: son el mismo dato —dónde
                      está— visto de más lejos. Antes ocupaban su propia
                      columna y dejaban la tabla en doce. */}
                  <div className="muted" style={{ fontSize: 11 }}>
                    {a.trenNombre || 'Sin tren'}
                    {a.etapaNombre ? ` · ${a.etapaNombre}` : ' · falta etapa'}
                  </div>
                </td>
                {/* CUÁNDO SE TOCÓ POR ÚLTIMA VEZ (bloque 81), que es lo que
                    pidió el usuario. Sirve para lo que no se ve de otra forma:
                    un equipo que lleva un año sin que nadie le cambie una
                    coma probablemente tiene la ficha desactualizada.

                    Va por `fechaTabla`, que da «26 ago · 00:16» en 24 horas.
                    Todas las fechas de la aplicación pasan por ahí —lo vigila
                    `verificar:fechas`— para que no haya tres formatos. */}
                <td className="muted dato-fijo" style={{ fontSize: 12 }}>
                  {a.updatedAt ? fechaTabla(a.updatedAt) : '—'}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {/* El informe se ofrece desde la tabla: antes solo existía
                      dentro de la ficha y nadie sabía que estaba. */}
                  <button className="btn-mini" title="Informe del equipo en PDF"
                    onClick={(e) => { e.stopPropagation(); descargarInforme(a); }}><Icono n="pdf" size={14} /> PDF</button>
                  {can('credential.read') && (
                    <button className="btn-mini" style={{ marginLeft: 4 }}
                      onClick={(e) => { e.stopPropagation(); openQuickEdit(a); }}>Editar</button>
                  )}
                </td>
              </tr>
            ))}
            {!visibles.length && (
              <tr>
                <td colSpan={13} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                  {hayFiltro
                    ? 'Ningún activo coincide con el filtro.'
                    : 'Todavía no hay activos registrados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Paginador — el filtrado y el corte los hace el servidor */}
        {meta.pages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '10px 12px', borderTop: '1px solid var(--line, #e5e7eb)', flexWrap: 'wrap',
          }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Mostrando {(meta.page - 1) * meta.pageSize + 1}–
              {Math.min(meta.page * meta.pageSize, meta.total)} de {meta.total}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn-mini" disabled={meta.page <= 1}
                onClick={() => setPage(1)}>« Primera</button>
              <button className="btn-mini" disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</button>
              <span style={{ fontSize: 12, padding: '0 6px' }}>{meta.page} / {meta.pages}</span>
              <button className="btn-mini" disabled={meta.page >= meta.pages}
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}>Siguiente ›</button>
              <button className="btn-mini" disabled={meta.page >= meta.pages}
                onClick={() => setPage(meta.pages)}>Última »</button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <Modal title={detail.assetCode} onClose={() => setDetail(null)}>
          {/* ARRIBA SÓLO LO QUE NO DESTRUYE NADA (bloque 80).
              -----------------------------------------------------------------
              «Dar de baja» y «Eliminar definitivamente» estaban AQUÍ, en la
              primera línea de la ficha, antes que la marca y el modelo. Lo
              primero que se veía al abrir una cámara era el botón rojo de
              borrarla.

              Con guantes y prisa, un botón destructivo en el sitio donde
              esperas «Código QR» es un accidente esperando a pasar. Bajan al
              FINAL, después de todo lo que hay que leer, en su propia zona
              marcada. La confirmación escrita a mano sigue puesta: son dos
              barreras, no una. */}
          <div className="acciones-ficha">
            <button className="btn-mini" onClick={() => openQr(detail)}><Icono n="qr" size={14} /> Código QR</button>
            <button className="btn-mini" onClick={() => descargarInforme(detail)}><Icono n="pdf" size={14} /> Informe (PDF)</button>
            {can('credential.read') && <button className="btn-mini" onClick={() => openEdit(detail)}><Icono n="editar" size={14} /> Editar activo</button>}
          </div>
          <Frow k="Tipo" v={tEs(detail.type)} />
          <Frow k="Marca / Modelo" v={[detail.brand, detail.model].filter(Boolean).join(' ')} />
          <Frow k="N° de serie" v={detail.serialNumber} />
          <div className="frow">
            <span className="k">Estado operativo</span>
            <span className="v"><span className={'badge ' + (detail.effectiveStatus || detail.status)}>{sEs(detail.effectiveStatus || detail.status)}</span></span>
          </div>
          {detail.effectiveStatus && detail.effectiveStatus !== detail.status && (
            <div className="muted" style={{ fontSize: 11, marginTop: -2, marginBottom: 4 }}>
              Estado calculado en vivo desde sus OM/incidencias abiertas. Estado base registrado: {sEs(detail.status)}.
            </div>
          )}
          {/* Retroalimentación: qué le ha pasado antes a este equipo.
              Va ARRIBA porque es lo que hay que leer antes de decidir algo. */}
          {/* Qué repuestos sirven para este equipo y si hay en almacén.
              Se pregunta CON EL EQUIPO DELANTE: el técnico está arriba y
              necesita saber si bajar o no. */}
          <RepuestosDelActivo assetId={detail.id} />

          <HistorialActivo assetId={detail.id} />

          {detail.completitud && detail.completitud.faltanClave?.length > 0 && (
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
              padding: '10px 12px', marginBottom: 12, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                Ficha incompleta — {detail.completitud.porcentaje}%
              </div>
              <div style={{ color: '#92400e' }}>Falta registrar:</div>
              <ul style={{ margin: '4px 0 0 18px', color: '#92400e' }}>
                {detail.completitud.faltanClave.map((f: any) => (
                  <li key={f.campo}>{f.etiqueta}</li>
                ))}
              </ul>
              {detail.completitud.faltanOtros?.length > 0 && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Además, sería útil: {detail.completitud.faltanOtros.map((f: any) => f.etiqueta).join(', ')}.
                </div>
              )}
            </div>
          )}

          {/* CRITICIDAD A/B/C DE MANTENIMIENTO (bloque 76).
              Va ANTES de la ficha de datos porque contesta la pregunta con la
              que se abre esta pantalla —«¿cada cuánto hay que subir a revisar
              esto?»— y porque el cálculo llevaba tres bloques hecho sin que
              hubiera forma de verlo. */}
          <CriticidadActivo assetId={detail.id} />

          <Frow k="Criticidad de la zona" v={
            detail.planta?.criticidadEfectiva && detail.planta.criticidadEfectiva !== detail.criticality
              ? `${cEs(detail.planta.criticidadEfectiva)} (elevada por la etapa)`
              : cEs(detail.criticality)
          } />
          <Frow k="Firmware" v={detail.firmware} />
          <Frow k="Tren" v={detail.planta?.tren} />
          <Frow k="Etapa del proceso" v={
            detail.planta?.etapa || (detail.planta?.etapaPendiente ? 'Falta asignar' : null)
          } />
          <Frow k="Ambiente" v={AMBIENTE_ES[detail.planta?.ambiente] || null} />
          <Frow k="Preventivo cada" v={
            detail.planta?.intervaloPreventivoDias ? `${detail.planta.intervaloPreventivoDias} días` : null
          } />
          <Frow k="Ubicación" v={detail.location?.name} />
          <Frow k="Gabinete" v={detail.cabinet ? `${detail.cabinet.code} — ${detail.cabinet.name}` : null} />
          <Frow k="Lugar de referencia" v={detail.referencePlace} />
          <Frow k="Garantía" v={detail.warrantyEnd ? fecha(detail.warrantyEnd) : null} />

          {can('asset.update') && (
            <div className="detail-sec">
              <h4><Icono n="refrescar" size={15} /> Actualizar estado</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select aria-label="Filtrar por tipo de equipo" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={{ flex: 1 }}>
                  {STATES.map((t) => <option key={t} value={t}>{sEs(t)}</option>)}
                </select>
                <button className="btn-mini" disabled={savingStatus || newStatus === detail.status} onClick={saveStatus}>
                  {savingStatus ? 'Guardando…' : 'Guardar estado'}
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Estado base. Con OM o incidencia abierta se muestra el real.</div>
            </div>
          )}

          {detail.workOrders && detail.workOrders.length > 0 && (
            <div className="detail-sec">
              <h4><Icono n="llaveInglesa" size={15} /> Historial de mantenimiento</h4>
              {detail.workOrders.map((w: any) => (
                <div key={w.code} className="frow">
                  <span className="v">{w.code} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({w.type})</span></span>
                  <span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : w.status === 'CANCELADA' ? 'BAJA' : 'MANTENIMIENTO')}>{w.status}</span>
                </div>
              ))}
            </div>
          )}

          <div className="detail-sec">
            <h4><Icono n="seguridad" size={15} /> Accesibilidad del equipo</h4>
            {/* ---- COMPONENTES (bloque 45) ----
              La fuente PoE, el calefactor, el conversor: viven AQUÍ, dentro
              de la ficha de su equipo, nunca sueltos en el listado. Cada uno
              es un activo con su historial: «se quemó la fuente» deja de
              registrarse como «falló la antena». */}
          {(detail.componentes?.length ?? 0) > 0 && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="section-title">Componentes de este equipo</div>
              {detail.componentes.map((c: any) => (
                <div key={c.id} className="frow" style={{ cursor: 'pointer' }}
                  onClick={() => openDetail(c.id)}>
                  <span className="k">{tEs(c.type)}</span>
                  <span className="v"><b>{c.assetCode}</b>{' '}
                    <span className={'badge ' + c.status}>{sEs(c.status)}</span>
                    {[c.brand, c.model].filter(Boolean).length > 0 &&
                      <span className="muted"> · {[c.brand, c.model].filter(Boolean).join(' ')}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {detail.parteDe && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Este equipo es un componente de{' '}
              <b style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => openDetail(detail.parteDe.id)}>{detail.parteDe.assetCode}</b>.
            </p>
          )}
          {/* ---- POR DÓNDE VIAJA LA IMAGEN (bloque 47) ----
              Sólo en las cámaras, y sólo dentro de su ficha. Es la pregunta
              que se hace el técnico delante del equipo: «¿y esto por dónde
              sale?». Tenerlo aquí evita el viaje a Topología con el celular
              en la mano y el manlift esperando. */}
          {detail.type === 'CAMERA' && <CadenaDeLaCamara id={detail.id} />}
          {detail.accessRequests && detail.accessRequests.length > 0 ? (
              <>
                {detail.accessRequests.map((ar: any) => (
                  <div key={ar.id} className="frow">
                    <span className="v">
                      {ar.code}
                      <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
                        {' · '}{MEANS_ES[ar.means] || ar.means}{ar.heightMeters != null ? ` · ${ar.heightMeters} m` : ''}
                      </span>
                    </span>
                    <span className={'badge ' + (ACC_BADGE[ar.status] || 'BAJA')}>{ACC_STATUS_ES[ar.status] || ar.status}</span>
                  </div>
                ))}
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                  El seguimiento y la aprobación se hacen en el módulo <b>Accesibilidad</b>.
                </div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                Si hace falta plataforma, grúa o andamio, márcalo aquí.
              </div>
            )}
            {can('access.request') && (
              <button className="btn-mini" style={{ marginTop: 8 }} onClick={() => setAccessFor(detail)}>
                <Icono n="seguridad" size={14} /> Marcar activo inaccesible (solicitar acceso especial)
              </button>
            )}
          </div>

          <div className="detail-sec">
            <h4><Icono n="camara" size={15} /> Fotografías del equipo</h4>
            {photos.length ? photos.map((ph) => (
              <div key={ph.id} className="frow">
                <span className="v">{PHOTO_KIND_ES[ph.kind] || ph.kind}{ph.caption ? ' — ' + ph.caption : ''}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-mini" onClick={() => viewPhoto(ph)}>Ver</button>
                  {can('asset.update') && <button className="btn-mini" onClick={() => delPhoto(ph)}>✕</button>}
                </span>
              </div>
            )) : <div className="muted" style={{ fontSize: 12 }}>Sin fotografías.</div>}
            {can('asset.update') && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select aria-label="Estado del equipo" value={photoKind} onChange={(e) => setPhotoKind(e.target.value)}>
                  {PHOTO_KINDS.map((k) => <option key={k} value={k}>{PHOTO_KIND_ES[k]}</option>)}
                </select>
                <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                <input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Descripción (opcional)" />
                <button className="btn-mini" disabled={uploadingPhoto} onClick={uploadPhoto}>{uploadingPhoto ? 'Subiendo…' : 'Subir foto'}</button>
              </div>
            )}
          </div>

          {can('credential.read') ? (
            <div className="detail-sec">
              <h4><Icono n="candado" size={15} /> Red y accesos</h4>
              {can('credential.manage') ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div className="muted" style={{ fontSize: 11 }}>IP principal</div>
                      <input value={ipEdit} onChange={(e) => setIpEdit(e.target.value)} placeholder="172.16.x.x" style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div className="muted" style={{ fontSize: 11 }}>Contraseña del equipo</div>
                      <input type="password" value={cred.secret} onChange={(e) => setCred({ ...cred, secret: e.target.value })} placeholder="clave cámara / NVR" style={{ width: '100%' }} />
                    </div>
                    <button className="btn-mini" disabled={savingIp} onClick={saveAccess}>{savingIp ? '…' : 'Guardar'}</button>
                  </div>
                  <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>IP y contraseña del equipo van juntas. Usuario opcional (por defecto “admin”). Se cifra (AES-256); revelar queda auditado.</div>
                </div>
              ) : <Frow k="IP principal" v={detail.ipAddress} />}
              {detail.camera && (<>
                <Frow k="IP" v={detail.camera.ipAddress} />
                <Frow k="MAC" v={detail.camera.macAddress} />
                <Frow k="NVR asociado" v={detail.camera.nvrId} />
              </>)}
              {detail.nvr && (<>
                <Frow k="Canales" v={detail.nvr.channels} />
                <Frow k="NIC primaria (industrial)" v={detail.nvr.nicPrimary} />
                <Frow k="NIC secundaria (visualización)" v={detail.nvr.nicSecondary} />
              </>)}
              {detail.switchDev && (<>
                <Frow k="IP de gestión" v={detail.switchDev.mgmtIp} />
                <Frow k="Fabricante" v={detail.switchDev.vendor} />
                <Frow k="Rol" v={detail.switchDev.switchRole} />
              </>)}
              {detail.wireless && (<>
                <Frow k="Modo" v={detail.wireless.mode} />
                <Frow k="Frecuencia" v={detail.wireless.frequency} />
                <Frow k="Origen → Destino" v={[detail.wireless.originPoint, detail.wireless.destPoint].filter(Boolean).join(' → ')} />
              </>)}

              <h4 style={{ marginTop: 14 }}>Credenciales</h4>
              {creds.length ? creds.map((c) => (
                <div key={c.id} className="frow">
                  <span className="v">{c.username} <span className="muted" style={{ fontWeight: 400 }}>({c.type || '—'})</span></span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {revealed[c.id]
                      ? <b style={{ fontSize: 13 }}>{revealed[c.id]}</b>
                      : (can('credential.read')
                          ? <button className="btn-mini" onClick={() => reveal(c.id)}>Revelar</button>
                          : <span className="muted" style={{ fontSize: 11 }}>oculto</span>)}
                    {can('credential.manage') && <button className="btn-mini" onClick={() => delCredential(c.id)}>✕</button>}
                  </span>
                </div>
              )) : <div className="muted" style={{ fontSize: 12 }}>Sin credenciales registradas</div>}

            </div>
          ) : (
            <div className="sign-note" style={{ marginTop: 14 }}>
              <Icono n="candado" size={14} /> Datos de red y accesos ocultos — requiere permiso de red (Jefe de Mantenimiento, Supervisor TI o Técnico de Red).
            </div>
          )}

          {/* LO IRREVERSIBLE, AL FINAL Y EN SU PROPIA ZONA (bloque 80).
              -----------------------------------------------------------------
              Estaba arriba del todo, en la misma fila que «Código QR». Aquí
              abajo hay que haber pasado por delante de toda la ficha —lo que
              es el equipo, dónde está, qué órdenes tiene— antes de llegar. Esa
              lectura ES la primera barrera; la frase escrita a mano es la
              segunda.

              Y va marcado en rojo con un título encima: separado del resto no
              se pulsa por inercia buscando otra cosa. */}
          {can('asset.delete') && (
            <div className="zona-peligro">
              <div className="zp-titulo">Retirar este equipo</div>
              <div className="zp-botones">
                <button className="btn-mini btn-danger" onClick={() => removeAsset(detail)}>
                  <Icono n="alerta" size={14} /> Dar de baja
                </button>
                {/* Sólo el Jefe de Mantenimiento. El servidor lo vuelve a
                    comprobar: esconder un botón no protege nada, sólo evita
                    la confusión. */}
                {can('purga.definitiva') && (
                  <button
                    className="btn-mini btn-peligro"
                    title="Elimina el registro de la base de datos. Para pruebas, duplicados y códigos mal tecleados. No se recupera."
                    onClick={() => setAPurgar(detail.id)}
                  >
                    <Icono n="papelera" size={14} /> Eliminar definitivamente
                  </button>
                )}
              </div>
              <div className="zp-nota">
                Dar de baja conserva el historial. Eliminar no.
              </div>
            </div>
          )}
        </Modal>
      )}

      {form && (
        <Modal
          title={form.id ? 'Editar activo (firmado)' : 'Registrar activo (firmado)'}
          onClose={() => setForm(null)}
          ancho
          acciones={
            <>
              <button type="button" className="btn-mini" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" form="form-activo" className="btn" disabled={saving || tries <= 0}>
                {saving ? 'Guardando…' : (form.id ? 'Firmar y guardar cambios' : 'Firmar y registrar')}
              </button>
            </>
          }
        >
          <form id="form-activo" onSubmit={submitNew}>
            <div className="sign-note">El activo contiene información sensible (IP, red, accesos). Confirma tu identidad con correo y contraseña; quedará auditado con tu firma quién {form.id ? 'editó' : 'registró'} el activo.</div>
            <label>Código / rótulo del activo
              <input value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} required />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Tipo<select value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value }); setSpec({}); }}>{TYPES.map((t) => <option key={t} value={t}>{tEs(t)}</option>)}</select></label></div>
              <div style={{ flex: 1 }}><label>Criticidad<select value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })}>{CRITS.map((t) => <option key={t} value={t}>{cEs(t)}</option>)}</select></label></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Marca<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label></div>
              <div style={{ flex: 1 }}><label>Modelo<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>N° de serie<input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></label></div>
              <div style={{ flex: 1 }}><label>Estado<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATES.map((t) => <option key={t} value={t}>{sEs(t)}</option>)}</select></label></div>
            </div>
            <label>IP principal (sensible)
              <input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="Ej: 172.16.10.21" />
            </label>
            <label>Contraseña del equipo (opcional)
              <input value={form.devicePass} onChange={(e) => setForm({ ...form, devicePass: e.target.value })} placeholder="clave de la cámara / NVR" />
            </label>
            <label>Ubicación (obligatorio)</label>
            <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
              De aquí salen el tren y la etapa.
            </div>
            <select
              aria-label="Elegir la ubicación del equipo"
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              required
            >
              <option value="">— selecciona ubicación —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>¿No está? Regístrala en Ubicaciones.</div>
            {/* DÓNDE ESTÁ MONTADO: gabinete O tablero eléctrico.
                En planta hay tableros que llevan dentro switches pequeños.
                Ese switch no está en ningún gabinete de comunicaciones, y
                obligar a inventar uno daría dos registros para una sola cosa
                física. Se elige uno de los dos, no los dos. */}
            <label>Gabinete{CABINET_REQUIRED.includes(form.type) && !form.tableroId ? ' (obligatorio para este tipo)' : ''}</label>
            {/* La etiqueta decía «Elegir tablero eléctrico» y esto es el
                GABINETE (bloque 77). Un lector de pantalla leía el nombre del
                campo de al lado: quien no ve la pantalla elegía el campo
                equivocado sin ninguna pista de que se estaba equivocando. */}
            <select aria-label="Elegir gabinete" value={form.cabinetId}
              onChange={(e) => setForm({ ...form, cabinetId: e.target.value, tableroId: e.target.value ? '' : form.tableroId })}
              disabled={!!form.tableroId}
              required={CABINET_REQUIRED.includes(form.type) && !form.tableroId}>
              <option value="">— sin gabinete —</option>
              {cabinets.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>

            <label>…o dentro de un tablero eléctrico
              <select value={form.tableroId}
              onChange={(e) => setForm({ ...form, tableroId: e.target.value, cabinetId: e.target.value ? '' : form.cabinetId })}
              disabled={!!form.cabinetId}>
              <option value="">— no está en un tablero —</option>
              {tableros.map((t: any) => <option key={t.id} value={t.id}>{t.codigo} — {t.nombre}</option>)}
            </select>
            </label>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Para los switches dentro de un tablero. Se elige gabinete <b>o</b> tablero, no los dos.
            </div>
            {CABINET_REQUIRED.includes(form.type) && !form.cabinetId && !form.tableroId && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Di dónde está montado, para poder encontrarlo.
              </div>
            )}
            <label>Lugar de referencia (texto libre)
              <input value={form.referencePlace} onChange={(e) => setForm({ ...form, referencePlace: e.target.value })} placeholder="Ej: Púlpito Tren 1, poste 3 lado norte" />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Código SAP (activo)<input value={form.sapId} onChange={(e) => setForm({ ...form, sapId: e.target.value })} /></label></div>
              <div style={{ flex: 1 }}><label>Área responsable<input value={form.responsibleArea} onChange={(e) => setForm({ ...form, responsibleArea: e.target.value })} /></label></div>
            </div>
            <AssetSpecFields
              tipo={form.type}
              spec={spec}
              onChange={setSpec}
              opciones={opciones}
            />

            <AssetPhotoPicker fotos={fotosNuevas} onChange={setFotosNuevas} />

            <h4 style={{ marginTop: 14, marginBottom: 4 }}><Icono n="firma" size={15} /> Firma electrónica</h4>
            <label>Correo
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>Contraseña
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
            {formErr && <div className="error">{formErr}</div>}
          </form>
        </Modal>
      )}

      {aPurgar && (
        <BorrarDefinitivo
          tipo="activo"
          id={aPurgar}
          onCerrar={() => setAPurgar(null)}
          onBorrado={(r) => {
            setAPurgar(null);
            setDetail(null);
            setMsg(`Borrado ${r.code} y ${plural(r.arrastrado, 'registro')} asociados.`);
            loadAssets();
          }}
        />
      )}

      {qrFor && (
        <Modal title={'Etiqueta QR · ' + qrFor.assetCode} onClose={() => { setQrFor(null); setQrUrl(''); }}>
          <div className="sign-note">
            Imprime y pega la etiqueta: al escanearla se abre la ficha.
          </div>
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            {qrUrl
              ? <img src={qrUrl} alt={'QR ' + qrFor.assetCode} style={{ width: 240, height: 240 }} />
              : <div className="muted">Generando QR…</div>}
            <div style={{ fontWeight: 700, color: 'var(--navy)', marginTop: 8 }}>{qrFor.assetCode}</div>
            <div className="muted" style={{ fontSize: 12 }}>{qrFor.location?.name || ''}</div>
          </div>
          {qrUrl && (
            <a className="btn" href={qrUrl} download={`qr-${qrFor.assetCode}.png`}
               style={{ display: 'block', textAlign: 'center', textDecoration: 'none', lineHeight: '2.2' }}>
              Descargar PNG
            </a>
          )}
        </Modal>
      )}

      {accessFor && (
        <Modal title={'Activo inaccesible · ' + accessFor.assetCode} onClose={() => setAccessFor(null)}>
          <AccessRequestForm
            assetId={accessFor.id}
            assetCode={accessFor.assetCode}
            onDone={async () => {
              setAccessFor(null);
              if (detail) await openDetail(detail.id); // refresca la ficha con la solicitud nueva
            }}
          />
        </Modal>
      )}

      {quick && (
        <Modal title={'Editar IP y contraseña · ' + quick.assetCode} onClose={() => setQuick(null)}>
          <div className="sign-note">Accesos del equipo. Sólo con permiso de red.</div>
          <label>IP principal
            <input value={qIp} onChange={(e) => setQIp(e.target.value)} placeholder="172.16.x.x" />
          </label>
          <label>Contraseña del equipo
            <input value={qPass} onChange={(e) => setQPass(e.target.value)} placeholder="clave cámara / NVR" />
          </label>
          <button className="btn" disabled={qSaving} onClick={saveQuick}>{qSaving ? 'Guardando…' : 'Guardar'}</button>
        </Modal>
      )}
    </div>
  );
}

/**
 * POR DÓNDE VIAJA LA IMAGEN DE ESTA CÁMARA — bloque 47.
 *
 * Se carga APARTE y no dentro de `openDetail`. El motivo es de planta: el
 * cálculo recorre el grafo de red entero, y la ficha del activo se abre
 * cientos de veces al día para mirar la marca o la IP. Colgarlo de la carga
 * principal haría más lenta la operación normal para servir un dato que casi
 * nadie mira en ese momento.
 *
 * Si falla, no se dice nada. La ficha del activo tiene que seguir sirviendo
 * aunque la red esté a medio cargar: un aviso rojo aquí haría creer que el
 * problema es la cámara.
 */
function CadenaDeLaCamara({ id }: { id: string }) {
  const [c, setC] = useState<any>(null);

  useEffect(() => {
    let vivo = true;
    setC(null);
    api.get(`/network/cadena/${id}`)
      .then((r) => { if (vivo) setC(r.data); })
      .catch(() => { /* silencio a propósito: ver el comentario de arriba */ });
    return () => { vivo = false; };
  }, [id]);

  if (!c) return null;

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="section-title">Por dónde va su imagen</div>
      {c.llegaAlGrabador && (
        <div className="cadena">
          {c.eslabones.map((e: any, i: number) => (
            <div key={e.id} className="cadena-paso">
              {i > 0 && <span className="cadena-flecha" aria-hidden="true">→</span>}
              <div className={`cadena-caja ${e.estado === 'OPERATIVO' ? '' : 'mal'}`}>
                <b>{e.codigo}</b>
                <span>{e.que}</span>
                {/* La fuente dentro de la antena. El «+» evita una frase que
                    se repetiría en cada caja y engorda la pantalla. */}
                {e.piezas.map((p: any) => (
                  <span key={p.id} className="cadena-pieza">+ {p.codigo}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{c.resumen}</p>
    </div>
  );
}
