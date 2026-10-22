import { padreDe, pestanasDe } from './pestanas';

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
  /** Bloque 170 · para qué sirve, en una línea corta. Sale al pasar el ratón
   *  y en la página «Todos los módulos». */
  nota?: string;
}

export interface Modulo {
  titulo: string;
  icono: string;
  /** Bloque 170 · de qué trata el módulo, en una frase. */
  descripcion: string;
  pantallas: Pantalla[];
}

const con = (p: string): Puede => (can) => can(p);
const alguno = (...ps: string[]): Puede => (can) => ps.some((p) => can(p));
const todos = (...ps: string[]): Puede => (can) => ps.every((p) => can(p));

export const MODULOS: Modulo[] = [
  /* =========================================================================
     OPTIMIZACIÓN DEL 21/10 — de 53 entradas a 37.
     Criterio único: UNA entrada por pregunta. Lo que contestaba la misma
     pregunta desde otro ángulo pasa a ser una pestaña de la entrada que queda
     (ver `pestanas.ts`). Ninguna ruta se borra: los enlaces viejos abren la
     misma pantalla, ahora dentro de su entrada. Los permisos de cada pantalla
     son los mismos de antes (`puede` de la pestaña).
     ========================================================================= */
  {
    titulo: 'Estado de planta',
    descripcion: 'Qué se ve y qué no, ahora: mapa, trenes y cámaras.',
    icono: 'mapeo',
    pantallas: [
      { ruta: '/mapa', texto: 'Mapa', nota: 'El plano con cada equipo en su sitio', puede: alguno('asset.read', 'activos.mirar', 'om.mirar') },
      /* Resumen, Mi tren y Por tren eran tres pantallas para «¿cómo está el tren?». */
      { ruta: '/por-tren', texto: 'Trenes', nota: 'Mi tren, toda la planta y comparar trenes', puede: con('om.mirar') },
      { ruta: '/mis-camaras', texto: 'Cámaras', nota: 'Las cámaras del tren y cuáles no dan imagen', puede: con('om.mirar') },
      { ruta: '/cobertura', texto: 'Zonas críticas', nota: 'Zonas que no pueden quedarse sin imagen', puede: con('cobertura.mirar') },
      { ruta: '/dependencias', texto: 'Impacto de una caída', nota: 'Qué cae si cae un equipo', puede: con('om.mirar') },
    ],
  },
  {
    titulo: 'Mantenimiento',
    descripcion: 'Incidencias, órdenes y cómo se hace el trabajo.',
    icono: 'orden',
    pantallas: [
      { ruta: '/bandeja', texto: 'Mi bandeja', nota: 'Lo que espera una decisión hoy', puede: con('dashboard.read') },
      { ruta: '/incidents', texto: 'Incidencias', nota: 'Fallas reportadas y su estado', puede: con('incident.read') },
      /* Avance y Campañas son vistas de las mismas órdenes: pestañas de Órdenes. */
      { ruta: '/maintenance', texto: 'Órdenes', nota: 'Preventivo, correctivo, mejora, avance y campañas', puede: alguno('wo.read', 'om.mirar') },
      /* Cómo se trabaja, hojas de ruta, catálogo de fallas y mejoras propuestas:
         todo es «cómo se hace el trabajo». Antes estaban repartidos en dos módulos. */
      { ruta: '/guia', texto: 'Procedimientos', nota: 'Cómo se trabaja, hojas de ruta, catálogo de fallas y mejoras' },
      { ruta: '/gruas', texto: 'Grúas', nota: 'Inspección de cámaras de grúa', puede: con('wo.read') },
    ],
  },
  {
    titulo: 'Instalaciones',
    descripcion: 'Equipos nuevos: desde que se piden hasta que quedan montados.',
    icono: 'instalar',
    pantallas: [
      { ruta: '/instalaciones', texto: 'Instalaciones', nota: 'Pedidos, visitas y montaje', puede: con('asset.read') },
      /* Bloque 137 · Producción pide equipo nuevo. */
      { ruta: '/pedir-instalacion', texto: 'Pedir instalación', nota: 'Pedir una cámara o equipo nuevo',
        puede: (can) => can('om.mirar') && !can('asset.read') },
    ],
  },
  {
    titulo: 'Equipos',
    descripcion: 'Qué hay montado en planta y cómo está su ficha.',
    icono: 'activos',
    pantallas: [
      { ruta: '/assets', texto: 'Activos', nota: 'Fichas de todos los equipos y los retirados', puede: con('asset.read') },
      { ruta: '/mis-activos', texto: 'Mis activos', nota: 'Los equipos de tu tren', puede: con('activos.mirar') },
      { ruta: '/criticidad', texto: 'Criticidad', nota: 'A, B o C según el impacto', puede: alguno('asset.read', 'activos.mirar') },
      { ruta: '/access', texto: 'Acceso y altura', nota: 'Permisos y trabajo en altura', puede: con('access.read') },
      /* «Estado de la información» y «Calidad de datos» medían lo mismo: qué falta cargar. */
      { ruta: '/mapeo', texto: 'Calidad de la información', nota: 'Fichas por completar y datos que no cuadran', puede: con('asset.read') },
    ],
  },
  {
    titulo: 'Red y energía',
    descripcion: 'La cadena 220 V → switch → cámara: puertos, IP y cableado.',
    icono: 'puertos',
    pantallas: [
      /* Capacidad y Conexiones son los mismos puertos: libres y ocupados. */
      { ruta: '/capacidad', texto: 'Switches y puertos', nota: 'Puertos libres, PoE y qué está conectado', puede: alguno('red.read', 'infra.read', 'asset.read') },
      /* Puntos críticos es una vista del mismo mapa. */
      { ruta: '/mapa-de-red', texto: 'Mapa de red', nota: 'Red por gabinete y puntos críticos', puede: con('red.read') },
      { ruta: '/grabadores', texto: 'Grabadores', nota: 'NVR, canales y disco', puede: con('red.read') },
      { ruta: '/ipam', texto: 'Direcciones IP', nota: 'Direcciones IP y VLAN', puede: con('red.read') },
      { ruta: '/cableado', texto: 'Cableado', nota: 'Tendidos y rutas de cable', puede: con('infra.read') },
      { ruta: '/electricidad', texto: 'Electricidad', nota: 'Tableros, circuitos y UPS', puede: con('infra.read') },
      { ruta: '/monitoreo', texto: 'Monitoreo', nota: 'Equipos que no responden', puede: con('monitor.read') },
    ],
  },
  {
    titulo: 'Ubicaciones',
    descripcion: 'Dónde está cada cosa: árbol de planta, gabinetes y planos.',
    icono: 'ubicacion',
    pantallas: [
      { ruta: '/locations', texto: 'Árbol de planta', nota: 'Trenes, áreas y salas', puede: con('asset.read') },
      { ruta: '/cabinets', texto: 'Gabinetes', nota: 'Gabinetes y lo que llevan dentro', puede: con('asset.read') },
      { ruta: '/zonas', texto: 'Zonas vitales', nota: 'Zonas que exigen vigilancia', puede: con('location.read') },
      /* Bloque 176 · dibujar y trazar en el plano: sólo el Jefe de Mantenimiento. */
      { ruta: '/planos', texto: 'Planos', nota: 'Colocar equipos, zonas de riesgo y cableado', puede: todos('location.manage', 'wo.approve') },
    ],
  },
  {
    /* Antes «Repuestos», con «Almacén» dentro: el módulo se llama como lo que es. */
    titulo: 'Almacén',
    descripcion: 'Repuestos en stock y modelos que se quedan sin repuesto.',
    icono: 'inventario',
    pantallas: [
      { ruta: '/inventory', texto: 'Repuestos', nota: 'Stock, entradas, salidas y obsolescencia', puede: alguno('inventory.read', 'om.mirar') },
    ],
  },
  {
    /* Antes «Documentos», que no decía nada. Son los manuales y las normas
       de consulta; el catálogo de fallas pasó a Mantenimiento › Procedimientos. */
    titulo: 'Manuales y normas',
    descripcion: 'Manuales y planos de los equipos, y el estándar de rotulado.',
    icono: 'etiqueta',
    pantallas: [
      { ruta: '/documentos', texto: 'Manuales y planos', nota: 'Manuales y planos por equipo', puede: con('document.read') },
      { ruta: '/rotulado', texto: 'Estándar de rotulado', nota: 'Cómo se rotulan equipos y cables', puede: con('infra.read') },
    ],
  },
  {
    titulo: 'Indicadores',
    descripcion: 'Cómo va la gestión, y los datos para sacarlos a Excel.',
    icono: 'indicadores',
    pantallas: [
      /* Auditoría 20/10: lo que separa la gestión de Producción es `wo.read`. */
      { ruta: '/dashboard', texto: 'Dashboard', nota: 'Análisis, indicadores y exportar a Excel', puede: todos('dashboard.read', 'wo.read') },
    ],
  },
  {
    titulo: 'Ajustes',
    descripcion: 'Tu cuenta y la administración del sistema.',
    icono: 'usuarios',
    pantallas: [
      { ruta: '/mi-cuenta', texto: 'Mi cuenta', nota: 'Tus datos y tus sesiones' },
      { ruta: '/avisos', texto: 'Avisos', nota: 'Lo que el sistema te avisa' },
      /* Usuarios, roles, sesiones y equipos conocidos: «quién entra y con qué». */
      { ruta: '/users', texto: 'Usuarios y accesos', nota: 'Usuarios, roles, sesiones y equipos conocidos', puede: con('user.manage') },
      { ruta: '/audit', texto: 'Auditoría', nota: 'Quién hizo qué y cuándo', puede: con('audit.read') },
      { ruta: '/limpieza', texto: 'Limpieza', nota: 'Purgar datos de prueba', puede: con('asset.delete') },
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
  /* PRODUCCIÓN ENTRA AL MAPA — bloque 160. Es lo que pidió en la
     presentación («queremos un mapa») y el plan del 28/09 lo dice así. Si su
     zona todavía no tiene plano, el Mapa lo dice y ofrece «Mi tren» y
     «Mis cámaras»: no se queda en una pantalla vacía. */
  if (!can('wo.update') && (can('om.mirar') || can('activos.mirar'))) return '/mapa';
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

/**
 * ¿PUEDE ESTA PERSONA ABRIR ESTA RUTA? — bloque 171.
 *
 * El barrido por roles lo enseñó: si alguien llega a una pantalla que no está
 * en su menú (un enlace viejo, un marcador, una URL pasada por WhatsApp), la
 * pantalla se cargaba igual, pedía datos, recibía cuatro 403 y salía vacía con
 * el aviso «no tienes permiso». Parece que el sistema está roto.
 *
 * La regla sale de la MISMA tabla que pinta el menú, así que no puede
 * contradecirlo:
 *   · ruta de un módulo → la puede abrir si el menú se la enseña;
 *   · pestaña de una pantalla (Preventivo dentro de Órdenes) → si puede ver la
 *     pantalla madre y tiene el permiso de la pestaña;
 *   · cualquier otra (QR, Mi cuenta, Todos los módulos, rutas exentas) → sí:
 *     cada una se protege a sí misma.
 *
 * NO es la seguridad —el servidor ya dice que no—: es que la persona entienda
 * qué pasa en vez de ver una pantalla vacía.
 */
/* Rutas fuera del menú que siguen vivas (ver EXENTAS en verificar-menu): se
   llega por enlaces viejos. Con su permiso escrito para no cargarlas a ciegas. */
const SUELTAS: Record<string, Puede> = {
  '/predictive': con('wo.read'),
  '/trains': con('dashboard.read'),
  '/paradas': alguno('wo.read', 'om.mirar'),
};

export function puedeAbrir(ruta: string, can: Can, user: Usuario | null | undefined): boolean {
  const madre = padreDe(ruta);
  if (madre) {
    const p = pestanasDe(ruta).find((x) => x.ruta === ruta);
    if (p?.permiso && !can(p.permiso)) return false;
    if (p?.puede && !p.puede(can, user)) return false;
    return puedeAbrir(madre, can, user);
  }
  const m = MODULOS.find((x) => x.pantallas.some((p) => p.ruta === ruta));
  if (!m) return SUELTAS[ruta] ? SUELTAS[ruta](can, user) : true;
  return pantallasVisibles(m, can, user).some((p) => p.ruta === ruta);
}
