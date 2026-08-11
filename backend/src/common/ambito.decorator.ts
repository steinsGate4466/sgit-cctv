import { SetMetadata } from '@nestjs/common';

/**
 * ÁMBITO EN RUTAS POR IDENTIFICADOR (bloque 12.3) — OWASP A01
 * =============================================================================
 *
 *  EL AGUJERO QUE ESTO CIERRA
 *  --------------------------------------------------------------------------
 *  El filtro de tren se aplicaba en los LISTADOS, pero no cuando se pide algo
 *  por su identificador. Un usuario del Tren 2 escribía en la barra de
 *  direcciones:
 *
 *      /api/v1/assets/<id-de-un-activo-del-Tren-1>
 *
 *  ...y lo obtenía entero. Es **Broken Access Control**, el riesgo número 1
 *  de OWASP, y no hace falta ninguna herramienta para explotarlo: basta
 *  copiar un identificador de un enlace.
 *
 *  POR QUÉ UN DECORADOR Y NO UN GUARD QUE ADIVINE
 *  --------------------------------------------------------------------------
 *  Un guard genérico tendría que deducir a qué modelo pertenece cada ruta a
 *  partir de la URL. Eso funciona hasta la primera ruta que no siga el
 *  patrón, y entonces falla **abriendo**: deja pasar sin comprobar nada y
 *  nadie se entera. Un fallo de seguridad silencioso es el peor tipo.
 *
 *  Con el decorador es explícito: la ruta declara qué está tocando. Y un
 *  verificador (`verificar-ambito.js`) comprueba que ninguna ruta `:id` de
 *  los controladores de planta se quede sin declararlo.
 *
 *  POR QUÉ DEVUELVE 404 Y NO 403
 *  --------------------------------------------------------------------------
 *  Un 403 confirma que el registro EXISTE, sólo que no es tuyo. Con eso se
 *  puede recorrer identificadores y dibujar el inventario del vecino sin
 *  llegar a leer ni un campo. El 404 no dice nada: para ese usuario, ese
 *  activo sencillamente no está.
 */

export const CLAVE_AMBITO = 'ambito_de';

/**
 * Modelos que tienen ámbito de planta y cómo se llega desde ellos al tren.
 *
 *   directo   — el propio registro tiene `locationId`.
 *   porActivo — cuelga de un activo; el tren es el del activo.
 *   porTren   — el registro guarda el código de tren a pelo.
 */
export type RecursoConAmbito =
  | 'asset'
  | 'cabinet'
  | 'location'
  | 'workOrder'
  | 'incident'
  | 'accessRequest'
  | 'inspeccionGrua'
  | 'instalacion'
  | 'ventanaParada'
  | 'assetCable';

/**
 * Declara que esta ruta trabaja sobre un registro con ámbito de planta.
 *
 * @param recurso  qué se está tocando
 * @param param    nombre del parámetro de ruta (por defecto `id`)
 */
export const AmbitoDe = (recurso: RecursoConAmbito, param = 'id') =>
  SetMetadata(CLAVE_AMBITO, { recurso, param });

/**
 * Marca una ruta `:id` como SIN ámbito de planta, a propósito.
 *
 * Existe para que el verificador no la marque como olvidada. Se usa en lo que
 * de verdad no pertenece a un tren: roles, usuarios, catálogos, herramientas
 * de almacén, equipos conocidos. Poner esto es una DECISIÓN, y queda escrita.
 */
export const SinAmbito = () => SetMetadata(CLAVE_AMBITO, { recurso: null, param: null });
