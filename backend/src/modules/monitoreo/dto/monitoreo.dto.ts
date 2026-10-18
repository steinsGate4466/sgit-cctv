/* =============================================================================
   DTO DE MONITOREO — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los `@Body() any` dejan de
   entrar sin validar. Cada clase declara TODAS las claves que mandan sus
   clientes —la pantalla `pages/Monitoreo.tsx` y el AGENTE de planta
   (`agente/agente-planta.js`), que no es un navegador y no se actualiza a la
   vez que el servidor—. Con `forbidNonWhitelisted`, una clave olvidada aquí
   es un agente que deja de reportar sin que nadie lo vea.
============================================================================= */
import { Lista, Texto } from '../../../common/validacion';

/**
 * POST /monitoreo/agente/reporte — lo manda el agente: `{ equipos: [...] }`.
 * Cada equipo es `{ assetId, responde, latencyMs }`. El contenido de la lista
 * (y su tope de 5000) lo valida el servicio, con sus mensajes de siempre.
 */
export class ReporteAgenteDto {
  @Lista() equipos?: unknown[];
}

/** POST /monitoreo/agentes — el mínimo de 3 letras lo exige el servicio. */
export class CrearAgenteDto {
  @Texto(200) nombre?: string;
}
