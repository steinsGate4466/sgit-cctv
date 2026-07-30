// ============================================================================
//  AGREGADOS DE INFRAESTRUCTURA POR TREN — funciones puras, sin base de datos.
//
//  POR QUÉ ESTE ARCHIVO EXISTE APARTE
//  Todo lo que se cuenta aquí (disponibilidad, tramos fuera de norma, canales
//  libres, avance del mapeo) son reglas de negocio que hay que poder probar
//  sin levantar Postgres. El servicio de al lado solo consulta y llama a esto.
//
//  UNA SOLA VERDAD SOBRE EL TREN
//  El tren de un activo NO se lee de la columna `Asset.train`. Se deriva
//  subiendo el árbol de ubicaciones (plant-context.ts). Antes había dos
//  fuentes: el mapeo derivaba del árbol y el tablero leía la columna, así que
//  el mismo activo podía contar en el Tren 2 en una pantalla y en
//  "SIN_ASIGNAR" en la otra. Aquí solo entra el tren derivado.
// ============================================================================

/** Límite de tramo horizontal Ethernet. Más allá, el enlace falla intermitente. */
export const LIMITE_TRAMO_M = 90;

const FUERA_DE_OPERACION = ['BAJA', 'STOCK'];
const AFECTADO = ['FUERA_SERVICIO', 'CON_INCIDENCIA'];

export interface ActivoAgregable {
  id: string;
  type: string;
  /** Estado EFECTIVO (el mismo que ve el usuario), no el crudo de la tabla. */
  estado: string;
  criticidad: string;
  /** Código del tren derivado del árbol. null = el activo no cuelga de un tren. */
  trenCode: string | null;
  /** true si su ficha del tipo está incompleta (mapeo pendiente). */
  fichaIncompleta: boolean;
  /** true si no tiene ni una foto cargada. */
  sinFoto: boolean;
  /** true si cuelga de un tren pero nadie le asignó etapa del proceso. */
  sinEtapa: boolean;
}

export interface ContadoresTren {
  trenCode: string | null;
  total: number;
  enOperacion: number;
  operativos: number;
  enMantenimiento: number;
  conIncidencia: number;
  fueraServicio: number;
  camaras: number;
  camarasCaidas: number;
  criticos: number;
  disponibilidad: number;
  disponibilidadCamaras: number;
  // --- mapeo
  fichasCompletas: number;
  fichasIncompletas: number;
  avanceMapeoPct: number;
  sinFoto: number;
  sinEtapa: number;
}

/** Porcentaje con un decimal. Sin datos devuelve 100: no hay nada malo que reportar. */
export function pct(ok: number, total: number): number {
  if (total <= 0) return 100;
  return Number(((ok / total) * 100).toFixed(1));
}

/**
 * Contadores en cero para un tren sin activos.
 *
 * Se exporta porque el servicio necesita devolver la MISMA forma cuando un
 * tren todavía no tiene nada colgado. Antes usaba
 * `contarPorTren([]).get(code)`, que devuelve undefined y hacía que la
 * pantalla recibiera un objeto sin claves. Un tren recién creado tiene que
 * salir con ceros, no vacío.
 */
export function contadoresVacios(trenCode: string | null): ContadoresTren {
  return vacio(trenCode);
}

function vacio(trenCode: string | null): ContadoresTren {
  return {
    trenCode, total: 0, enOperacion: 0,
    operativos: 0, enMantenimiento: 0, conIncidencia: 0, fueraServicio: 0,
    camaras: 0, camarasCaidas: 0, criticos: 0,
    disponibilidad: 100, disponibilidadCamaras: 100,
    fichasCompletas: 0, fichasIncompletas: 0, avanceMapeoPct: 0,
    sinFoto: 0, sinEtapa: 0,
  };
}

/**
 * Cuenta un lote de activos agrupándolos por tren derivado.
 *
 * La clave `null` agrupa los activos que NO cuelgan de ningún tren. Eso NO es
 * un cuarto tren: es trabajo pendiente de asignar en el árbol, y el tablero lo
 * muestra como aviso, no como pestaña.
 */
