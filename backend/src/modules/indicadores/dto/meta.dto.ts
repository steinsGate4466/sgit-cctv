import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * LA META DE MANTENIMIENTO — bloque 94.
 *
 * =============================================================================
 *  EL DTO DECLARA EXACTAMENTE LO QUE ENVÍA EL FORMULARIO. NI UNO MÁS, NI UNO
 *  MENOS.
 * =============================================================================
 *  El `ValidationPipe` corre con `whitelist` y `forbidNonWhitelisted`, que es
 *  lo correcto. La consecuencia hay que tenerla presente al escribirlo:
 *
 *  > Un campo que el formulario manda y el DTO no declara **no se ignora:
 *  > rechaza la petición entera** con un 400 en inglés que habla de
 *  > «propiedades» y que el usuario no puede corregir.
 *
 *  Eso es lo que dejó sin guardar la pantalla de Roles en el bloque 90 — el
 *  formulario mandaba `nombre` en la edición y el DTO no lo declaraba— y es un
 *  fallo que no ve el typecheck, ni el lint, ni las pruebas: sólo se ve
 *  abriendo la pantalla y pulsando Guardar.
 *
 *  Aquí el formulario manda los tres campos de abajo y ninguno más. Hay un
 *  recorrido de Playwright que lo comprueba abriendo la pantalla de verdad.
 *
 * =============================================================================
 *  LOS LÍMITES DE AQUÍ SON DE FORMA; LA REGLA DE NEGOCIO ESTÁ EN UN SOLO SITIO
 * =============================================================================
 *  Que los dos porcentajes SUMEN 100 no se valida aquí: lo hace
 *  `motivoParaNoGuardarMeta`, que es lógica pura y probada aparte. Repetir esa
 *  regla en los dos sitios garantiza que el día que una cambie, den mensajes
 *  distintos para el mismo error — y entonces el usuario no sabe cuál creer.
 */
export class MetaDto {
  @IsInt() @Min(0) @Max(100) correctivoPct: number;

  @IsInt() @Min(0) @Max(100) preventivoPct: number;

  /** Meta de volumen. Opcional y separada del reparto: es otra pregunta. */
  @IsOptional() @IsInt() @Min(0) @Max(10000) omPorMes?: number | null;
}
