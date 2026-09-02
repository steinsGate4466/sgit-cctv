import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * EL MOTIVO DE UN CORTE DE ACCESO — bloque 85.
 *
 * Lo usan `DELETE /users/sesiones/:id` y `POST /users/:id/cortar-acceso`, las
 * dos acciones del bloque 82. El motivo QUEDA EN LA AUDITORÍA, y ahí está lo
 * que lo hace valioso: «se le cortó el acceso» sin motivo no explica nada tres
 * semanas después, cuando alguien reconstruye un incidente.
 *
 * -----------------------------------------------------------------------------
 * SIGUE SIENDO OPCIONAL, y es deliberado.
 *
 * Cortar el acceso es una acción URGENTE: se hace cuando alguien acaba de
 * decir por radio que le robaron el teléfono. Un campo obligatorio ahí sólo
 * consigue que se escriba «x» para poder pulsar, y entonces la auditoría tiene
 * un motivo que no significa nada — peor que vacío, porque un dato inventado
 * no se distingue de uno real.
 *
 * La pantalla SÍ lo pide, que es donde tiene sentido pedirlo.
 *
 * `MaxLength(500)`: con `@Body() dto: any` aquí entraba una cadena de cualquier
 * tamaño y se escribía tal cual en la auditoría. Quinientos caracteres son
 * cinco líneas: de sobra para explicar un corte, y un tope para que la tabla
 * de auditoría —que crece en CADA petición— no la infle un solo registro.
 */
export class MotivoDto {
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}