export function contarPorTren(activos: ActivoAgregable[]): Map<string | null, ContadoresTren> {
  const acc = new Map<string | null, ContadoresTren>();

  for (const a of activos) {
    const clave = a.trenCode;
    if (!acc.has(clave)) acc.set(clave, vacio(clave));
    const g = acc.get(clave)!;

    g.total++;
    if (a.criticidad === 'CRITICA') g.criticos++;

    // El mapeo se mide sobre TODO lo que existe, incluido el stock: una cámara
    // en almacén sin ficha también está sin mapear.
    if (a.fichaIncompleta) g.fichasIncompletas++;
    else g.fichasCompletas++;
    if (a.sinFoto) g.sinFoto++;
    if (a.sinEtapa) g.sinEtapa++;

    // La disponibilidad se calcula solo sobre lo que está EN OPERACIÓN.
    // Contar una cámara dada de baja como "no disponible" hundiría el
    // indicador con equipos que ya nadie espera que funcionen.
    if (FUERA_DE_OPERACION.includes(a.estado)) continue;

    g.enOperacion++;
    if (a.estado === 'OPERATIVO') g.operativos++;
    else if (a.estado === 'MANTENIMIENTO') g.enMantenimiento++;
    else if (a.estado === 'CON_INCIDENCIA') g.conIncidencia++;
    else if (a.estado === 'FUERA_SERVICIO') g.fueraServicio++;

    if (a.type === 'CAMERA') {
      g.camaras++;
      if (AFECTADO.includes(a.estado)) g.camarasCaidas++;
    }
  }

  for (const g of acc.values()) {
    const afectados = g.conIncidencia + g.fueraServicio;
    g.disponibilidad = pct(g.enOperacion - afectados, g.enOperacion);
    g.disponibilidadCamaras = pct(g.camaras - g.camarasCaidas, g.camaras);
    // El avance del mapeo sí es 0 cuando no hay nada hecho: aquí un 100 por
    // defecto mentiría diciendo que un tren sin empezar está terminado.
    g.avanceMapeoPct = g.total > 0
      ? Number(((g.fichasCompletas / g.total) * 100).toFixed(1))
      : 0;
  }

  return acc;
}

// ---------------------------------------------------------------- CABLEADO

export interface TramoAgregable {
  id: string;
  metros: number | null;
  estimado: boolean;
  blindado: boolean;
  estado: string;
  /** Tren derivado del extremo del tramo. */
  trenCode: string | null;
}

export interface ContadoresCable {
  tramos: number;
  metros: number;
  metrosMedidos: number;
  metrosEstimados: number;
  sinMedir: number;
  fueraNorma: number;
  fueraNormaMedidos: number;
  sinBlindaje: number;
  danados: number;
}

export function contarCables(tramos: TramoAgregable[]): ContadoresCable {
  const c: ContadoresCable = {
    tramos: 0, metros: 0, metrosMedidos: 0, metrosEstimados: 0,
    sinMedir: 0, fueraNorma: 0, fueraNormaMedidos: 0, sinBlindaje: 0, danados: 0,
  };
  for (const t of tramos) {
    if (t.estado === 'RETIRADO') continue; // un tramo retirado ya no es planta
    c.tramos++;
    if (t.metros == null) {
      c.sinMedir++;
    } else {
      c.metros += t.metros;
      if (t.estimado) c.metrosEstimados += t.metros;
      else c.metrosMedidos += t.metros;
      if (t.metros > LIMITE_TRAMO_M) {
        c.fueraNorma++;
        // Se separan los MEDIDOS porque sobre un metraje estimado a ojo no se
        // puede justificar un recableado: primero hay que ir a medirlo.
        if (!t.estimado) c.fueraNormaMedidos++;
      }
    }
    if (!t.blindado) c.sinBlindaje++;
    if (t.estado === 'DANADO' || t.estado === 'A_REEMPLAZAR') c.danados++;
  }
  c.metros = Number(c.metros.toFixed(1));
  c.metrosMedidos = Number(c.metrosMedidos.toFixed(1));
  c.metrosEstimados = Number(c.metrosEstimados.toFixed(1));
  return c;
}

// ------------------------------------------------------------ CANALES NVR

export interface GrabadorAgregable {
  id: string;
  assetCode: string;
  canales: number | null;
  /** Cuántas cámaras tienen este grabador asignado. */
  camarasAsignadas: number;
  trenCode: string | null;
}

export interface ContadoresCanales {
  grabadores: number;
  canalesTotales: number;
  canalesOcupados: number;
  canalesLibres: number;
  /** Grabadores sin el número de canales declarado: no se sabe si queda sitio. */
  sinCapacidadDeclarada: number;
  /** Grabadores con más cámaras asignadas que canales: hay un dato mal puesto. */
  sobreasignados: number;
}

export function contarCanales(grabadores: GrabadorAgregable[]): ContadoresCanales {
  const c: ContadoresCanales = {
    grabadores: grabadores.length, canalesTotales: 0, canalesOcupados: 0,
    canalesLibres: 0, sinCapacidadDeclarada: 0, sobreasignados: 0,
  };
  for (const g of grabadores) {
    c.canalesOcupados += g.camarasAsignadas;
    if (g.canales == null || g.canales <= 0) {
      c.sinCapacidadDeclarada++;
      continue;
    }
    c.canalesTotales += g.canales;
    const libres = g.canales - g.camarasAsignadas;
    if (libres < 0) {
      // No se restan canales negativos del total libre: eso escondería el
      // error de dato detrás de un número que parece correcto.
      c.sobreasignados++;
    } else {
      c.canalesLibres += libres;
    }
  }
  return c;
}
