import { padreDe } from './pestanas';

/**
 * LOS MÓDULOS — bloque 147.
 *
 * Observación de Producción, Mantenimiento y Técnica tras la presentación
 * (28/09/2026): «demasiados módulos, marean». El menú tenía 48 entradas.
 *
 * Ahora el menú tiene UNA entrada por módulo y, dentro, las pantallas del
 * módulo salen como pestañas. No se borra ninguna pantalla ni cambia ninguna
 * ruta: cambia sólo cómo se llega. Los enlaces viejos siguen funcionando.
 *
 * ESTA LISTA ES LA ÚNICA VERDAD. El menú lateral y la barra de pestañas leen
 * de aquí; `verificar:menu` comprueba que toda ruta de App.tsx tiene sitio.
 *
 * Los permisos son EXACTAMENTE los que tenía cada entrada del menú anterior.
 * Un módulo sin ninguna pantalla visible para el usuario no se pinta.
 */

type Can = (permiso: string) => boolean;
interface Usuario { ambitoTrenes?: unknown[] | null }
export type Puede = (can: Can, user: Usuario | null | undefined) => boolean;

export interface Pantalla {
  ruta: string;
  texto: string;
  /** Sin esto la ve cualquiera con sesión. */
  puede?: Puede;
  /** Texto distinto según quién mira (p. ej. «Mis propuestas»). */
  textoPara?: (can: Can) => string;
}

export interface Modulo {
  titulo: string;
  icono: string;
  pantallas: Pantalla[];
}

const con = (p: string): Puede => (can) => can(p);
const alguno = (...ps: string[]): Puede => (can) => ps.some((p) => can(p));

export const MODULOS: Modulo[] = [
  /* Qué se ve y qué no, ahora. Pasará a ser el Mapa (plano vivo) cuando
     exista el plano de un área; hasta entonces no se llama «Mapa», porque
     no lo es. */
  {
    titulo: 'Estado de planta',
    icono: 'mapeo',
    pantallas: [
      { ruta: '/vista-general', texto: 'Resumen', puede: con('om.mirar') },
      { ruta: '/mi-tren', texto: 'Mi tren',
        puede: (can, u) => (u?.ambitoTrenes?.length ?? 0) > 0 && can('dashboard.read') },
      { ruta: '/por-tren', texto: 'Por tren', puede: con('om.mirar') },
      { ruta: '/mis-camaras', texto: 'Mis cámaras', puede: con('om.mirar') },
      { ruta: '/cobertura', texto: 'Zonas críticas', puede: con('cobertura.mirar') },
      { ruta: '/dependencias', texto: 'Impacto de una caída', puede: con('om.mirar') },
    ],
  },
  /* Qué hay que hacer. La bandeja primero: es lo que hay que vaciar. */
  {
    titulo: 'Trabajo',
    icono: 'orden',
    pantallas: [
      { ruta: '/bandeja', texto: 'Mi bandeja', puede: con('dashboard.read') },
      { ruta: '/incidents', texto: 'Incidencias', puede: con('incident.read') },
      { ruta: '/maintenance', texto: 'Órdenes', puede: alguno('wo.read', 'om.mirar') },
      { ruta: '/tablero-om', texto: 'Avance', puede: con('om.mirar') },
      { ruta: '/hojas-de-ruta', texto: 'Hojas de ruta', puede: con('wo.read') },
      { ruta: '/gruas', texto: 'Grúas', puede: con('wo.read') },
    ],
  },
  /* Qué hay montado en planta y cómo está su ficha. */
  {
    titulo: 'Equipos',
    icono: 'activos',
    pantallas: [
      { ruta: '/assets', texto: 'Activos', puede: con('asset.read') },
      { ruta: '/mis-activos', texto: 'Mis activos', puede: con('activos.mirar') },
      { ruta: '/criticidad', texto: 'Criticidad', puede: alguno('asset.read', 'activos.mirar') },
      { ruta: '/instalaciones', texto: 'Instalaciones', puede: con('asset.read') },
      { ruta: '/access', texto: 'Acceso y altura', puede: con('access.read') },
      { ruta: '/retirados', texto: 'Retirados', puede: alguno('asset.read', 'activos.mirar') },
      { ruta: '/mapeo', texto: 'Estado de la información', puede: con('asset.read') },
      { ruta: '/salud-de-datos', texto: 'Calidad de datos', puede: con('asset.update') },
    ],
  },
  /* 220 V → switch → cámara. Una sola cadena, un solo módulo. */
  {
    titulo: 'Red y energía',
    icono: 'puertos',
    pantallas: [
      { ruta: '/capacidad', texto: 'Capacidad', puede: alguno('red.read', 'infra.read', 'asset.read') },
      { ruta: '/conexiones', texto: 'Conexiones', puede: con('red.read') },
      { ruta: '/mapa-de-red', texto: 'Mapa de red', puede: con('red.read') },
      { ruta: '/topologia', texto: 'Puntos críticos', puede: con('red.read') },
      { ruta: '/grabadores', texto: 'Grabadores', puede: con('red.read') },
      { ruta: '/ipam', texto: 'IP', puede: con('red.read') },
      { ruta: '/cableado', texto: 'Cableado', puede: con('infra.read') },
      { ruta: '/rotulado', texto: 'Rotulado', puede: con('infra.read') },
      { ruta: '/electricidad', texto: 'Electricidad', puede: con('infra.read') },
      { ruta: '/monitoreo', texto: 'Monitoreo', puede: con('monitor.read') },
    ],
  },
  /* Dónde está cada cosa. */
  {
    titulo: 'Ubicaciones',
    icono: 'ubicacion',
    pantallas: [
      { ruta: '/locations', texto: 'Árbol de planta', puede: con('asset.read') },
      { ruta: '/cabinets', texto: 'Gabinetes', puede: con('asset.read') },
      { ruta: '/zonas', texto: 'Zonas vitales', puede: con('location.read') },
    ],
  },
  {
    titulo: 'Repuestos',
    icono: 'inventario',
    pantallas: [
      { ruta: '/inventory', texto: 'Almacén', puede: alguno('inventory.read', 'om.mirar') },
      { ruta: '/riesgo', texto: 'Obsolescencia', puede: con('infra.read') },
    ],
  },
  {
    titulo: 'Documentos',
    icono: 'etiqueta',
    pantallas: [
      { ruta: '/documentos', texto: 'Manuales y planos', puede: con('document.read') },
      { ruta: '/catalogos', texto: 'Catálogo de fallas', puede: con('location.manage') },
      { ruta: '/mejoras-procedimiento', texto: 'Mejoras propuestas',
        puede: alguno('procedimiento.manage', 'wo.update'),
        textoPara: (can) => (can('procedimiento.manage') ? 'Mejoras propuestas' : 'Mis propuestas') },
    ],
  },
  {
    titulo: 'Indicadores',
    icono: 'indicadores',
    pantallas: [
      { ruta: '/dashboard', texto: 'Dashboard', puede: con('dashboard.read') },
      { ruta: '/exportar', texto: 'Exportar', puede: con('dashboard.read') },
    ],
  },
  /* No es un oficio: la cuenta de cada uno y la administración. Último a
     propósito. «Mi cuenta» y «Avisos» los ve cualquiera. */
  {
    titulo: 'Ajustes',
    icono: 'usuarios',
    pantallas: [
      { ruta: '/mi-cuenta', texto: 'Mi cuenta' },
      { ruta: '/avisos', texto: 'Avisos' },
      { ruta: '/users', texto: 'Usuarios', puede: con('user.manage') },
      { ruta: '/sesiones', texto: 'Sesiones', puede: con('user.manage') },
      { ruta: '/roles', texto: 'Roles', puede: con('role.manage') },
      { ruta: '/equipos', texto: 'Equipos conocidos', puede: con('user.manage') },
      { ruta: '/audit', texto: 'Auditoría', puede: con('audit.read') },
      { ruta: '/limpieza', texto: 'Limpieza', puede: con('asset.delete') },
    ],
  },
];

