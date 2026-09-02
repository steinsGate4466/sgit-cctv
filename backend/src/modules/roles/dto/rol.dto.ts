import {
  ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';

/* =============================================================================
   LOS DTO DE ROLES Y ÁMBITO — bloque 85
   =============================================================================

   POR QUÉ EXISTEN, y es el hallazgo S-05 de la auditoría OWASP:

   > Con `@Body() dto: any` **el ValidationPipe no valida NADA**. Corre con
   > `whitelist` y `forbidNonWhitelisted`, pero sin clase DTO no hay metadatos
   > que aplicar: el objeto entra tal cual, con los campos que traiga.

   Se empieza por AQUÍ y no por el módulo con más casos, y el motivo es el de
   siempre en este proyecto: **el permiso no lo decide la dificultad, lo decide
   lo que la acción AFIRMA.** Crear un rol reparte poder en la planta entera, y
   fijar el ámbito decide qué trenes ve una persona. Un campo de más colado en
   uno de estos dos no se nota hasta que alguien ve lo que no debe.

   -----------------------------------------------------------------------------
   TODO OPCIONAL, A PROPÓSITO

   Los servicios ya comprueban lo que necesitan y devuelven su propio mensaje.
   Si el DTO exigiera aquí lo que el servicio ya exige, habría DOS validaciones
   para lo mismo y el día que una cambie darían mensajes distintos para el
   mismo error — que es la peor forma de fallar: el usuario no sabe cuál creer.

   Lo que aporta el DTO es la otra mitad, la que no tenía nadie: **rechazar lo
   que no debería venir** y acotar los tamaños.
============================================================================= */

/** Alta de un rol. `roles.service.crear` lee `nombre`, `descripcion` y `permisos`. */
export class CrearRolDto {
  /* MinLength(2): un rol llamado «a» es imposible de identificar en la
     pantalla de Usuarios, y borrarlo después exige saber cuál era. */
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) nombre?: string;

  @IsOptional() @IsString() @MaxLength(300) descripcion?: string;

  /* El TOPE de 200 no es burocracia: el catálogo tiene menos de cien permisos,
     así que un array de mil sólo puede venir de un error o de alguien
     probando. Sin tope, cada elemento es una consulta a la base. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
  permisos?: string[];
}

/**
 * Edición de un rol.
 *
 * NO LLEVA `nombre`, y eso es deliberado. El nombre de un rol es la clave por
 * la que lo reconoce la gente, y renombrarlo en caliente deja los informes
 * viejos hablando de un rol que ya no existe con ese nombre.
 *
 * Además, la regla del bloque 62-A: **una migración reparte permisos por lo
 * que el rol PUEDE HACER, nunca por cómo se llama** — precisamente porque el
 * nombre es un dato de usuario que se edita. Cuantos menos sitios lo cambien,
 * mejor. `roles.service.actualizar` ya sólo lee estos dos campos.
 */
export class ActualizarRolDto {
  @IsOptional() @IsString() @MaxLength(300) descripcion?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
  permisos?: string[];
}

/**
 * A qué trenes puede mirar una persona.
 *
 * `fijarAmbito` recibe `trenes` como `unknown` y lo pasa por
 * `normalizarAmbito`, que ya limpia y valida contra los trenes que existen.
 * Aquí sólo se acota la FORMA y el tamaño: con `any`, un `trenes` de cien mil
 * elementos llegaba entero a esa función.
 *
 * `ArrayMaxSize(20)`: en LAMINACIÓN hay TRES trenes. Veinte deja sitio de
 * sobra si mañana crece la planta y sigue cortando el abuso en seco.
 */
export class AmbitoDeTrenesDto {
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true })
  trenes?: string[];
}
