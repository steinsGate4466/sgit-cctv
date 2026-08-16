/**
 * CATÁLOGO DE PERMISOS, EN CASTELLANO Y AGRUPADO.
 *
 * El ingeniero va a crear roles. Si la pantalla le enseña una lista de 30
 * códigos sueltos —`wo.approve`, `credential.read`, `access.approve`— no va
 * a elegir bien: va a marcarlos todos por si acaso, que es exactamente el
 * fallo de seguridad que este bloque viene a evitar.
 *
 * Así que cada permiso se presenta con:
 *   - un nombre en castellano,
 *   - QUÉ DEJA HACER de verdad, en una frase,
 *   - y un aviso cuando es delicado.
 *
 * El orden de los grupos es el orden en que se piensa un rol: primero qué
 * ve, luego qué puede tocar, y al final lo peligroso.
 */

export interface PermisoDescrito {
  code: string;
  nombre: string;
  /** Qué deja hacer, dicho para alguien que no programa. */
  explica: string;
  /** Motivo por el que conviene pensárselo dos veces antes de marcarlo. */
  cuidado?: string;
}

export interface GrupoPermisos {
  grupo: string;
  /** Por qué existe este grupo. */
  nota?: string;
  permisos: PermisoDescrito[];
}

export const CATALOGO_PERMISOS: GrupoPermisos[] = [
  {
    grupo: 'Configuración del sistema',
    nota: 'Cambia cómo se comporta el sistema para todos, no sólo lo que uno ve.',
    permisos: [
      {
        code: 'monitor.manage',
        nombre: 'Configurar el monitoreo',
        explica: 'Dar de alta las sondas y decidir qué se comprueba y cada cuánto.',
        cuidado: 'Una sonda mal puesta llena la bandeja de falsas alarmas y la gente deja de mirarla.',
      },
      {
        code: 'notify.manage',
        nombre: 'Configurar los avisos',
        explica: 'Decidir qué se notifica por Telegram y a quién.',
        cuidado: 'Avisar de más consigue que nadie lea ninguno.',
      },
    ],
  },
  {
    grupo: 'Producción y seguridad operativa',
    nota:
      'Decisiones que no puede tomar quien programa ni quien ejecuta: las toma quien ' +
      'conoce el proceso y quien responde por la gente que entra a la línea.',
    permisos: [
      {
        code: 'procedimiento.manage',
        nombre: 'Escribir los procedimientos',
        explica: 'Definir cómo se restaura cada modelo de equipo, y aceptar o rechazar las mejoras que propone el campo.',
        cuidado:
          'Lo que se escriba aquí es lo que va a seguir el próximo técnico, posiblemente ' +
          'de noche y solo. Un paso mal puesto no se nota hasta que alguien lo sigue.',
      },
      {
        code: 'zona.intervencion',
        nombre: 'Firmar cómo se interviene una zona',
        explica: 'Autorizar que en esa zona se trabaje con el tren produciendo, o exigir parada.',
        cuidado:
          'NO es un permiso administrativo: es una autorización de seguridad. Quien lo firma ' +
          'responde de que ahí se puede trabajar sin parar la línea. Sólo el Jefe de ' +
          'Mantenimiento y el Supervisor Operativo de Tercería.',
      },
      {
        code: 'zona.criticidad',
        nombre: 'Declarar zonas vitales',
        explica: 'Decir qué zonas no pueden quedarse sin vista y por qué. Sube sola la prioridad de todas las cámaras de esa zona.',
        cuidado: 'Reordena el trabajo de Mantenimiento sin que nadie lo toque a mano. Dáselo a Producción, no a quien ejecuta.',
      },
    ],
  },

  {
    grupo: 'Mirar',
    nota: 'Sólo consultar. Nada de esto modifica nada.',
    permisos: [
      { code: 'dashboard.read', nombre: 'Ver tableros', explica: 'Estado por tren, indicadores y avance del mapeo.' },
      { code: 'asset.read', nombre: 'Ver activos', explica: 'Cámaras, NVR, switches, gabinetes y su estado.' },
      { code: 'location.read', nombre: 'Ver ubicaciones', explica: 'El árbol de planta: tren, etapa, zona, gabinete.' },
      { code: 'incident.read', nombre: 'Ver incidencias', explica: 'Qué se ha reportado y en qué va.' },
      { code: 'wo.read', nombre: 'Ver órdenes', explica: 'Las OM: qué hay abierto, en espera y cerrado.' },
      { code: 'wo.report', nombre: 'Descargar el informe', explica: 'Bajar el PDF de una orden cerrada, con sus fotos y firmas.' },
      { code: 'inventory.read', nombre: 'Ver almacén', explica: 'Repuestos, stock actual y mínimos.' },
      { code: 'access.read', nombre: 'Ver permisos de altura', explica: 'Solicitudes de trabajo en altura y su estado.' },
      { code: 'document.read', nombre: 'Ver documentos', explica: 'Manuales y fichas adjuntas a los equipos.' },
      { code: 'troubleshooting.read', nombre: 'Ver diagnóstico', explica: 'Tiempos de reparación y causas más repetidas.' },
      { code: 'monitor.read', nombre: 'Ver el monitoreo', explica: 'El estado OBSERVADO de la red: qué responde y qué no, aparte de lo que dice la ficha.' },
      { code: 'notify.read', nombre: 'Ver la bandeja de avisos', explica: 'Qué avisos se enviaron por Telegram y a quién. Vincular el propio teléfono NO necesita permiso.' },
    ],
  },
  {
    grupo: 'Registrar el trabajo',
    nota: 'Lo que hace un técnico en campo.',
    permisos: [
      { code: 'incident.create', nombre: 'Reportar incidencia', explica: 'Abrir una incidencia cuando encuentra un equipo caído.' },
      { code: 'incident.update', nombre: 'Actualizar incidencia', explica: 'Añadir avances y cambiar el responsable.' },
      { code: 'wo.create', nombre: 'Crear órdenes', explica: 'Abrir una OM correctiva, preventiva, predictiva o de mejora.' },
      { code: 'wo.update', nombre: 'Trabajar la orden', explica: 'Detallar, registrar avance, poner en espera, adjuntar fotos.' },
      { code: 'asset.create', nombre: 'Dar de alta activos', explica: 'Registrar un equipo nuevo en el inventario técnico.' },
      { code: 'asset.update', nombre: 'Editar activos', explica: 'Corregir datos, cambiar estado o reubicar un equipo.' },
      { code: 'access.request', nombre: 'Pedir permiso de altura', explica: 'Solicitar autorización para subir a una zona alta.' },
      { code: 'inventory.check', nombre: 'Hacer inventario', explica: 'Registrar conteos físicos de repuestos.' },
    ],
  },
  {
    grupo: 'Decidir y firmar',
    nota: 'Deciden por otros o cierran algo. Aquí empieza la responsabilidad.',
    permisos: [
      { code: 'incident.close', nombre: 'Cerrar incidencias', explica: 'Dar por resuelta una incidencia. Queda firmado.' },
      { code: 'wo.approve', nombre: 'Cerrar y firmar órdenes', explica: 'Cerrar la OM y firmar el retiro de materiales del almacén.', cuidado: 'La firma queda en la auditoría con su nombre.' },
      { code: 'access.approve', nombre: 'Autorizar trabajo en altura', explica: 'Aprobar o rechazar una solicitud de subida.', cuidado: 'Es una decisión de seguridad: autoriza a alguien a subir.' },
      { code: 'inventory.manage', nombre: 'Administrar almacén', explica: 'Alta y baja de repuestos, mínimos, entradas y salidas.' },
      { code: 'location.manage', nombre: 'Administrar ubicaciones', explica: 'Crear y mover ramas del árbol de planta.', cuidado: 'Mover una rama cambia el tren y la etapa de todo lo que cuelga de ella.' },
      { code: 'document.manage', nombre: 'Administrar documentos', explica: 'Subir y borrar manuales y fichas.' },
    ],
  },
  {
    grupo: 'Administración del sistema',
    nota: 'Delicado. Cuanta menos gente lo tenga, mejor.',
    permisos: [
      { code: 'user.read', nombre: 'Ver usuarios', explica: 'Consultar quién tiene cuenta y con qué rol.' },
      { code: 'user.manage', nombre: 'Administrar usuarios', explica: 'Crear cuentas, cambiar rol, activar y desactivar.', cuidado: 'Quien tiene esto puede darse a sí mismo cualquier permiso.' },
      { code: 'role.manage', nombre: 'Administrar roles', explica: 'Crear roles nuevos y decidir qué puede hacer cada uno.', cuidado: 'Quien tiene esto decide lo que puede hacer todo el mundo.' },
      { code: 'audit.read', nombre: 'Ver auditoría', explica: 'El registro de quién hizo qué y cuándo.', cuidado: 'Contiene la actividad de todas las personas.' },
      { code: 'asset.delete', nombre: 'Eliminar activos', explica: 'Borrar un equipo del sistema.', cuidado: 'Se pierde su historial de mantenimiento.' },
      { code: 'credential.read', nombre: 'Ver credenciales', explica: 'Usuarios y contraseñas de cámaras y NVR.', cuidado: 'Es acceso directo a las cámaras de planta. Poca gente.' },
      { code: 'credential.manage', nombre: 'Editar credenciales', explica: 'Cambiar las contraseñas guardadas de los equipos.', cuidado: 'Es acceso directo a las cámaras de planta. Poca gente.' },
      /* Bloque 34. La SEGUNDA llave del borrado definitivo. No sustituye a
         `asset.delete` ni a `wo.approve`: se suma a ellos. Dar de baja un
         equipo conserva su historial; esto lo borra de la base con todo lo
         que cuelgue. Antes esta llave era el texto 'Jefe de Mantenimiento'
         escrito a mano en cinco archivos, así que renombrar el rol la
         desactivaba en silencio. */
      {
        code: 'om.mirar',
        nombre: 'Mirar el trabajo sobre mis cámaras',
        explica: 'Ver la orden que se está haciendo: avance, última nota del técnico y qué material falta.',
        cuidado: 'Es SÓLO LECTURA. Se creó para que Producción pueda observar sin abrirle el módulo de Mantenimiento entero.',
      },
      {
        code: 'purga.definitiva',
        nombre: 'Borrar definitivamente (sin vuelta atrás)',
        explica: 'Segunda llave para eliminar de la base registros que nunca debieron existir: pruebas, duplicados, códigos mal tecleados.',
        cuidado: 'No se recupera y no queda el equipo en BAJA: desaparece. Debería tenerlo una sola persona.',
      },
    ],
  },
];

