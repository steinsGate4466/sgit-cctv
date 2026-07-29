import { BadRequestException } from '@nestjs/common';

/**
 * Traduce la ficha por tipo que llega del formulario a la escritura de Prisma.
 *
 * POR QUÉ ESTÁ APARTE
 * Es la única lógica del módulo que hay que mantener sincronizada con el
 * esquema cada vez que se agrega un tipo de activo. Teniéndola en un solo
 * archivo, agregar un tipo nuevo es tocar un sitio y no rastrear el servicio.
 */

/** Qué bloque de ficha corresponde a cada tipo de activo. */
export const FICHA_POR_TIPO: Record<string, string> = {
  CAMERA: 'camera',
  NVR: 'nvr',
  SWITCH: 'switchDev',
  WIRELESS: 'wireless',
  DECODER: 'decoder',
  PANTALLA: 'screen',
  PC: 'pc',
};

/** Nombre de la relación de Prisma para cada bloque. */
const RELACION: Record<string, string> = {
  camera: 'camera',
  nvr: 'nvr',
  switchDev: 'switchDev',
  wireless: 'wireless',
  decoder: 'decoder',
  screen: 'screen',
  pc: 'pc',
};

const TODOS = Object.keys(RELACION);

/**
 * Comprueba que la ficha enviada corresponda al tipo declarado.
 *
 * Sin esto se podría crear un switch con ficha de cámara: la fila quedaría en
 * asset_cameras apuntando a un activo de tipo SWITCH, y a partir de ahí el
 * mapa de canales y el diagrama mostrarían datos imposibles. Es más barato
 * rechazarlo aquí que descubrirlo tres meses después.
 */
export function validarFicha(tipo: string, dto: any): string | null {
  const esperada = FICHA_POR_TIPO[tipo] || null;
  const enviadas = TODOS.filter((k) => dto[k] !== undefined && dto[k] !== null);

  if (!enviadas.length) return null; // sin ficha: válido, se completa después

  if (enviadas.length > 1) {
    throw new BadRequestException(
      `Se envió más de una ficha (${enviadas.join(', ')}). Cada activo tiene una sola.`,
    );
  }
  if (!esperada) {
    throw new BadRequestException(
      `Un activo de tipo ${tipo} no tiene ficha propia todavía.`,
    );
  }
  if (enviadas[0] !== esperada) {
    throw new BadRequestException(
      `La ficha enviada (${enviadas[0]}) no corresponde a un activo de tipo ${tipo}. ` +
      `Se esperaba "${esperada}".`,
    );
  }
  return esperada;
}

/** Bloque `create` anidado de Prisma para el alta. */
export function fichaParaCrear(tipo: string, dto: any): Record<string, any> {
  const clave = validarFicha(tipo, dto);
  if (!clave) return {};
  const datos = { ...dto[clave] };
  // Sin datos reales no se crea la fila vacía: ensuciaría el cálculo de
  // completitud haciendo creer que la ficha ya existe.
  if (!Object.values(datos).some((v) => v !== undefined && v !== null && v !== '')) return {};
  return { [RELACION[clave]]: { create: datos } };
}

/**
 * Bloque `upsert` anidado de Prisma para la edición.
 * Se usa upsert y no update porque el activo puede haberse creado sin ficha
 * (guardado incompleto en campo) y al editarlo hay que poder crearla.
 */
export function fichaParaActualizar(tipo: string, dto: any): Record<string, any> {
  const clave = validarFicha(tipo, dto);
  if (!clave) return {};
  const datos = { ...dto[clave] };
  const hayAlgo = Object.values(datos).some((v) => v !== undefined);
  if (!hayAlgo) return {};
  return { [RELACION[clave]]: { upsert: { create: datos, update: datos } } };
}

/** Quita los bloques de ficha del cuerpo para que no lleguen al activo base. */
export function sinFichas<T extends Record<string, any>>(dto: T): Partial<T> {
  const copia: any = { ...dto };
  for (const k of TODOS) delete copia[k];
  return copia;
}
