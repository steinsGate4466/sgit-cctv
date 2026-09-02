import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 86 · CAMBIAR UN ROL LLEGA A QUIEN YA ESTABA DENTRO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE, textual del usuario:

     «Lo que me preocupa es que cuando actualizamos los roles, el rol Jefe de
      línea o cosas así NO SE ACTUALIZAN para usuarios ya creados. Eso me
      preocupa bastante.»

   Y tenía razón. Los permisos viajan DENTRO del token de sesión y
   `PermissionsGuard` los lee de ahí, no de la base. El bloque 82 creó el
   contador `permisosVersion` justo para poder matar los tokens de golpe...
   pero se cableó SÓLO a los cambios del USUARIO —rol, baja, contraseña—.
   **Editar el ROL no lo tocaba.**

   -----------------------------------------------------------------------------
   POR QUÉ ERA GRAVE, y no una molestia

   > **Fallaba ABIERTO.** Se le quitaba un permiso a «Jefe de línea» y las
   > cinco personas con ese rol seguían teniéndolo. El backend lo aceptaba
   > —el token decía que sí— y el ingeniero se quedaba creyendo que el cambio
   > estaba aplicado.

   Es el peor modo de fallar de un control de acceso: en silencio, y con quien
   hizo el cambio convencido de que funcionó.

   -----------------------------------------------------------------------------
   ERAN TRES PIEZAS, Y LAS TRES HACEN FALTA

     1. Al guardar el rol, subir `permisosVersion` de TODOS sus usuarios.
        Es lo que invalida los tokens en la siguiente petición.
     2. `/auth/me` devolver los permisos DE LA BASE, no los del token.
        Es lo que arregla el menú al recargar la página.
     3. Al renovar el token, guardar también el `user` que viene con él.
        Es lo que arregla el menú SIN recargar.

   Con una sola no basta: la 1 sin la 3 deja al servidor aplicando lo nuevo y
   a la pantalla enseñando lo viejo — opciones que dan 403 al pulsarlas.
============================================================================= */

const BACK = path.join(__dirname, '..', 'src');
const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (p: string) => fs.readFileSync(p, 'utf8');
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

const ROLES = sinComentarios(leer(path.join(BACK, 'modules', 'roles', 'roles.service.ts')));
const AUTH = sinComentarios(leer(path.join(BACK, 'modules', 'auth', 'auth.service.ts')));
const CLIENT = sinComentarios(leer(path.join(FRONT, 'api', 'client.ts')));

/** Acota al método, cortando en el siguiente `async`. Nunca a un número de
 *  caracteres: es el fallo que este proyecto lleva cazándose cinco veces. */
function metodo(fuente: string, nombre: string): string {
  const i = fuente.indexOf(nombre);
  if (i < 0) return '';
  const sig = fuente.indexOf('async ', i + nombre.length);
  return fuente.slice(i, sig > i ? sig : undefined);
}

describe('Bloque 86 — el cambio de rol llega a quien ya estaba dentro', () => {
  describe('1 · Guardar el rol invalida los tokens de su gente', () => {
    const actualizar = metodo(ROLES, 'async actualizar');

    it('sube permisosVersion de TODOS los usuarios del rol', () => {
      expect(actualizar).toMatch(/user\.updateMany/);
      expect(actualizar).toMatch(/roleId:\s*id/);
      expect(actualizar).toMatch(/permisosVersion:\s*\{\s*increment:\s*1\s*\}/);
    });

    it('va DENTRO de la misma transacción que los permisos', () => {
      /* Si se guardaran los permisos y fallara el contador, el rol quedaría
         cambiado y la gente seguiría con los de antes — el bug original, sólo
         que además invisible. Se comprueba que el `updateMany` cae entre el
         `$transaction([` y su cierre. */
      const t = actualizar.indexOf('$transaction([');
      const u = actualizar.indexOf('user.updateMany');
      const cierre = actualizar.indexOf('])', t);
      expect(t).toBeGreaterThan(-1);
      expect(u).toBeGreaterThan(t);
      expect(u).toBeLessThan(cierre);
    });

    it('vacía la caché del guard: si no, hasta 15 segundos de retraso', () => {
      expect(actualizar).toContain('AccesoVigenteGuard.olvidarTodo');
    });

    it('NO les cierra la sesión: cambiar un permiso no es dar de baja', () => {
      /* Revocar las sesiones echaría a cinco personas de la aplicación por
         haber tocado una casilla. El token de refresco sigue valiendo y la
         renovación es transparente. */
      expect(actualizar).not.toMatch(/sesion\.updateMany/);
    });
  });

  describe('2 · /auth/me devuelve los permisos DE LA BASE', () => {
    const perfil = metodo(AUTH, 'async perfil');

    it('los lee del rol, no del token', () => {
      /* Antes hacía `...delToken` y repartía los permisos del día que la
         persona inició sesión. Recargar la página no cambiaba nada. */
      expect(perfil).toMatch(/permissions:\s*\{\s*select/);
      expect(perfil).toMatch(/permissions:\s*u\?\.role/);
      expect(perfil).toMatch(/rp\.permission\.code/);
    });

    it('si la consulta falla, deja los del token en vez de vaciarlos', () => {
      /* Un menú en blanco por un fallo de lectura es peor que un menú algo
         desfasado: el servidor sigue decidiendo de verdad en cada petición. */
      expect(perfil).toMatch(/:\s*delToken\.permissions/);
    });
  });

  describe('3 · Al renovar el token, la pantalla se entera', () => {
    it('la renovación guarda también el usuario', () => {
      /* Sin esto, `can()` sigue leyendo la lista vieja de `sgit_user` y el
         menú no cambia hasta cerrar sesión — aunque el servidor ya aplique
         lo nuevo. Las dos caras confunden igual: opciones que dan 403 al
         pulsarlas, y opciones nuevas que no aparecen. */
      expect(CLIENT).toMatch(/if \(data\.user\) localStorage\.setItem\('sgit_user'/);
    });

    it('si la respuesta no trae usuario, NO se toca lo guardado', () => {
      /* Vaciarlo dejaría a la persona con el menú en blanco por un cambio de
         formato del servidor. */
      expect(CLIENT).toMatch(/if \(data\.user\)/);
    });
  });
});
