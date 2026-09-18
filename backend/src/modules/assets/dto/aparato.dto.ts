import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * LOS CAMPOS DE UN APARATO — bloque 106-B.
 *
 * Escritos mirando QUÉ LEE EL SERVICIO, no lo que parezca (bloque 85): un
 * campo que falte aquí hace que `forbidNonWhitelisted` rechace una petición
 * buena con un 400, y el formulario deja de guardar sin decir por qué.
 *
 * Los topes de longitud no son decoración. `serie` y `firmware` llegan de un
 * teclado en planta, con guantes: sin tope, un dedo apoyado en una tecla mete
 * diez mil caracteres en una columna que después se enseña en una tabla.
 */
export class InstalarAparatoDto {
  @IsOptional() @IsString() @MaxLength(80) marca?: string;
  @IsOptional() @IsString() @MaxLength(120) modelo?: string;
  @IsOptional() @IsString() @MaxLength(120) serie?: string;
  @IsOptional() @IsString() @MaxLength(80) firmware?: string;

  /** Cuándo se puso. Si no viene, es ahora. El servicio rechaza el futuro. */
  @IsOptional() @IsISO8601() desde?: string;

  @IsOptional() @IsString() @MaxLength(500) notas?: string;

  /**
   * Por qué sale el que estaba. **Obligatorio si el sitio ya tenía uno**, y eso
   * lo decide el SERVICIO, no este DTO: aquí no se sabe si hay algo puesto.
   * El mínimo de 4 caracteres evita el «ok» que no explica nada.
   */
  @IsOptional() @IsString() @MinLength(4) @MaxLength(300) motivoRetiroAnterior?: string;
}

export class RetirarAparatoDto {
  @IsString() @MinLength(4) @MaxLength(300) motivo!: string;
  @IsOptional() @IsISO8601() hasta?: string;
}

/**
 * Corregir una entrada ya escrita. Sólo el supervisor — lo comprueba el
 * servicio leyendo el cargo de la BASE, no del token (las dos llaves).
 *
 * SÓLO LOS CAMPOS DEL APARATO. Las FECHAS no se corrigen desde aquí a
 * propósito: mover un `desde` o un `hasta` reordena el historial entero y
 * puede dejar dos aparatos solapados en el mismo sitio. Si hace falta, será
 * su propio bloque con su propia comprobación de solapes.
 */
export class CorregirAparatoDto {
  @IsOptional() @IsString() @MaxLength(80) marca?: string;
  @IsOptional() @IsString() @MaxLength(120) modelo?: string;
  @IsOptional() @IsString() @MaxLength(120) serie?: string;
  @IsOptional() @IsString() @MaxLength(80) firmware?: string;
  @IsOptional() @IsString() @MaxLength(500) notas?: string;
}
