/* =============================================================================
   AUTOCHEQUEO AL ARRANCAR — bloque 44
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   La clase de fallo que más ha costado en este proyecto NO DA ERROR. Da números
   o pantallas que parecen correctas. Todos tienen la misma forma: dos sitios que
   deben decir lo mismo y nada los obliga.

     · La semilla y la base viva  -> el Jefe de Mantenimiento estuvo semanas sin
       `role.manage`: no podía abrir la pantalla de Roles y nadie se enteró,
       porque un permiso que falta no da error, sólo desaparece el menú.
     · El rótulo y el ámbito      -> dos formas de sacar «qué tren es» del mismo
       campo, y el diálogo de Usuarios contradiciéndose consigo mismo.
     · El esquema y el SQL        -> un índice sin declarar generó una migración
       que lo borraba, con fecha en medio del historial.

   Hay catorce verificadores para esta clase de error, y funcionan. Pero TODOS
   miran el REPOSITORIO: la semilla, el backend, el frontend, las migraciones.

   Hay una cuarta verdad que ninguno mira: LA BASE QUE ESTÁ CORRIENDO.

   Existe `scripts/diagnostico-roles.js`, pero hay que acordarse de ejecutarlo.
   Un control que depende de la memoria no es un control: el día que hizo falta
   —antes de sembrar en Pisco— ni siquiera estaba en la imagen de producción.

   =============================================================================
    QUÉ HACE Y QUÉ **NO** HACE
   =============================================================================
   Se ejecuta al arrancar el backend y compara lo que el código espera contra lo
   que la base tiene. Escribe lo que encuentra en el registro, con nivel ERROR
   para lo que rompe algo y AVISO para lo que conviene mirar.

   NO BLOQUEA EL ARRANQUE. Y eso es deliberado:

     Un autochequeo que tumba el servicio convierte un problema de datos en una
     caída de planta. Si mañana alguien renombra un rol y este chequeo aborta el
     arranque, Laminación se queda sin sistema por algo que no impedía trabajar.

     El objetivo no es impedir: es que DEJE DE SER SILENCIOSO. Un error en el
     registro de Railway se ve; un menú que falta, no.

   La única excepción son las cosas que ya impiden arrancar por su cuenta —como
   la clave de cifrado en producción— y de ésas se encarga quien las necesita,
   no este archivo.

   =============================================================================
    ESTE ARCHIVO NO SABE QUE EXISTE PRISMA
   =============================================================================
   Recibe una foto de la base ya leída y devuelve los hallazgos. Así la regla de
   «qué está mal» se prueba caso por caso con datos escritos a mano, sin montar
   una base de datos — igual que el resto de núcleos puros del sistema.
============================================================================= */

export type Gravedad = 'ERROR' | 'AVISO';

export interface Hallazgo {
  gravedad: Gravedad;
  /** Clave corta y estable, para poder buscarla en el registro. */
  clave: string;
  /** Qué pasa, en una frase. */
  que: string;
  /** Qué hacer. Sin esto, un hallazgo es una queja. */
  queHacer: string;
}

/** La foto de la base que hace falta para decidir. */
export interface FotoDeLaBase {
  /** Códigos de permiso que EXISTEN en la tabla de permisos. */
  permisosEnLaBase: string[];
  roles: Array<{
    nombre: string;
    permisos: string[];
    exigeAmbito: boolean;
    /** Cuántas personas tienen este rol. */
    usuarios: number;
    /** De ésas, cuántas NO tienen ningún tren asignado. */
    usuariosSinAmbito: number;
  }>;
  /** Ubicaciones de tipo TREN: su código y su sigla declarada. */
  trenes: Array<{ code: string; sigla: string | null }>;
  /** Cuántos activos hay dados de alta, sin contar los de baja. */
  activos: number;
}

/** Lo que el CÓDIGO espera encontrar. Se le pasa desde fuera, no se copia aquí. */
export interface LoQueEsperaElCodigo {
  /** Todos los permisos declarados en la semilla. */
  permisos: string[];
  /** Roles que la semilla marca como sectorizados. */
  rolesSectorizados: string[];
  /**
   * La terna que identifica al administrador. Si NADIE la reúne, nadie puede
   * administrar el sistema y sólo se sale tocando la base a mano.
   */
  permisosDeAdministrador: string[];
}

