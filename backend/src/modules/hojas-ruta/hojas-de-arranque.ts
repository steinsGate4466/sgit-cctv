/* =============================================================================
   LAS CINCO HOJAS DE RUTA DEL INGENIERO — bloque 75
   =============================================================================

   DE DÓNDE SALEN: del Excel «HOJA RUTA MANTENIMIENTO PREVENTIVO CAMARAS.xlsx»
   que entregó el usuario. **No hay ni un paso inventado.** Cada línea de aquí
   está copiada de su hoja, en su orden y con su texto.

   Es la regla del proyecto: *nunca inventar datos de planta*. Si mañana el
   ingeniero cambia un paso, lo cambia desde la pantalla — esto es sólo lo que
   había el primer día.

   -----------------------------------------------------------------------------
   EL PATRÓN QUE COMPARTEN LAS CINCO, Y QUE NO ES CASUALIDAD

   Todas empiezan por SEGURIDAD y terminan por DOCUMENTACIÓN:

       10  USO DE EPP OBLIGATORIO
       20  BLOQUEO Y ETIQUETADO DE ENERGÍA (LOTO)
       30  VERIFICACIÓN DE AUSENCIA DE TENSIÓN
       ...el trabajo...
       ..  DOCUMENTACIÓN

   Eso permite que al crear una hoja NUEVA esos pasos ya vengan puestos: el
   ingeniero sólo escribe los del medio, que es lo único que cambia entre una
   cámara y un switch.

   -----------------------------------------------------------------------------
   EL LÍMITE DE 40 CARACTERES

   Su Excel lleva una columna que cuenta los caracteres de cada descripción.
   No es decoración: **SAP corta el campo en 40**, y si uno se pasa la carga
   se rechaza ENTERA — no la línea, la carga. Hay una prueba que recorre estas
   cinco hojas y falla si alguna descripción se pasa.
============================================================================= */

/** Un paso, como viene del Excel. `sub` nulo = es la operación principal. */
export interface PasoDeArranque {
  op: number;
  sub: number | null;
  clave: 'PM01' | 'PM04';
  texto: string;
}

export interface HojaDeArranque {
  tipoEquipo: string;
  descripcion: string;
  ubicacionSap: string;
  grupoPlanif: string;
  frecuencia: string;
  frecuenciaDias: number;
  puestoTrabajo: string;
  centro: string;
  trabajoTotalH: number;
  numPersonas: number;
  duracionH: number;
  pasos: PasoDeArranque[];
}

/** El límite de SAP. Se exporta para que lo use la validación y la pantalla. */
export const MAX_CARACTERES_DESCRIPCION = 40;

/* Los cuatro pasos de seguridad con los que arrancan todas. Se escriben UNA
   vez: repetirlos en cada hoja garantizaría que un día uno diga algo distinto
   de los otros cuatro. */
const SEGURIDAD = (conManlift: boolean): PasoDeArranque[] => [
  { op: 10, sub: 10, clave: 'PM04', texto: 'USO DE EPP OBLIGATORIO' },
  { op: 10, sub: 20, clave: 'PM04', texto: 'BLOQUEO Y ETIQUETADO DE ENERGÍA (LOTO)' },
  { op: 10, sub: 30, clave: 'PM04', texto: 'VERIFICACIÓN DE AUSENCIA DE TENSIÓN' },
  ...(conManlift
    ? [{ op: 10, sub: 40, clave: 'PM04' as const, texto: 'USO DE MANLIF' }]
    : []),
];

/** Cabecera común: en las cinco hojas del ingeniero es idéntica. */
const CABECERA = {
  ubicacionSap: '1262AP01',
  grupoPlanif: 'M06',
  frecuencia: '3 MESES',
  frecuenciaDias: 90,
  puestoTrabajo: 'LAM1ELECT1',
  centro: '2100',
  trabajoTotalH: 8,
  numPersonas: 2,
  duracionH: 4,
};

