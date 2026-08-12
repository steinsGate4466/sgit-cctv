/**
 * QUÉ SE PUEDE BORRAR, Y CON QUÉ FRENOS
 * =============================================================================
 *
 *  POR QUÉ UNA TABLA Y NO QUINCE MÉTODOS
 *  --------------------------------------------------------------------------
 *  Al añadir el borrado a cada módulo, la salida perezosa era copiar el par
 *  `vistaPreviaX` / `purgarX` quince veces. Eso son quince sitios donde puede
 *  faltar la confirmación escrita, quince donde puede faltar la auditoría, y
 *  quince que hay que recordar el día que cambie una regla.
 *
 *  Aquí cada recurso declara SÓLO lo que tiene de particular —cómo se llama
 *  su código, qué se lleva por delante, qué lo bloquea— y el servicio aplica
 *  a todos las mismas reglas: rol de Jefe, confirmación escrita, auditoría
 *  antes de borrar, cascada de PostgreSQL.
 *
 *  LA REGLA DE FONDO, LA MISMA DE SIEMPRE
 *  --------------------------------------------------------------------------
 *  Si el registro tiene rastro de TRABAJO REAL —una firma, un movimiento de
 *  almacén, un documento cerrado— no se borra en silencio: avisa y exige la
 *  segunda llave. Basura de pruebas nunca tiene esas cosas, así que la regla
 *  separa los dos casos sin preguntarle a nadie.
 */

export interface RecursoPurgable {
  /** Cómo se pide desde la API: /purga/r/<clave>/<id> */
  clave: string;
  /** Propiedad del cliente de Prisma: prisma.<modelo> */
  modelo: string;
  etiqueta: string;
  /** Campo que el usuario tiene que escribir para confirmar. */
  campoCodigo: string;
  /** Permiso que exige el guard (además del rol de Jefe). */
  permiso: string;
  /** Campos que se leen para enseñar de qué registro se trata. */
  camposResumen: string[];
  /**
   * Relaciones a contar en la vista previa: clave de `_count` -> texto.
   * Lo que salga aquí es lo que el usuario verá que va a perder.
   */
  arrastra?: Record<string, string>;
  /**
   * Relaciones que NO se borran (quedan en nulo). Se enseñan aparte para que
   * nadie crea que perdió algo que sigue ahí.
   */
  sobrevive?: Record<string, string>;
  /**
   * Condiciones que exigen la segunda llave. Cada una devuelve el texto del
   * aviso, o null si no aplica.
   */
  avisos?: Array<{
    /** Cuenta en otra tabla; si es > 0, avisa. */
    contar?: { modelo: string; donde: (id: string) => any };
    /** O una comprobación sobre el propio registro. */
    campo?: string;
    valorPeligroso?: any;
    texto: (n: number) => string;
  }>;
}