/**
 * El chequeo entero. Devuelve los hallazgos en orden de gravedad.
 *
 * Cada comprobación de aquí abajo corresponde a un fallo que YA PASÓ. No hay
 * ninguna inventada: un chequeo que nunca ha saltado por un motivo real acaba
 * siendo ruido que la gente aprende a ignorar, y entonces también ignora los
 * que importan.
 */
export function autochequeo(
  base: FotoDeLaBase,
  esperado: LoQueEsperaElCodigo,
): Hallazgo[] {
  const h: Hallazgo[] = [];

  /* -------------------------------------------------------------------------
     BASE VACÍA: no se dice nada y se sale.
     Una base recién creada todavía no ha corrido la semilla, así que TODO
     estaría mal. Llenar el registro de errores en el primer arranque enseña a
     no leerlo. */
  if (base.roles.length === 0) {
    return [{
      gravedad: 'AVISO',
      clave: 'BASE_SIN_SEMBRAR',
      que: 'La base no tiene roles: todavía no se ha ejecutado la semilla.',
      queHacer: 'Ejecuta `npm run prisma:seed` una vez.',
    }];
  }

  /* --- 1. PERMISOS QUE EL CÓDIGO CONOCE Y LA BASE NO TIENE ------------------
     Es el fallo del bloque 34 exactamente: `role.manage` se añadió a la semilla
     y la base sembrada antes no lo tenía. El sistema arranca igual; lo único
     que pasa es que el menú de Roles desaparece para todo el mundo. */
  const enLaBase = new Set(base.permisosEnLaBase);
  const faltan = esperado.permisos.filter((p) => !enLaBase.has(p));
  if (faltan.length) {
    h.push({
      gravedad: 'ERROR',
      clave: 'PERMISOS_QUE_FALTAN',
      que: `La base no tiene ${faltan.length} permiso(s) que el código sí exige: ${faltan.join(', ')}.`,
      queHacer: 'Las pantallas que dependen de ellos no se ven para NADIE. '
        + 'Ejecuta la semilla para crearlos.',
    });
  }

  /* --- 2. NADIE PUEDE ADMINISTRAR EL SISTEMA -------------------------------
     Si ningún rol reúne la terna, no hay forma de arreglar nada desde la
     interfaz: sólo se sale tocando la base a mano. */
  const hayAdministrador = base.roles.some((r) =>
    esperado.permisosDeAdministrador.every((p) => r.permisos.includes(p)));
  if (!hayAdministrador) {
    h.push({
      gravedad: 'ERROR',
      clave: 'SIN_ADMINISTRADOR',
      que: `Ningún rol reúne ${esperado.permisosDeAdministrador.join(' + ')}.`,
      queHacer: 'Nadie puede administrar usuarios ni roles desde la aplicación. '
        + 'Ejecuta la semilla, o concede esos permisos a mano en la base.',
    });
  }

  /* --- 3. ROLES SECTORIZADOS CON GENTE QUE NO VE NADA ----------------------
     El efecto secundario del bloque 42, y el que más rápido se nota en planta:
     al marcar un rol como sectorizado, quien no tenga tren asignado deja de
     ver TODO. Es lo pedido, pero tiene que ser visible. */
  for (const r of base.roles) {
    if (!r.exigeAmbito || r.usuariosSinAmbito === 0) continue;
    h.push({
      gravedad: 'ERROR',
      clave: 'SECTORIZADO_SIN_TREN',
      que: `«${r.nombre}» está sectorizado y ${r.usuariosSinAmbito} de sus `
        + `${r.usuarios} usuario(s) no tienen tren asignado: no ven NADA.`,
      queHacer: 'Asígnales su tren en Usuarios → Cambiar. '
        + 'Hasta entonces la aplicación les sale vacía.',
    });
  }

  /* --- 4. ROL MARCADO EN EL CÓDIGO Y NO EN LA BASE, O AL REVÉS -------------
     La semilla escribe `exigeAmbito` al actualizar, así que un desfase aquí
     significa que alguien lo cambió a mano o que la semilla no se ha ejecutado
     desde que se declaró. En los dos casos la sectorización no está aplicada y
     nadie lo sabría. */
  const debenSectorizar = new Set(esperado.rolesSectorizados);
  for (const r of base.roles) {
    if (debenSectorizar.has(r.nombre) && !r.exigeAmbito) {
      h.push({
        gravedad: 'ERROR',
        clave: 'SECTORIZACION_PERDIDA',
        que: `«${r.nombre}» debería estar sectorizado y en la base no lo está: `
          + 'sus usuarios están viendo la planta entera.',
        queHacer: 'Ejecuta la semilla. Si alguien lo desmarcó a propósito, '
          + 'quítalo de ROLES_SECTORIZADOS para que deje de avisar.',
      });
    }
  }

  /* --- 5. TRENES SIN SIGLA DECLARADA ---------------------------------------
     Bloque 43. Sin sigla, el rótulo la deduce cortando el código por el último
     guion. Funciona mientras todos los trenes se llamen igual, y se rompe en
     silencio en cuanto uno no. */
  const sinSigla = base.trenes.filter((t) => !t.sigla || !t.sigla.trim());
  if (sinSigla.length) {
    h.push({
      gravedad: 'AVISO',
      clave: 'TREN_SIN_SIGLA',
      que: `${sinSigla.length} tren(es) sin sigla declarada: ${sinSigla.map((t) => t.code).join(', ')}.`,
      queHacer: 'El rótulo la deduce del código y puede salir mal. '
        + 'Decláralas en Ubicaciones.',
    });
  }

  /* --- 6. SIGLAS REPETIDAS -------------------------------------------------
     Dos trenes con la misma sigla hacen que el ámbito de uno alcance al otro.
     Es una fuga de información silenciosa, justo lo que el bloque 42 vino a
     cerrar. */
  const vistas = new Map<string, string[]>();
  for (const t of base.trenes) {
    const s = (t.sigla || '').trim().toUpperCase();
    if (!s) continue;
    vistas.set(s, [...(vistas.get(s) || []), t.code]);
  }
  for (const [sigla, codigos] of vistas) {
    if (codigos.length > 1) {
      h.push({
        gravedad: 'ERROR',
        clave: 'SIGLA_REPETIDA',
        que: `La sigla «${sigla}» está en ${codigos.length} trenes: ${codigos.join(', ')}.`,
        queHacer: 'El ámbito de un tren alcanza al otro. Corrige una de las dos '
          + 'en Ubicaciones antes de que alguien vea una línea que no es suya.',
      });
    }
  }

  /* --- 7. LA PLANTA SIN CARGAR ---------------------------------------------
     No es un fallo, es un estado. Se dice porque explica por qué media
     aplicación sale en gris, y evita que alguien lo lea como avería. */
  if (base.activos === 0) {
    h.push({
      gravedad: 'AVISO',
      clave: 'SIN_ACTIVOS',
      que: 'No hay ningún activo cargado.',
      queHacer: 'Es normal antes del levantamiento. Las pantallas saldrán en '
        + '«sin datos», que es lo correcto: no es una avería.',
    });
  }

  // Los errores primero. Quien mire el registro con prisa ve lo que rompe algo.
  return h.sort((a, b) => (a.gravedad === b.gravedad ? 0 : a.gravedad === 'ERROR' ? -1 : 1));
}

/**
 * El resumen de una línea, para que el registro sea legible de un vistazo.
 * Sin esto hay que leer todos los hallazgos para saber si hay algo grave.
 */
export function resumirChequeo(h: Hallazgo[]): string {
  const errores = h.filter((x) => x.gravedad === 'ERROR').length;
  const avisos = h.length - errores;
  if (!h.length) return 'Autochequeo: la base coincide con lo que el código espera.';
  if (!errores) return `Autochequeo: sin errores, ${avisos} aviso(s).`;
  return `Autochequeo: ${errores} ERROR(ES) y ${avisos} aviso(s). `
    + 'Hay cosas que NO funcionan y no van a dar ningún mensaje al usuario.';
}