/** Todos los códigos del catálogo, para validar lo que llega de la pantalla. */
export const CODIGOS_VALIDOS: ReadonlySet<string> = new Set(
  CATALOGO_PERMISOS.flatMap((g) => g.permisos.map((p) => p.code)),
);

/**
 * Un rol de SÓLO LECTURA no debería poder tocar nada. Esto detecta la
 * combinación incoherente: "sólo mira" + un permiso que modifica.
 * No lo prohíbe —el ingeniero manda—, pero la pantalla lo avisa.
 */
/* OJO CON CÓMO SE DECIDE QUÉ «MODIFICA».
   La primera versión miraba el GRUPO del catálogo: todo lo que no estuviera
   en «Mirar» contaba como modificación. Funcionaba por casualidad, porque los
   grupos son una decisión de PRESENTACIÓN —cómo se ordenan las casillas en la
   pantalla— y no una decisión de semántica.

   Se rompió en cuanto `audit.read` se colocó en su propio grupo: leer la
   traza de auditoría pasó a contar como escritura, y un rol de auditoría de
   sólo lectura dejaba de considerarse de sólo lectura.

   Ahora la regla es semántica y no depende de dónde esté pintado: un permiso
   terminado en `.read` no modifica nada, y `wo.report` sólo descarga un PDF.
   Si algún día alguien mueve una casilla de sitio en la pantalla, esto no se
   entera — que es justo lo que se quiere. */
