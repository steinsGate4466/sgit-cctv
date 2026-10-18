import { Numero, SiNo, Texto } from '../../../common/validacion';

/* =============================================================================
   CRITICIDAD A/B/C — lo que se declara (bloque 174)
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en `criticidad.controller.ts`: eran tres
   `@Body() dto: any`. Cada clase declara TODAS las claves que mandan
   `Criticidad.tsx`, `CriticidadActivo.tsx` y `Zonas.tsx`, y todas las que lee
   `criticidad.service.ts`. Un campo olvidado aquí rechazaría con un 400 una
   petición buena y el formulario dejaría de guardar (bloque 90).

   No transforman y son opcionales A PROPÓSITO. `declarar()` distingue «no vino
   en la petición» de «vino como null» con `'campo' in dto`: un campo sin
   enviar NO aparece en la instancia (target ES2021, sin inicializadores), así
   que esa distinción se conserva. Hay una prueba que lo fija.
============================================================================= */

/**
 * PUT /criticidad/parametros — los cinco números de la planta.
 * `Numero` y no `Entero`: el «tiene que ser un número entero mayor que cero»
 * lo sigue diciendo el servicio con su mensaje de siempre.
 */
export class ParametrosCriticidadDto {
  @Numero() corteA?: number;
  @Numero() corteB?: number;
  @Numero() diasA?: number;
  @Numero() diasB?: number;
  @Numero() diasC?: number;
}

/** POST /criticidad/:id — impacto y riesgo de UN equipo (uno por petición). */
export class DeclararCriticidadDto {
  /** 1 a 4, o null para volver a lo de la zona. El rango lo valida el servicio. */
  @Numero() impactoOperacional?: number | null;
  /** Sí, no, o null = «vale lo de la zona». */
  @SiNo() riesgoPersonas?: boolean | null;
}

/** PUT /criticidad/zona/:id — riesgo para personas de una zona. */
export class RiesgoDeZonaDto {
  @SiNo() riesgoPersonas?: boolean | null;
  /** Obligatorio si el riesgo es sí; lo exige el servicio. */
  @Texto(2000) riesgoPersonasMotivo?: string;
}
