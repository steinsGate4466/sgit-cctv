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
    grupo: 'Producción',
    nota: 'Lo que sólo puede decidir quien conoce el proceso, no Mantenimiento ni TI.',
    permisos: [
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
const MODIFICAN = new Set(
  CATALOGO_PERMISOS.filter((g) => g.grupo !== 'Mirar').flatMap((g) => g.permisos.map((p) => p.code)),
);

export function soloMira(codigos: string[]): boolean {
  return codigos.length > 0 && !codigos.some((c) => MODIFICAN.has(c));
}

/**
 * Perfiles listos para no empezar de cero.
 * "Jefe de línea de Producción" es el que pidió el ingeniero: mira el estado
 * de SU tren, ve las órdenes activas y se descarga el informe. No interviene.
 */
export const PLANTILLAS_DE_ROL: { nombre: string; descripcion: string; permisos: string[] }[] = [
  {
    nombre: 'Jefe de línea (Producción)',
    descripcion: 'Ve el estado de su tren y las órdenes en curso. No interviene: sólo mira y descarga el informe.',
    permisos: ['dashboard.read', 'asset.read', 'location.read', 'incident.read', 'wo.read', 'wo.report'],
  },
  {
    nombre: 'Técnico de red',
    descripcion: 'Detalla y ejecuta en campo las órdenes que le asignan.',
    permisos: [
      'dashboard.read', 'asset.read', 'asset.update', 'location.read', 'incident.read',
      'incident.create', 'incident.update', 'wo.read', 'wo.report', 'wo.update',
      'inventory.read', 'access.read', 'access.request', 'document.read',
    ],
  },
  {
    nombre: 'Contratista (tercería)',
    descripcion: 'Empresa externa: ve y trabaja únicamente las órdenes que se le asignan.',
    permisos: ['wo.read', 'wo.update', 'wo.report', 'asset.read', 'location.read', 'access.request'],
  },
  {
    nombre: 'Consulta',
    descripcion: 'Sólo mirar. Sin acceso a credenciales ni a auditoría.',
    permisos: ['dashboard.read', 'asset.read', 'location.read', 'incident.read', 'wo.read'],
  },
];