export const RECURSOS: RecursoPurgable[] = [
  {
    clave: 'incidencia',
    modelo: 'incident',
    etiqueta: 'Incidencia',
    campoCodigo: 'code',
    permiso: 'incident.close',
    camposResumen: ['code', 'title', 'status', 'createdAt'],
    arrastra: { workOrders: 'órdenes que nacieron de ella' },
    avisos: [
      {
        campo: 'status', valorPeligroso: 'RESUELTA',
        texto: () => 'Esta incidencia está RESUELTA: lleva firma de quien la cerró y su explicación. Es un documento.',
      },
      {
        contar: { modelo: 'workOrder', donde: (id) => ({ incidentId: id, status: 'CERRADA' }) },
        texto: (n) => `Generó ${n} orden(es) YA CERRADA(S). Borrarla dejaría esas órdenes sin el motivo por el que se abrieron.`,
      },
    ],
  },
  {
    clave: 'ubicacion',
    modelo: 'location',
    etiqueta: 'Ubicación',
    campoCodigo: 'code',
    permiso: 'location.manage',
    camposResumen: ['code', 'name', 'type', 'path'],
    arrastra: {
      children: 'ubicaciones hijas (y todo lo que cuelgue de ellas)',
      assets: 'activos',
      cabinets: 'gabinetes',
      documents: 'documentos',
      instalaciones: 'instalaciones',
      zonasCampana: 'zonas de campaña de mapeo',
    },
    avisos: [
      {
        contar: { modelo: 'asset', donde: (id) => ({ locationId: id }) },
        texto: (n) => `Cuelgan ${n} activo(s) de esta ubicación. Al borrarla se van con ella, con todo su historial.`,
      },
    ],
  },
  {
    clave: 'gabinete',
    modelo: 'cabinet',
    etiqueta: 'Gabinete',
    campoCodigo: 'code',
    permiso: 'asset.delete',
    camposResumen: ['code', 'name', 'locationId'],
    arrastra: { assets: 'equipos montados dentro' },
    avisos: [
      {
        contar: { modelo: 'asset', donde: (id) => ({ cabinetId: id }) },
        texto: (n) => `Hay ${n} equipo(s) montados en este gabinete. Al borrarlo se borran también.`,
      },
    ],
  },
  {
    clave: 'cable',
    modelo: 'assetCable',
    etiqueta: 'Tramo de cable',
    campoCodigo: 'code',
    permiso: 'asset.update',
    camposResumen: ['code', 'lengthM', 'category', 'status'],
  },
  {
    clave: 'repuesto',
    modelo: 'sparePart',
    etiqueta: 'Repuesto',
    campoCodigo: 'name',
    permiso: 'inventory.manage',
    camposResumen: ['name', 'sapCode', 'currentStock', 'category'],
    arrastra: { movements: 'movimientos de almacén', checks: 'controles físicos' },
    avisos: [
      {
        contar: { modelo: 'stockMovement', donde: (id) => ({ sparePartId: id }) },
        texto: (n) => `Tiene ${n} movimiento(s) de almacén. Borrarlo deja el histórico de consumo sin el repuesto al que se refería.`,
      },
      {
        contar: { modelo: 'workOrderMaterial', donde: (id) => ({ sparePartId: id, movementId: { not: null } }) },
        texto: (n) => `Salió de almacén en ${n} orden(es). Borrarlo NO devuelve el stock: sólo borra el nombre.`,
      },
    ],
  },
  {
    clave: 'herramienta',
    modelo: 'tool',
    etiqueta: 'Herramienta',
    campoCodigo: 'code',
    permiso: 'inventory.manage',
    camposResumen: ['code', 'name', 'category'],
    arrastra: { checks: 'preparaciones de orden que la incluían' },
  },
  {
    clave: 'documento',
    modelo: 'document',
    etiqueta: 'Documento',
    campoCodigo: 'title',
    permiso: 'document.manage',
    camposResumen: ['title', 'category', 'createdAt'],
    sobrevive: {},
  },
  {
    clave: 'catalogo',
    modelo: 'catalogItem',
    etiqueta: 'Elemento de catálogo',
    campoCodigo: 'code',
    permiso: 'wo.approve',
    camposResumen: ['code', 'name', 'kind', 'active'],
    avisos: [
      {
        contar: { modelo: 'workOrder', donde: (id) => ({ rootCauseCode: id }) },
        texto: (n) => `Se usó como causa en ${n} orden(es) cerrada(s). Si se borra, esas órdenes se quedan con un código sin nombre. Desactívalo en vez de borrarlo.`,
      },
    ],
  },
  {
    clave: 'acceso',
    modelo: 'accessRequest',
    etiqueta: 'Permiso de acceso',
    campoCodigo: 'code',
    permiso: 'access.approve',
    camposResumen: ['code', 'status', 'means', 'createdAt'],
    avisos: [
      {
        campo: 'status', valorPeligroso: 'APROBADA',
        texto: () => 'Este permiso está APROBADO: lleva la firma de quien autorizó un trabajo en altura. Es un documento de SSOMA.',
      },
    ],
  },
  {
    clave: 'inspeccion-grua',
    modelo: 'inspeccionGrua',
    etiqueta: 'Inspección de grúa',
    campoCodigo: 'code',
    permiso: 'wo.approve',
    camposResumen: ['code', 'resultado', 'fecha'],
  },
  {
    clave: 'instalacion',
    modelo: 'instalacion',
    etiqueta: 'Instalación',
    campoCodigo: 'codigo',
    permiso: 'asset.update',
    camposResumen: ['codigo', 'estado', 'tipoSitio', 'tipoEquipo'],
    arrastra: { fotos: 'fotos del sitio' },
    sobrevive: { assetCreado: 'el activo que creó (no se borra)' },
    avisos: [
      {
        campo: 'estado', valorPeligroso: 'INSTALADA',
        texto: () => 'Está INSTALADA y creó un activo. Borrar el papel no desinstala el equipo: el activo se queda.',
      },
    ],
  },
  {
    clave: 'parada',
    modelo: 'ventanaParada',
    etiqueta: 'Ventana de parada',
    campoCodigo: 'id',
    permiso: 'wo.update',
    camposResumen: ['tren', 'estado', 'inicioPrevisto', 'motivo'],
    arrastra: { cambios: 'movimientos de hora registrados' },
    sobrevive: { ordenes: 'órdenes colgadas (quedan sin ventana)' },
    avisos: [
      {
        campo: 'estado', valorPeligroso: 'TERMINADA',
        texto: () => 'Esta parada ya TERMINÓ y tiene horas reales. Es el dato con el que se mide la desviación.',
      },
    ],
  },
  {
    clave: 'etapa',
    modelo: 'processStage',
    etiqueta: 'Etapa del proceso',
    campoCodigo: 'code',
    permiso: 'location.manage',
    camposResumen: ['code', 'name', 'sequence'],
    avisos: [
      {
        contar: { modelo: 'location', donde: (id) => ({ stageId: id }) },
        texto: (n) => `Hay ${n} ubicación(es) que dependen de esta etapa. Al borrarla pierden su etapa, y con ella la criticidad y el intervalo que se deducen de aquí.`,
      },
    ],
  },
  {
    clave: 'plan-preventivo',
    modelo: 'preventivePlan',
    etiqueta: 'Plan preventivo',
    campoCodigo: 'id',
    permiso: 'wo.approve',
    camposResumen: ['assetId', 'intervalDays', 'nextDueAt', 'active'],
  },
  {
    clave: 'campana',
    modelo: 'campanaMapeo',
    etiqueta: 'Campaña de mapeo',
    campoCodigo: 'codigo',
    permiso: 'asset.update',
    camposResumen: ['codigo', 'nombre', 'estado', 'tren'],
    arrastra: { zonas: 'zonas repartidas' },
    sobrevive: { activos: 'activos levantados (no se borran)' },
  },
];

export const porClave = (c: string) => RECURSOS.find((r) => r.clave === c) ?? null;
