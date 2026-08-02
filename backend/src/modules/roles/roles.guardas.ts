/**
 * LAS REGLAS QUE PROTEGEN LA ADMINISTRACIÓN DE SÍ MISMA.
 *
 * Función pura, probada aparte. Aquí no se toca la base de datos: se decide.
 *
 * El fallo que esto evita es concreto y no tiene vuelta atrás desde la
 * aplicación: el ingeniero se quita a sí mismo 'role.manage' o 'user.manage',
 * guarda, y ya no puede volver a entrar a la administración. Nadie puede
 * devolvérselo, porque quien podía era él. Sólo se sale por base de datos.
 */

export interface RolAEditar {
  id: string;
  nombre: string;
  sistema: boolean;
  usuarios: number;
}

export interface ContextoDeEdicion {
  /** Rol al que pertenece quien está editando. */
  rolDelEditorId: string;
  /** Cuántos usuarios activos conservarían 'user.manage' tras el cambio. */
  administradoresRestantes: number;
}

/**
 * Devuelve el motivo por el que NO se puede guardar, o null si se puede.
 * Se devuelve el motivo en castellano porque va directo a la pantalla: un
 * "403 Forbidden" no le dice al ingeniero qué hizo mal.
 */
export function motivoParaNoGuardar(
  rol: RolAEditar,
  permisosNuevos: string[],
  ctx: ContextoDeEdicion,
): string | null {
  const set = new Set(permisosNuevos);

  if (permisosNuevos.length === 0) {
    return 'Un rol sin ningún permiso deja a sus usuarios sin poder ni entrar. Marca al menos "Ver tableros".';
  }

  // Te estás editando a ti mismo y te quitas la llave de la administración.
  if (rol.id === ctx.rolDelEditorId) {
    if (!set.has('role.manage')) {
      return 'Estás quitándole "Administrar roles" a tu propio rol. Si guardas, pierdes el acceso a esta pantalla y nadie podrá devolvértelo.';
    }
    if (!set.has('user.manage')) {
      return 'Estás quitándole "Administrar usuarios" a tu propio rol. Si guardas, no podrás volver a crear ni editar cuentas.';
    }
  }

  // El último administrador del sistema no se puede desarmar.
  if (!set.has('user.manage') && ctx.administradoresRestantes === 0) {
    return 'Este es el último rol que puede administrar usuarios. Si le quitas ese permiso, el sistema se queda sin nadie que pueda crear cuentas.';
  }

  return null;
}

/** Motivo por el que un rol no se puede borrar, o null. */
export function motivoParaNoBorrar(rol: RolAEditar): string | null {
  if (rol.sistema) {
    return `"${rol.nombre}" vino con el sistema y no se borra. Si no lo usas, quítale los usuarios y déjalo vacío.`;
  }
  if (rol.usuarios > 0) {
    return `"${rol.nombre}" lo están usando ${rol.usuarios} usuario(s). Cámbialos de rol antes de borrarlo: si se borra, se quedan sin poder entrar.`;
  }
  return null;
}

/**
 * Normaliza el ámbito de trenes que llega de la pantalla.
 * ARRAY VACÍO = TODOS LOS TRENES. Esa es la convención en toda la aplicación
 * y está escrita también en la migración; cambiarla en un solo sitio dejaría
 * a gente sin ver nada o viéndolo todo, según el lado por el que se rompa.
 */
export function normalizarAmbito(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const limpio = valor
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  // Sin repetidos y en orden estable, para que la auditoría no registre
  // cambios donde no los hubo.
  return [...new Set(limpio)].sort();
}

/**
 * ¿Este usuario puede ver algo de este tren?
 * Ámbito vacío = sin restricción.
 */
export function alcanzaElTren(ambito: string[], trenCode: string | null | undefined): boolean {
  if (!ambito || ambito.length === 0) return true;
  if (!trenCode) return false; // sin ubicar: sólo lo ve quien lo ve todo
  return ambito.includes(trenCode.toUpperCase());
}
