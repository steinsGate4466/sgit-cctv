import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * CIERRE DE SESIÓN — bloque 85.
 *
 * NO reutiliza `RefreshDto`, y no es por gusto: allí el token es OBLIGATORIO
 * —sin él no hay nada que renovar—, y aquí tiene que ser OPCIONAL.
 *
 * El motivo es de comportamiento, no de estilo: si al cerrar sesión el
 * servidor rechazara la petición por venir sin token, el usuario que ya perdió
 * su token —o cuyo `localStorage` se limpió— **no podría cerrar sesión nunca**,
 * y se quedaría con la sesión viva en el servidor. Justo lo contrario de lo
 * que se pide al pulsar «salir».
 *
 * Con el token, `auth.logout` revoca esa sesión concreta en el servidor
 * (bloque 15). Sin él, la sesión local se limpia igual y la del servidor
 * caduca sola.
 *
 * `MaxLength(2000)`: un JWT ronda los 300-800 caracteres. Con `any` aquí
 * entraba una cadena de cualquier tamaño que iba directa a una consulta.
 */
export class LogoutDto {
  @IsOptional() @IsString() @MaxLength(2000) refreshToken?: string;
}
