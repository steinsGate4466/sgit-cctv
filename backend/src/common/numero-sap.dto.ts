import { Texto } from './validacion';

/**
 * BLOQUE 180 · APUNTAR UN N° DE SAP (aviso u orden).
 *
 * Una sola clave. El servicio lo deja como lo enseña SAP y rechaza el que no
 * lo sea (`common/aviso-sap.ts`); aquí sólo se pone el tope de la petición.
 * Vacío o `null` = quitarlo, y eso lo decide el servicio según el permiso.
 */
export class NumeroSapDto {
  @Texto(30) numero?: string | null;
}
