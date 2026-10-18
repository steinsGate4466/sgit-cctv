/* =============================================================================
   DTO DE AVISOS (Telegram) — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los `@Body() dto: any` dejan
   de entrar sin validar. Cada clase declara TODAS las claves que manda la
   pantalla (`pages/Avisos.tsx`) y todas las que lee el controlador. Con
   `forbidNonWhitelisted`, una clave olvidada aquí es un formulario que deja de
   guardar (bloque 90, Roles).

   `POST /avisos/probar` no lee el cuerpo y la pantalla manda `{}`: lleva una
   clase SIN campos. Acepta `{}` y el cuerpo ausente, y rechaza cualquier clave
   (con el ValidationPipe de Nest, `forbidUnknownValues` no salta con una clase
   vacía; está probado en `test/dto-bloque174-c.spec.ts`).
============================================================================= */
import { Texto } from '../../../common/validacion';

/** POST /avisos/configuracion/token — '' apaga los avisos. */
export class GuardarTokenTelegramDto {
  @Texto(300) token?: string;
}

/** POST /avisos/configuracion/app-url — la dirección pública del sistema. */
export class GuardarAppUrlDto {
  @Texto(500) url?: string;
}

/** POST /avisos/probar — sin campos: el cuerpo no se usa. */
export class ProbarCanalDto {}