const NO_MODIFICAN_NUNCA = (code: string) =>
  code.endsWith('.read') || code === 'wo.report';

const MODIFICAN = new Set(
  CATALOGO_PERMISOS
    .flatMap((g) => g.permisos.map((p) => p.code))
    .filter((c) => !NO_MODIFICAN_NUNCA(c)),
);

export function soloMira(codigos: string[]): boolean {
  return codigos.length > 0 && !codigos.some((c) => MODIFICAN.has(c));
}

/**
 * PLANTILLAS DE ROL — perfiles de una planta siderúrgica, no de un software.
 *
 * =============================================================================
 *  POR QUÉ HAY PLANTILLAS Y NO UNA LISTA DE 36 CASILLAS
 * =============================================================================
 *  Quien arma un rol no piensa en `wo.approve`: piensa «el almacenero». Si la
 *  pantalla sólo ofrece códigos, marca todos por si acaso — y eso es
 *  exactamente el fallo que el control de acceso venía a evitar.
 *
 *  Estas plantillas son un PUNTO DE PARTIDA editable, no una jaula. Cada una
 *  responde a un puesto que existe de verdad en Pisco.
 *
 * =============================================================================
 *  DOS CRITERIOS QUE ATRAVIESAN TODAS
 * =============================================================================
 *  1. NADIE LLEVA `credential.read` SALVO QUIEN ENTRA A LOS EQUIPOS.
 *     Es la contraseña del grabador. Con ella se ve y se borra vídeo. No es
 *     un permiso de consulta por mucho que se llame «read».
 *
 *  2. LO QUE CIERRA NO ES LO QUE EJECUTA. El técnico avanza su trabajo; el
 *     cierre —que es lo que congela el indicador y la firma— es de quien
 *     responde por él. Separarlo no es burocracia: es lo que hace que el MTTR
 *     signifique algo.
 *
 *  El ÁMBITO por tren se configura aparte, en la ficha del usuario. Una
 *  plantilla dice QUÉ puede hacer; el ámbito, SOBRE QUÉ TREN.
 */
