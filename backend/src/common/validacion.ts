/* =============================================================================
   DECORADORES DE VALIDACIÓN PARA LOS DTO — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85: 45 endpoints con `@Body() dto: any`, donde el
   `ValidationPipe` (whitelist + forbidNonWhitelisted) no valida NADA porque no
   hay clase.

   EL RIESGO al cerrarla es el del bloque 90 (Roles): un DTO que olvida un campo
   que el formulario SÍ manda rechaza la petición entera con un 400 y el
   formulario deja de guardar. Por eso estos decoradores son DELIBERADAMENTE
   tolerantes con lo que hoy llega de un <input>:

   · NO transforman. Un `@Type(() => Number)` convierte '' en 0, y para el
     servicio «vacío» y «cero» no son lo mismo (una altura 0 no es «sin dato»).
     Aceptan número, texto numérico, '' y null, y el servicio sigue haciendo su
     conversión como hasta ahora.
   · Son OPCIONALES. Lo obligatorio lo sigue exigiendo el servicio con su
     mensaje de planta; el DTO no cambia ningún mensaje que la gente ya conoce.
   · Ponen TOPE de longitud: un dedo apoyado en una tecla con guantes no mete
     diez mil caracteres en una columna.

   Lo que SÍ ganan sobre `any`: un campo que nadie declaró se rechaza (whitelist)
   y un tipo absurdo (un objeto donde va un texto) no llega al servicio.
============================================================================= */
import { applyDecorators } from '@nestjs/common';
import {
  Allow, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength,
  ValidateBy, ValidationOptions, buildMessage,
} from 'class-validator';

const vacio = (v: unknown) => v === '' || v === null || v === undefined;

/** Texto opcional con tope. */
export function Texto(max = 2000) {
  return applyDecorators(IsOptional(), IsString({ message: '$property tiene que ser texto.' }), MaxLength(max, { message: `$property: como mucho ${max} caracteres.` }));
}

/** Identificador (uuid u otro) opcional. */
export function Id() {
  return applyDecorators(IsOptional(), IsString({ message: '$property tiene que ser un identificador.' }), MaxLength(80));
}

function esNumero(v: unknown, entero: boolean): boolean {
  if (vacio(v)) return true;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && (!entero || Number.isInteger(n));
}

/** Número opcional: número, texto numérico, '' o null. NO transforma. */
export function Numero(opciones?: ValidationOptions) {
  return applyDecorators(IsOptional(), ValidateBy({
    name: 'numeroOVacio',
    validator: {
      validate: (v) => esNumero(v, false),
      defaultMessage: buildMessage(() => '$property tiene que ser un número.', opciones),
    },
  }, opciones));
}

/** Entero opcional: como `Numero`, pero sin decimales. */
export function Entero(opciones?: ValidationOptions) {
  return applyDecorators(IsOptional(), ValidateBy({
    name: 'enteroOVacio',
    validator: {
      validate: (v) => esNumero(v, true),
      defaultMessage: buildMessage(() => '$property tiene que ser un número entero.', opciones),
    },
  }, opciones));
}

/** Sí/no opcional: boolean, o 'true'/'false' de un formulario. */
export function SiNo() {
  return applyDecorators(IsOptional(), ValidateBy({
    name: 'siNo',
    validator: {
      validate: (v) => vacio(v) || typeof v === 'boolean' || v === 'true' || v === 'false',
      defaultMessage: buildMessage(() => '$property tiene que ser sí o no.'),
    },
  }));
}

/** Fecha opcional: texto de fecha que JavaScript entiende, o vacío. */
export function Fecha() {
  return applyDecorators(IsOptional(), ValidateBy({
    name: 'fechaOVacio',
    validator: {
      validate: (v) => vacio(v) || (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)))
        || v instanceof Date,
      defaultMessage: buildMessage(() => '$property tiene que ser una fecha.'),
    },
  }));
}

/** Uno de una lista cerrada (o vacío). */
export function UnoDe(valores: readonly string[]) {
  return applyDecorators(IsOptional(), IsIn([...valores, ''], { message: `$property debe ser uno de: ${valores.join(', ')}.` }));
}

/** Lista opcional. Su contenido lo valida el servicio. */
export function Lista() {
  return applyDecorators(IsOptional(), IsArray({ message: '$property tiene que ser una lista.' }));
}

/** Lista opcional de textos cortos. */
export function ListaDeTextos(max = 200) {
  return applyDecorators(IsOptional(), IsArray(), IsString({ each: true }), MaxLength(max, { each: true }));
}

/** Objeto opcional (p. ej. la ficha técnica por tipo). Su contenido lo valida el servicio. */
export function Objeto() {
  return applyDecorators(IsOptional(), IsObject({ message: '$property tiene que ser un objeto.' }));
}

/** Cualquier valor, declarado. Sólo para lo que el servicio ya valida a mano. */
export function Libre() {
  return applyDecorators(Allow());
}

