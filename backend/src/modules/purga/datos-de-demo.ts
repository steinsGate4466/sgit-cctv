/**
 * QUÉ ES DATO DE DEMO Y QUÉ ES DATO DE PLANTA — bloque 39.
 *
 * =============================================================================
 *  EL PROBLEMA
 * =============================================================================
 *  Para enseñarle el sistema a Producción hacen falta dos incidencias con su
 *  orden, su avance y su material faltante. Sin eso, la pantalla del jefe de
 *  tren sale vacía y una pantalla vacía en una demo se lee como «el software
 *  no funciona» — aunque esté perfecto.
 *
 *  Pero esos datos NO PUEDEN QUEDARSE. El día del despliegue real la base
 *  tiene que estar limpia: sólo los usuarios para poder entrar, los roles, los
 *  permisos y los catálogos. Ni una incidencia inventada.
 *
 * =============================================================================
 *  CÓMO SE DISTINGUEN, Y POR QUÉ ASÍ
 * =============================================================================
 *  Con una MARCA EN EL TEXTO, no con una columna nueva.
 *
 *  Una columna `esDemo` obligaría a una migración, a acordarse de ponerla en
 *  cada `create`, y sobre todo se quedaría ahí para siempre — una columna que
 *  sólo sirve una semana y que dentro de un año nadie sabrá para qué está.
 *
 *  La marca va en el CÓDIGO del registro: todo lo de prueba empieza por
 *  `DEMO-`. Es visible a simple vista en cualquier listado, no necesita
 *  esquema, y el borrado es un `startsWith` que cualquiera puede leer y
 *  verificar. Si alguien duda de qué se va a borrar, lo ve en la pantalla
 *  antes de pulsar.
 *
 *  EL RIESGO ACEPTADO: si alguien creara a mano una orden real llamada
 *  `DEMO-algo`, se borraría con las demás. Se asume a propósito — es un
 *  prefijo que nadie escribe por accidente, y el diálogo de borrado enseña la
 *  lista completa antes de tocar nada.
 */

/** Todo lo de prueba lleva este prefijo en su código. */
export const PREFIJO_DEMO = 'DEMO-';

/** Filtro de Prisma para encontrar lo de demo por su código. */
export const esDemo = { code: { startsWith: PREFIJO_DEMO } };

/**
 * LO QUE **NUNCA** SE BORRA, aunque se vacíe la base entera.
 *
 * Sin esto, un borrado de datos de prueba dejaría el sistema sin nadie que
 * pueda entrar a arreglarlo — y sólo se saldría tocando la base a mano.
 *
 *   · usuarios, roles y permisos    -> para poder iniciar sesión
 *   · el árbol de ubicaciones       -> es la planta, no es un dato de prueba
 *   · los catálogos editables       -> causas, síntomas, acciones, motivos
 *   · la configuración del sistema  -> modo de acceso, token de avisos
 *   · la AUDITORÍA                  -> es la prueba de qué pasó, incluido este
 *                                      mismo borrado
 */
export const NUNCA_SE_BORRA = [
  'usuarios, roles y permisos',
  'el árbol de ubicaciones de planta',
  'los catálogos de causas, síntomas y acciones',
  'la configuración del sistema',
  'el registro de auditoría',
] as const;