export const PLANTILLAS_DE_ROL: {
  nombre: string;
  descripcion: string;
  permisos: string[];
  /** Puesto real al que corresponde, en lenguaje de planta. */
  paraQuien?: string;
  /** Lo que hay que pensar dos veces antes de conceder este perfil. */
  advertencia?: string;
  /** true si este perfil sólo tiene sentido con ámbito de tren asignado. */
  necesitaAmbito?: boolean;
}[] = [
  {
    nombre: 'Jefe de línea (Producción)',
    paraQuien: 'Jefe de turno o de línea del Tren 1, 2 o 3.',
    descripcion:
      'Ve qué se está viendo y qué no en SU tren, y DECLARA qué zonas no pueden ' +
      'quedarse a ciegas. No interviene equipos: ésa es la única escritura que tiene.',
    necesitaAmbito: true,
    permisos: [
      'dashboard.read', 'asset.read', 'location.read', 'incident.read',
      'incident.create', 'wo.read', 'wo.report', 'monitor.read',
      'zona.criticidad',
    ],
  },
  {
    nombre: 'Gerencia / Jefatura de planta',
    paraQuien: 'Quien pide los números en el comité mensual.',
    descripcion:
      'Lee toda la planta y los indicadores. Ni una sola escritura: si necesita ' +
      'que algo cambie, lo pide a quien responde por ello, y eso queda registrado.',
    permisos: [
      'dashboard.read', 'troubleshooting.read', 'asset.read', 'location.read',
      'incident.read', 'wo.read', 'wo.report', 'inventory.read',
      'access.read', 'document.read', 'monitor.read',
    ],
  },
  {
    nombre: 'Supervisor TI / Redes',
    paraQuien: 'Quien responde por la red industrial y los grabadores.',
    descripcion:
      'Sostiene la infraestructura: direccionamiento, enlaces, monitoreo y las ' +
      'credenciales de los equipos. No cierra órdenes de mantenimiento.',
    advertencia:
      'NO trae las credenciales de los equipos. Ese permiso es acceso directo al vídeo ' +
      'de las cámaras y NO se reparte con una plantilla: se concede a mano, persona por ' +
      'persona, después de crear el rol. Una plantilla se pulsa sin leer; eso no.',
    permisos: [
      'dashboard.read', 'troubleshooting.read', 'asset.read', 'asset.create',
      'asset.update', 'location.read', 'location.manage',
      'incident.read', 'incident.create', 'incident.update',
      'wo.read', 'wo.update', 'wo.report',
      'monitor.read', 'monitor.manage', 'notify.read',
      'procedimiento.manage',
      'document.read', 'document.manage', 'inventory.read',
      'access.read', 'access.request',
    ],
  },
  {
    nombre: 'Técnico de red',
    paraQuien: 'Quien sube al poste y configura el equipo.',
    descripcion:
      'Detalla y ejecuta en campo las órdenes que le asignan. Las credenciales de los ' +
      'equipos se le dan a mano si de verdad las necesita, no de serie.',
    permisos: [
      'dashboard.read', 'asset.read', 'asset.update', 'location.read',
      'incident.read', 'incident.create', 'incident.update',
      'wo.read', 'wo.report', 'wo.update',
      'monitor.read',
      'inventory.read', 'inventory.check',
      'access.read', 'access.request', 'document.read',
    ],
  },
  {
    nombre: 'Técnico de campo (CCTV)',
    paraQuien: 'Cuadrilla de mantenimiento de cámaras.',
    descripcion:
      'Igual que el de red pero SIN credenciales de equipos. Es el perfil por ' +
      'defecto de la cuadrilla: la mayoría no necesita entrar al grabador.',
    permisos: [
      'dashboard.read', 'asset.read', 'asset.update', 'location.read',
      'incident.read', 'incident.create', 'incident.update',
      'wo.read', 'wo.report', 'wo.update',
      'inventory.read', 'inventory.check',
      'access.read', 'access.request', 'document.read',
    ],
  },
  {
    nombre: 'Almacén',
    paraQuien: 'Almacenero de repuestos.',
    descripcion:
      'Stock, mínimos, entradas y salidas. Ve las órdenes SÓLO para saber contra ' +
      'qué trabajo sale el material — sin eso no hay costo por equipo.',
    permisos: [
      'dashboard.read', 'inventory.read', 'inventory.manage', 'inventory.check',
      'asset.read', 'location.read', 'wo.read',
    ],
  },
  {
    nombre: 'SSOMA / Seguridad',
    paraQuien: 'Prevencionista que autoriza el trabajo en altura.',
    descripcion:
      'Revisa y APRUEBA los permisos de altura e izaje. Ve dónde está el equipo ' +
      'y cómo se llega, que es lo que necesita para decidir.',
    advertencia:
      'access.approve es la firma que habilita a subir a un manlift. No es un ' +
      'permiso administrativo: responde una persona.',
    permisos: [
      'dashboard.read', 'asset.read', 'location.read',
      'access.read', 'access.request', 'access.approve',
      'incident.read', 'wo.read', 'document.read',
    ],
  },
  {
    nombre: 'Auditoría / Control interno',
    paraQuien: 'Auditoría interna o el propio equipo de TI revisando.',
    descripcion:
      'Lee la traza completa de quién hizo qué. No puede modificar nada, y sobre ' +
      'todo NO ve credenciales: auditar no es tener acceso.',
    permisos: [
      'audit.read', 'dashboard.read', 'asset.read', 'location.read',
      'incident.read', 'wo.read', 'wo.report', 'inventory.read', 'access.read',
    ],
  },
  {
    nombre: 'Supervisor Operativo de Tercería',
    paraQuien: 'Quien responde por la cuadrilla contratada, que cubre los tres trenes.',
    descripcion:
      'Mueve el trabajo de su gente y FIRMA en qué zonas se puede intervenir con el tren ' +
      'en marcha. No cierra órdenes: el cierre sigue siendo del Jefe de Mantenimiento.',
    advertencia:
      'Lleva zona.intervencion, que autoriza a acercarse a la línea con el tren produciendo. ' +
      'Es la única persona fuera de Aceros que debería tenerlo, y responde por esa firma.',
    permisos: [
      'dashboard.read', 'asset.read', 'location.read',
      'incident.read', 'incident.create',
      'wo.read', 'wo.update', 'wo.report',
      'access.read', 'access.request', 'document.read',
      'zona.intervencion',
    ],
  },
  {
    nombre: 'Contratista (tercería)',
    paraQuien: 'Empresa externa contratada para una campaña o una instalación.',
    descripcion:
      'Ve y trabaja ÚNICAMENTE lo que se le asigna. Sin inventario, sin auditoría, ' +
      'sin credenciales y sin ver la planta entera.',
    advertencia:
      'Va SIEMPRE con ámbito de tren asignado. Sin ámbito, un contratista ve los ' +
      'tres trenes, que es justo lo que no se quiere.',
    necesitaAmbito: true,
    permisos: [
      'wo.read', 'wo.update', 'wo.report', 'asset.read', 'location.read',
      'incident.create', 'access.request',
    ],
  },
  {
    nombre: 'Consulta',
    paraQuien: 'Visita, práctica profesional, o alguien que sólo necesita mirar.',
    descripcion: 'Sólo mirar. Sin credenciales, sin auditoría, sin descargar informes.',
    permisos: ['dashboard.read', 'asset.read', 'location.read', 'incident.read', 'wo.read'],
  },
];