/** Las pantallas del módulo que este usuario puede abrir, con su texto. */
export function pantallasVisibles(m: Modulo, can: Can, user: Usuario | null | undefined): Pantalla[] {
  return m.pantallas
    .filter((p) => !p.puede || p.puede(can, user))
    .map((p) => (p.textoPara ? { ...p, texto: p.textoPara(can) } : p));
}

/** La ruta «dueña» de una pantalla: ella misma, o su padre si es pestaña. */
export function rutaDueña(ruta: string): string {
  return padreDe(ruta) ?? ruta;
}

/** El módulo al que pertenece una ruta, o null. */
export function moduloDe(ruta: string): Modulo | null {
  const r = rutaDueña(ruta);
  return MODULOS.find((m) => m.pantallas.some((p) => p.ruta === r)) ?? null;
}

/**
 * DÓNDE ENTRA CADA UNO — bloque 148.
 *
 * Antes todos entraban al Dashboard, y quien no tenía permiso de verlo
 * aterrizaba en una pantalla vacía. Ahora cada uno entra a lo SUYO.
 *
 * Se decide por lo que la persona PUEDE HACER, nunca por el nombre del rol
 * (regla del bloque 62-A): los roles se crean y renombran desde la pantalla,
 * y un literal de rol aquí dejaría de funcionar sin avisar.
 *
 *   mira su tren pero no ejecuta órdenes   → Producción   → su tren
 *   ejecuta órdenes pero no las aprueba    → Técnico      → sus órdenes vivas
 *   ve el tablero de gestión               → Mantenimiento → su bandeja
 *   cualquier otro                          → la primera pantalla que pueda abrir
 */
export function inicioPara(can: Can, user: Usuario | null | undefined): string {
  const tieneTren = (user?.ambitoTrenes?.length ?? 0) > 0;
  if (can('om.mirar') && !can('wo.update')) {
    return tieneTren && can('dashboard.read') ? '/mi-tren' : '/vista-general';
  }
  if (can('wo.update') && !can('wo.approve')) return '/maintenance?asignadas=1';
  if (can('dashboard.read')) return '/bandeja';
  for (const m of MODULOS) {
    const v = pantallasVisibles(m, can, user);
    if (v.length) return v[0].ruta;
  }
  return '/mi-cuenta';
}
