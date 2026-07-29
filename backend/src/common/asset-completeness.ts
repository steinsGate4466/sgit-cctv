/**
 * FICHA INCOMPLETA — qué le falta a un activo.
 *
 * POR QUÉ EXISTE
 * El mapeo de 400 activos no se hace de una sentada. El técnico registra en
 * campo con lo mínimo y completa después. Si el formulario obliga a llenarlo
 * todo, lo que ocurre es que inventa datos para poder guardar —y un dato falso
 * es peor que un campo vacío—.
 *
 * Entonces se guarda incompleto A PROPÓSITO, y esta función dice qué falta.
 * Con eso el sistema puede:
 *   · mostrar el pendiente en el QR, para completarlo ahí mismo en planta;
 *   · listar las fichas incompletas ordenadas por criticidad;
 *   · medir el avance real del mapeo.
 *
 * Es una función pura: no consulta la base y por eso se puede probar sola.
 */

export interface CampoPendiente {
  campo: string;
  etiqueta: string;
  /** true = sin esto el activo no sirve para diagnosticar ni ubicar. */
  clave: boolean;
}

/** Campos que se piden a CUALQUIER activo. */
const COMUNES: { campo: string; etiqueta: string; clave: boolean }[] = [
  { campo: 'locationId', etiqueta: 'Ubicación', clave: true },
  { campo: 'photos', etiqueta: 'Foto de referencia', clave: true },
  { campo: 'brand', etiqueta: 'Marca', clave: false },
  { campo: 'model', etiqueta: 'Modelo', clave: false },
  { campo: 'serialNumber', etiqueta: 'Número de serie', clave: false },
];

/**
 * Campos por tipo. `clave: true` marca lo que de verdad hace falta para poder
 * diagnosticar o encontrar el equipo; el resto es deseable.
 */
const POR_TIPO: Record<string, { campo: string; etiqueta: string; clave: boolean }[]> = {
  CAMERA: [
    { campo: 'camera.nvrId', etiqueta: 'Grabador al que entra', clave: true },
    { campo: 'camera.nvrChannel', etiqueta: 'Canal del grabador', clave: true },
    { campo: 'camera.nvrName', etiqueta: 'Nombre en el grabador (el que ve el púlpito)', clave: true },
    { campo: 'camera.ipAddress', etiqueta: 'Dirección IP', clave: false },
    { campo: 'camera.cameraStyle', etiqueta: 'Tipo de cámara', clave: false },
    { campo: 'camera.resolution', etiqueta: 'Resolución', clave: false },
    { campo: 'camera.poeSourcePortId', etiqueta: 'Puerto PoE que la alimenta', clave: false },
    { campo: 'camera.wirelessUplinkId', etiqueta: 'Antena de la que cuelga', clave: false },
  ],
  NVR: [
    { campo: 'nvr.nicSecondary', etiqueta: 'IP de gestión (LAN2, red 10.x)', clave: true },
    { campo: 'nvr.channels', etiqueta: 'Cantidad de canales', clave: true },
    { campo: 'cabinetId', etiqueta: 'Gabinete donde está montado', clave: true },
    { campo: 'nvr.nicPrimary', etiqueta: 'IP de cámaras (LAN1, red 192.x)', clave: false },
    { campo: 'nvr.capacityTb', etiqueta: 'Capacidad de disco', clave: false },
  ],
  SWITCH: [
    { campo: 'switchDev.mgmtIp', etiqueta: 'IP de gestión', clave: true },
    { campo: 'switchDev.mgmtNetwork', etiqueta: 'Red de la IP de gestión', clave: true },
    { campo: 'switchDev.portCount', etiqueta: 'Cantidad de puertos', clave: true },
    { campo: 'cabinetId', etiqueta: 'Gabinete donde está montado', clave: true },
    { campo: 'switchDev.poePorts', etiqueta: 'Puertos PoE', clave: false },
    { campo: 'switchDev.poeBudgetW', etiqueta: 'Presupuesto PoE (watts)', clave: false },
  ],
  WIRELESS: [
    { campo: 'wireless.mode', etiqueta: 'Modo (AP principal o suscriptora)', clave: true },
    { campo: 'wireless.hasCredentials', etiqueta: 'Si tenemos las credenciales', clave: true },
    { campo: 'wireless.frequency', etiqueta: 'Frecuencia', clave: false },
    { campo: 'wireless.ssid', etiqueta: 'SSID', clave: false },
    { campo: 'wireless.signalDbm', etiqueta: 'Señal (dBm)', clave: false },
  ],
  DECODER: [
    { campo: 'decoder.outputCount', etiqueta: 'Cantidad de salidas de video', clave: true },
    { campo: 'decoder.sourceNvrId', etiqueta: 'Grabador del que consume', clave: true },
    { campo: 'decoder.mgmtIp', etiqueta: 'IP de gestión', clave: false },
  ],
  PANTALLA: [
    { campo: 'screen.label', etiqueta: 'Rótulo (Pantalla 1, 2, 3…)', clave: true },
    { campo: 'screen.sourceKind', etiqueta: 'Si la alimenta el decodificador o el PC', clave: true },
    { campo: 'screen.layout', etiqueta: 'Distribución del videowall', clave: false },
    { campo: 'screen.sizeInch', etiqueta: 'Tamaño en pulgadas', clave: false },
  ],
  PC: [
    { campo: 'pc.hostname', etiqueta: 'Nombre del equipo', clave: true },
    { campo: 'pc.ivmsVersion', etiqueta: 'Versión de iVMS-4200', clave: false },
    { campo: 'pc.nvrsConfigured', etiqueta: 'Grabadores configurados', clave: false },
  ],
};

/** Lee "camera.nvrChannel" dentro del objeto del activo. */
function valor(activo: any, ruta: string): any {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), activo);
}

/**
 * Un campo cuenta como lleno si tiene contenido real.
 * Ojo con dos casos que un `!valor` mal escrito daría por vacíos:
 *   · false es una respuesta VÁLIDA en "¿tenemos credenciales?";
 *   · 0 es válido en "puertos PoE" (un switch sin PoE).
 */
function lleno(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true; // números (incluido 0) y booleanos (incluido false)
}

export interface Completitud {
  total: number;
  llenos: number;
  porcentaje: number;
  /** Faltantes CLAVE: sin esto el activo no sirve para diagnosticar. */
  faltanClave: CampoPendiente[];
  /** Faltantes deseables. */
  faltanOtros: CampoPendiente[];
  /** true cuando falta algún campo clave. */
  incompleta: boolean;
}

/** Calcula qué le falta a un activo ya cargado con sus relaciones. */
export function evaluarFicha(activo: any): Completitud {
  const esperados = [...COMUNES, ...(POR_TIPO[activo?.type] || [])];

  const faltanClave: CampoPendiente[] = [];
  const faltanOtros: CampoPendiente[] = [];
  let llenos = 0;

  for (const e of esperados) {
    if (lleno(valor(activo, e.campo))) {
      llenos++;
    } else if (e.clave) {
      faltanClave.push(e);
    } else {
      faltanOtros.push(e);
    }
  }

  const total = esperados.length;
  return {
    total,
    llenos,
    porcentaje: total ? Math.round((llenos / total) * 100) : 100,
    faltanClave,
    faltanOtros,
    incompleta: faltanClave.length > 0,
  };
}

/** Resumen corto para el QR y para el listado. */
export function resumenPendiente(activo: any): string | null {
  const c = evaluarFicha(activo);
  if (!c.faltanClave.length) return null;
  return 'Faltan: ' + c.faltanClave.map((f) => f.etiqueta).join(', ');
}
