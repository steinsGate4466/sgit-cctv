/* =============================================================================
   BLOQUE 95 · ACTIVO vs. ESTRUCTURA — una sola lista para todo el sistema
   -----------------------------------------------------------------------------
   EL FALLO QUE CIERRA. En el desplegable de «tipo» al dar de alta un activo
   salían GABINETE y TABLERO ELÉCTRICO. Los dos son ESTRUCTURA, y los dos tienen
   YA su propio modelo:

       Cabinet            (schema.prisma)  → pantalla «Gabinetes»
       TableroElectrico   (schema.prisma)  → pantalla «Electricidad»

   Es decir: se podía crear el MISMO gabinete por dos caminos distintos, y
   entonces hay dos verdades. Es exactamente el error del bloque 74 con la
   fibra, con otra cara.

   -----------------------------------------------------------------------------
   LA REGLA, que es la 1 del estándar (docs/ESTANDAR_ACTIVOS.md)

       UN ACTIVO se mantiene, se avería y se reemplaza por otro igual: tiene
       marca, modelo y serie, se le hace rutina y se pide como repuesto con
       código.

       LA ESTRUCTURA es dónde vive el activo. No se avería: se ordena, se
       rotula y se limpia. Un gabinete no «deja de grabar»: lo que deja de
       grabar es el NVR que hay dentro.

   -----------------------------------------------------------------------------
   PERO LA ESTRUCTURA SÍ LLEVA HOJA DE RUTA, y esto no es una excepción mía:
   está en el Excel que entregó el ingeniero, que trae una hoja «FORMATO
   GABINETE» con quince pasos (ordenamiento, rotulado, mapeo de dependencias,
   limpieza). O sea:

       · Al CREAR UN ACTIVO   → sólo familia ACTIVO.
       · En HOJAS DE RUTA     → las dos familias, en grupos SEPARADOS.

   Por eso este archivo no dice «prohibido», dice A QUÉ FAMILIA pertenece cada
   tipo. Una lista de prohibidos habría dejado sin hoja de ruta al gabinete.

   -----------------------------------------------------------------------------
   LOS VALORES DEL ENUM NO SE BORRAN. Un enum de PostgreSQL sólo admite AÑADIR
   (regla del proyecto desde el principio). Si hay un solo activo cargado como
   CABINET, quitarlo del enum rompe la tabla. Se retira de donde se CREA y el
   valor sigue existiendo para que los registros viejos se puedan seguir
   pintando. Lo vigila `scripts/verificar-estructura-no-es-activo.js`.
============================================================================= */

export type FamiliaDeEquipo = 'ACTIVO' | 'ESTRUCTURA';

export interface TipoDeEquipo {
  /** El valor que viaja en la base y en la API. */
  valor: string;
  /** Cómo se llama en pantalla, en castellano de planta. */
  nombre: string;
  familia: FamiliaDeEquipo;
  /** Sólo para la estructura: dónde se da de alta de verdad. */
  seCreaEn?: string;
}

export const TIPOS_DE_EQUIPO: TipoDeEquipo[] = [
  // ── ACTIVOS ────────────────────────────────────────────────────────────────
  { valor: 'CAMERA', nombre: 'Cámara', familia: 'ACTIVO' },
  { valor: 'WIRELESS', nombre: 'Antena / radioenlace', familia: 'ACTIVO' },
  { valor: 'SWITCH', nombre: 'Switch PoE', familia: 'ACTIVO' },
  { valor: 'NVR', nombre: 'Grabador (NVR)', familia: 'ACTIVO' },
  { valor: 'PC', nombre: 'PC / iVMS-4200', familia: 'ACTIVO' },
  { valor: 'PANTALLA', nombre: 'Pantalla de púlpito', familia: 'ACTIVO' },
  { valor: 'DECODER', nombre: 'Decodificador', familia: 'ACTIVO' },
  { valor: 'ROUTER', nombre: 'Router', familia: 'ACTIVO' },
  { valor: 'FIREWALL', nombre: 'Firewall', familia: 'ACTIVO' },
  { valor: 'SERVER', nombre: 'Servidor', familia: 'ACTIVO' },
  { valor: 'UPS', nombre: 'UPS', familia: 'ACTIVO' },
  { valor: 'PSU', nombre: 'Fuente / inyector PoE', familia: 'ACTIVO' },
  { valor: 'PHONE', nombre: 'Teléfono IP', familia: 'ACTIVO' },
  { valor: 'OTHER', nombre: 'Otro', familia: 'ACTIVO' },

  // ── ESTRUCTURA ─────────────────────────────────────────────────────────────
  {
    valor: 'CABINET', nombre: 'Gabinete', familia: 'ESTRUCTURA',
    seCreaEn: 'Gabinetes',
  },
  {
    valor: 'TABLERO_ELECTRICO', nombre: 'Tablero eléctrico', familia: 'ESTRUCTURA',
    seCreaEn: 'Electricidad',
  },
];

/** Los tipos que SÍ se pueden elegir al dar de alta un activo. */
export const TIPOS_ACTIVO = TIPOS_DE_EQUIPO.filter((t) => t.familia === 'ACTIVO');

/** Estructura: no se crea desde Activos, pero sí tiene hoja de ruta. */
export const TIPOS_ESTRUCTURA = TIPOS_DE_EQUIPO.filter((t) => t.familia === 'ESTRUCTURA');

/** Un mapa para pintar el nombre de CUALQUIER tipo, incluido el histórico. */
export const NOMBRE_DE_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS_DE_EQUIPO.map((t) => [t.valor, t.nombre]),
);

export const esEstructura = (tipo: string | null | undefined): boolean =>
  TIPOS_ESTRUCTURA.some((t) => t.valor === tipo);

/**
 * Motivo por el que NO se puede dar de alta un activo con este tipo, o `null`
 * si se puede. Se devuelve el motivo y no un booleano porque el usuario tiene
 * que saber A DÓNDE ir: un «no se puede» a secas parece una función rota.
 */
export function motivoParaNoCrearComoActivo(tipo: string): string | null {
  const t = TIPOS_ESTRUCTURA.find((x) => x.valor === tipo);
  if (!t) return null;
  return `«${t.nombre}» es estructura, no un activo: es dónde vive el equipo, no un equipo. `
    + `Se da de alta en la pantalla «${t.seCreaEn}», que es donde vive de verdad. `
    + `Crearlo también aquí dejaría el mismo ${t.nombre.toLowerCase()} escrito en dos sitios.`;
}