export const HOJAS_DE_ARRANQUE: HojaDeArranque[] = [
  /* ------------------------------------------------------------- CÁMARA */
  {
    ...CABECERA,
    tipoEquipo: 'CAMERA',
    descripcion: 'MANTENIMIENTO PREVENTIVO DE CAMARA',
    pasos: [
      { op: 10, sub: null, clave: 'PM01', texto: 'LIMPIEZA DE CAMARAS' },
      ...SEGURIDAD(true),
      { op: 10, sub: 50, clave: 'PM04', texto: 'LIMPIEZA DE CARCASA' },
      { op: 10, sub: 60, clave: 'PM04', texto: 'LIMPIEZA DE LENTE' },
      { op: 10, sub: 70, clave: 'PM04', texto: 'VERIFICACIÓN DE SOPORTE' },
      { op: 10, sub: 80, clave: 'PM04', texto: 'VERIFICACIÓN DE CABLEADO UTP' },
      { op: 10, sub: 90, clave: 'PM04', texto: 'VERIFICACIÓN DE ALIMENTACION POE' },
      { op: 10, sub: 100, clave: 'PM04', texto: 'VERIFICACIÓN DE ENFOQUE DE IMAGEN' },
      { op: 10, sub: 120, clave: 'PM04', texto: 'VERIFICACIÓN DE CONECTIVIDAD' },
      { op: 10, sub: 130, clave: 'PM04', texto: 'VERIFICACIÓN DE USUARIOS' },
      { op: 10, sub: 140, clave: 'PM04', texto: 'DOCUMENTACIÓN DE MANTENIMIENTO' },
    ],
  },

  /* ------------------------------------------------------------- ANTENA */
  {
    ...CABECERA,
    tipoEquipo: 'WIRELESS',
    descripcion: 'MANTENIMIENTO DE ANTENAS',
    pasos: [
      { op: 10, sub: null, clave: 'PM01', texto: 'MANTENIMIENTO DE ANTENAS' },
      ...SEGURIDAD(false),
      { op: 10, sub: 40, clave: 'PM04', texto: 'VERIFICACIÓN DE ESTADO FISICO ANTENA' },
      { op: 10, sub: 50, clave: 'PM04', texto: 'VERIFICACIÓN DE SOPORTES AJUSTABLES' },
      { op: 10, sub: 60, clave: 'PM04', texto: 'LIMPIEZA GENERAL DE ANTENA' },
      { op: 10, sub: 70, clave: 'PM04', texto: 'VERIFICACIÓN DE CABLEADO UTP' },
      { op: 10, sub: 80, clave: 'PM04', texto: 'VERIFICACIÓN DE FUENTE POE, LAN 24V' },
      { op: 10, sub: 90, clave: 'PM04', texto: 'VERIFICACIÓN DE RADIOFRECUENCIA' },
      { op: 10, sub: 100, clave: 'PM04', texto: 'VERIFICACIÓN DE SEGURIDAD Y USUARIOS' },
      { op: 10, sub: 120, clave: 'PM04', texto: 'PRUEBAS DE COMUNICACIÓN(PING,THROUGHPUT)' },
      { op: 10, sub: 130, clave: 'PM04', texto: 'VERIFICACIÓN DE CONEXION AL SWITCH' },
      { op: 10, sub: 140, clave: 'PM04', texto: 'DOCUMENTACIÓN DE EVIDENCIAS' },
    ],
  },

  /* -------------------------------------------------------- SWITCH PoE */
  {
    ...CABECERA,
    tipoEquipo: 'SWITCH',
    descripcion: 'MANTENIMIENTO SWITCH POE(HIKVISION)',
    pasos: [
      { op: 10, sub: null, clave: 'PM01', texto: 'MANTENIMIENTO SWITCH POE(HIKVISION)' },
      ...SEGURIDAD(false),
      { op: 10, sub: 40, clave: 'PM04', texto: 'VERIFICACIÓN DE CARCASA' },
      { op: 10, sub: 50, clave: 'PM04', texto: 'LIMPIEZA EXTERNA E INTERNA(PUERTOS)' },
      { op: 10, sub: 60, clave: 'PM04', texto: 'VERIFICACIÓN DE FUENTE 48V' },
      { op: 10, sub: 70, clave: 'PM04', texto: 'VERIFICACIÓN DE ALIMENTACIÓN 220V' },
      { op: 10, sub: 80, clave: 'PM04', texto: 'VERIFICACIÓN DE PUERTOS(POE, RED)' },
      { op: 10, sub: 90, clave: 'PM04', texto: 'VERIFICACIÓN DE COMUNICACIÓN(RED,CAMARA)' },
      { op: 10, sub: 100, clave: 'PM04', texto: 'VERIFICACIÓN DE TEMPERATURA Y ENTORNO' },
      { op: 10, sub: 120, clave: 'PM04', texto: 'VALIDACIÓN DE DISPOSITIVOS CONECTADOS' },
      { op: 10, sub: 130, clave: 'PM04', texto: 'REALIZACIÓN DE ETIQUETADO DE RED' },
      { op: 10, sub: 140, clave: 'PM04', texto: 'REALIZACIÓN DE DOCUMENTACIÓN' },
    ],
  },

  /* ----------------------------------------------------------- GABINETE */
  {
    ...CABECERA,
    tipoEquipo: 'CABINET',
    descripcion: 'MANTENIMIENTO PREVENTIVO',
    pasos: [
      { op: 10, sub: null, clave: 'PM01', texto: 'ORDENAMIENTO Y ROTULAMIENTO GABINETE' },
      { op: 10, sub: 10, clave: 'PM04', texto: 'USO DE EPP OBLIGATORIO' },
      { op: 10, sub: 20, clave: 'PM04', texto: 'VERIFICACION DE ESTADO DE GABINETE' },
      { op: 10, sub: 30, clave: 'PM04', texto: 'IDENTIFICACION DE RED CCTV POR PUERTO' },
      { op: 10, sub: 40, clave: 'PM04', texto: 'ORDENAMIENTO DE CABLEADO' },
      { op: 10, sub: 50, clave: 'PM04', texto: 'VERIFICACION DE ESTADO DE CABLEADO' },
      { op: 10, sub: 60, clave: 'PM04', texto: 'CORRECION DE CABLEADO' },
      { op: 10, sub: 70, clave: 'PM04', texto: 'ROTULAMIENTO DE CABLEADO POR PUERTO' },
      { op: 10, sub: 80, clave: 'PM04', texto: 'USO DE BUENAS PRACTICAS(ROTULAMIENTO)' },
      { op: 10, sub: 90, clave: 'PM04', texto: 'LIMPIEZA DE GABINETE' },
      { op: 10, sub: 100, clave: 'PM04', texto: 'LIMPIEZA DE SWITCH Y NVR' },
      { op: 10, sub: 110, clave: 'PM04', texto: 'MAPEADO DE DEPENDENCIAS DE RED' },
      { op: 10, sub: 120, clave: 'PM04', texto: 'MAPEADO DE DEPENDENCIAS ELECTRICAS' },
      { op: 10, sub: 130, clave: 'PM04', texto: 'RECONEXION DE CABLEADO POR PUERTO' },
      { op: 10, sub: 140, clave: 'PM04', texto: 'VERIFICACION DE FUNCIONALIDAD CCTV' },
      { op: 10, sub: 150, clave: 'PM04', texto: 'DOCUMENTACION DE LA ACTIVIDAD' },
    ],
  },

  /* ----------------------------------------------------------------- PC */
  {
    ...CABECERA,
    tipoEquipo: 'PC',
    descripcion: 'MANTENIMIENTO PREVENTIVO PC',
    pasos: [
      { op: 10, sub: null, clave: 'PM01', texto: 'LIMPIEZA Y MANTENIMIENTO DE PC' },
      { op: 10, sub: 10, clave: 'PM04', texto: 'USO DE EPP OBLIGATORIO' },
      { op: 10, sub: 20, clave: 'PM04', texto: 'RETIRO DE CONEXIÓN DE PC' },
      { op: 10, sub: 30, clave: 'PM04', texto: 'ROTULAMIENTO DE ENTRADA ETHERNET' },
      { op: 10, sub: 40, clave: 'PM04', texto: 'UTILIZACION DE BUENAS PRACTICAS' },
      { op: 10, sub: 50, clave: 'PM04', texto: 'APERTURA DE CARCASA DE PC' },
      { op: 10, sub: 60, clave: 'PM04', texto: 'REALIZACION DE LIMPIEZA AL PC' },
      { op: 10, sub: 70, clave: 'PM04', texto: 'VERIFICACION DE ESTADO AL PC' },
      { op: 10, sub: 80, clave: 'PM04', texto: 'REINCORPORACION DE CARCASA AL PC' },
      { op: 10, sub: 90, clave: 'PM04', texto: 'LIMPIEZA AL GABINETE DEL PC' },
      { op: 10, sub: 100, clave: 'PM04', texto: 'REINCORPORACION DE PC AL GABINETE' },
      { op: 10, sub: 120, clave: 'PM04', texto: 'VALIDACION DE FUNCIONALIDAD DE PC' },
      { op: 10, sub: 130, clave: 'PM04', texto: 'DOCUMENTACION DE MANTENIMIENTO' },
    ],
  },
];

/**
 * Los pasos con los que nace una hoja NUEVA.
 *
 * Sale de que las cinco del ingeniero empiezan igual: seguridad primero,
 * documentación al final. Quien crea una hoja para un equipo nuevo no tiene
 * que acordarse de poner el EPP ni el LOTO — y sobre todo, no puede olvidarse.
 */
export const PASOS_POR_DEFECTO: PasoDeArranque[] = [
  ...SEGURIDAD(false),
  { op: 10, sub: 999, clave: 'PM04', texto: 'DOCUMENTACIÓN DE MANTENIMIENTO' },
];
