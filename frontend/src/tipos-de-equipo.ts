/* =============================================================================
   BLOQUE 95 · ACTIVO vs. ESTRUCTURA — el espejo de `common/tipos-de-equipo.ts`
   -----------------------------------------------------------------------------
   EL FALLO. En el desplegable de «Tipo» al dar de alta un activo salían
   GABINETE y TABLERO ELÉCTRICO. Los dos son ESTRUCTURA y los dos tienen YA su
   propio modelo y su propia pantalla:

       Gabinete          → pantalla «Gabinetes»
       Tablero eléctrico → pantalla «Electricidad»

   O sea: el mismo gabinete se podía crear por dos caminos, y entonces hay dos
   verdades. Es el error del bloque 74 con la fibra, con otra cara.

   -----------------------------------------------------------------------------
   PERO LA ESTRUCTURA SÍ LLEVA HOJA DE RUTA. No es una excepción inventada:
   el Excel que entregó el ingeniero trae una hoja **FORMATO GABINETE** con
   quince pasos —ordenamiento, rotulado, mapeo de dependencias, limpieza—.

   Por eso la lista no dice «prohibido», dice de qué FAMILIA es cada tipo:

       · Al CREAR UN ACTIVO   → sólo ACTIVO.
       · En HOJAS DE RUTA     → las dos, en grupos SEPARADOS.

   Una lista de prohibidos habría dejado al gabinete sin hoja de ruta, que es
   cambiar un problema por otro peor.

   -----------------------------------------------------------------------------
   ESTE ARCHIVO ES UN ESPEJO, Y ESO TIENE UN PORQUÉ. El backend no puede
   importar de `frontend/` ni al revés. Si la lista se escribiera dos veces con
   criterios distintos, un día el formulario ofrecería un tipo que el servidor
   rechaza — o al revés, que es peor: se guarda algo que la pantalla no sabe
   pintar. Lo fija una prueba que compara las dos listas.
============================================================================= */

export type FamiliaDeEquipo = 'ACTIVO' | 'ESTRUCTURA';

export interface TipoDeEquipo {
  valor: string;
  nombre: string;
  familia: FamiliaDeEquipo;
  /** Sólo estructura: dónde se da de alta de verdad. */
  seCreaEn?: string;
}

export const TIPOS_DE_EQUIPO: TipoDeEquipo[] = [
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
  { valor: 'CABINET', nombre: 'Gabinete', familia: 'ESTRUCTURA', seCreaEn: 'Gabinetes' },
  { valor: 'TABLERO_ELECTRICO', nombre: 'Tablero eléctrico', familia: 'ESTRUCTURA', seCreaEn: 'Electricidad' },
];

/** Lo que se puede elegir al dar de alta un ACTIVO. */
export const TIPOS_ACTIVO = TIPOS_DE_EQUIPO.filter((t) => t.familia === 'ACTIVO');

/** Estructura: no se crea desde Activos, pero sí tiene hoja de ruta. */
export const TIPOS_ESTRUCTURA = TIPOS_DE_EQUIPO.filter((t) => t.familia === 'ESTRUCTURA');

/**
 * Para PINTAR cualquier tipo, incluido el histórico.
 * Se conserva la estructura a propósito: hay registros viejos cargados como
 * CABINET y, si no estuviera aquí, la lista los enseñaría con el código en
 * crudo — y un código en crudo en una tabla parece un error del software.
 */
export const NOMBRE_DE_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS_DE_EQUIPO.map((t) => [t.valor, t.nombre]),
);

export const esEstructura = (tipo: string | null | undefined): boolean =>
  TIPOS_ESTRUCTURA.some((t) => t.valor === tipo);
