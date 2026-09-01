import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 82 · CORTAR EL ACCESO DE INMEDIATO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE, textual del usuario:

       «Imagina que nos hackeen, podemos quitarle el acceso rápidamente.»

   Y NO SE PODÍA. Los permisos viajaban dentro del token de sesión, que dura 15
   minutos, y la validación no consultaba la base para nada: desactivar a
   alguien no le cortaba el acceso.

   -----------------------------------------------------------------------------
   POR QUÉ SE LEE EL CÓDIGO Y NO SE LEVANTA EL SERVIDOR

   Probarlo de verdad exigiría arrancar Nest, crear un usuario, sacarle un
   token, cortarlo y reintentar. Eso es una prueba lenta que acaba desactivada
   — y lo que hay que fijar aquí no es el resultado de una llamada: es que las
   DECISIONES sigan escritas.

   El fallo típico en esto no es escribirlo mal: es que alguien quite el guard
   «un momento para probar» y no lo vuelva a poner. Eso sí lo caza esto.
============================================================================= */

const raiz = path.join(__dirname, '..', 'src');
const leer = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8');
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

const GUARD = sinComentarios(leer(path.join('common', 'guards', 'acceso-vigente.guard.ts')));
const APP = sinComentarios(leer('app.module.ts'));
const USERS = sinComentarios(leer(path.join('modules', 'users', 'users.service.ts')));
const CTRL = sinComentarios(leer(path.join('modules', 'users', 'users.controller.ts')));
const AUTH = sinComentarios(leer(path.join('modules', 'auth', 'auth.service.ts')));
const JWT = sinComentarios(leer(path.join('modules', 'auth', 'jwt.strategy.ts')));

describe('Bloque 82 — el corte de acceso', () => {
  describe('El contador viaja en el token y se comprueba', () => {
    it('el token se emite CON la versión de permisos dentro', () => {
      /* Sin esto no hay nada que comparar y el guard deja pasar todo. */
      expect(AUTH).toMatch(/pv:\s*\(user as any\)\.permisosVersion/);
    });

    it('la estrategia JWT lo pasa adelante', () => {
      expect(JWT).toMatch(/pv:\s*payload\.pv/);
    });

    it('el guard compara contra la BASE, no contra el token', () => {
      /* Comparar el token consigo mismo sería un guard que siempre dice que
         sí. La consulta a la base es TODO el mecanismo. */
      expect(GUARD).toMatch(/SELECT "permisosVersion", "active" FROM "users"/);
      expect(GUARD).toMatch(/e\.version !== user\.pv/);
    });

    it('un usuario desactivado se corta aunque su versión cuadre', () => {
      /* Son dos motivos distintos de corte y hay que comprobar los dos: se
         puede desactivar a alguien sin tocarle los permisos. */
      expect(GUARD).toMatch(/if \(!e\.activo\)/);
    });
  });

  describe('El guard está ENCHUFADO, y en su sitio', () => {
    it('está registrado como guard global', () => {
      expect(APP).toMatch(/useClass:\s*AccesoVigenteGuard/);
    });

    it('va DESPUÉS del JWT y ANTES de los permisos', () => {
      /* El orden no es estético: si a alguien se le acaba de quitar el rol, no
         tiene sentido comprobar qué permisos lleva su token — esos permisos ya
         no son suyos. */
      const jwt = APP.indexOf('useClass: JwtAuthGuard');
      const vig = APP.indexOf('useClass: AccesoVigenteGuard');
      const perm = APP.indexOf('useClass: PermissionsGuard');
      expect(jwt).toBeLessThan(vig);
      expect(vig).toBeLessThan(perm);
    });
  });

  describe('Qué sube el contador y qué NO', () => {
    it('cambiar el rol, desactivar o cambiar la contraseña SÍ', () => {
      expect(USERS).toMatch(/dto\.roleId !== undefined \|\| dto\.active !== undefined \|\| !!dto\.password/);
    });

    it('corregir el nombre NO tumba la sesión', () => {
      /* Sacar a alguien del sistema en mitad de una orden por haberle
         corregido un apellido hace que el software se perciba como inestable,
         y a la tercera vez la gente deja de fiarse. */
      expect(USERS).not.toMatch(/dto\.fullName[^;]*permisosVersion/);
    });

    it('desactivar CIERRA además sus sesiones', () => {
      /* Sin esto seguiría dentro con el token de refresco: subir el contador
         mata el token de acceso, pero no impide renovarlo. Media puerta. */
      const bloque = USERS.slice(USERS.indexOf('async deactivate'));
      expect(bloque.slice(0, 900)).toContain('sesion.updateMany');
    });
  });

  describe('Cortar el acceso hace las TRES cosas', () => {
    /* SE ACOTA AL MÉTODO, NO A UN NÚMERO DE CARACTERES.
       -------------------------------------------------------------------
       La primera versión miraba «los primeros 1.200 caracteres» y la ventana
       se comía el método SIGUIENTE (`deactivate`), que sí lleva
       `active: false` — así que la prueba de «cortar NO desactiva» fallaba
       señalando código que no era el suyo.

       Es el mismo fallo de las ventanas anchas del verificador 9 y del de
       etiquetas: cuanto más grande es la ventana, más cosas que no son lo
       que se busca acaba leyendo. Aquí se corta en el siguiente `async`. */
    const desde = USERS.indexOf('async cortarAcceso');
    const sig = USERS.indexOf('async ', desde + 10);
    const corte = USERS.slice(desde, sig > -1 ? sig : undefined);

    it('sube el contador', () => {
      expect(corte).toMatch(/permisosVersion:\s*\{\s*increment:\s*1\s*\}/);
    });

    it('revoca sus sesiones', () => {
      expect(corte).toContain('sesion.updateMany');
    });

    it('borra la caché para que el corte sea INMEDIATO', () => {
      /* Sin esto habría hasta 15 segundos de retraso. Con esto, el corte se
         nota en la siguiente petición. */
      expect(corte).toContain('AccesoVigenteGuard.olvidar');
    });

    it('las tres van juntas: hacer sólo una deja media puerta abierta', () => {
      const c = corte;
      expect(c.includes('increment') && c.includes('sesion.updateMany')
        && c.includes('olvidar')).toBe(true);
    });

    it('NO desactiva al usuario: son dos decisiones distintas', () => {
      /* Cortar una sesión sospechosa es urgente y reversible; dar de baja a
         una persona es administrativo. Juntarlas obligaría a elegir entre no
         cortar o cortar de más. */
      expect(corte).not.toMatch(/active:\s*false/);
    });
  });

  describe('Quién puede ver y cortar', () => {
    it('las tres rutas piden `user.manage`', () => {
      /* `user.read` no basta: la lista dice desde qué IP y qué aparato entra
         cada persona. Eso es información de seguridad, no de directorio. */
      for (const ancla of ["@Get('sesiones')", "@Delete('sesiones/:sesionId')", "@Post(':id/cortar-acceso')"]) {
        const i = CTRL.indexOf(ancla);
        expect([ancla, i > -1]).toEqual([ancla, true]);
        expect(CTRL.slice(i, i + 160)).toContain("@RequirePermissions('user.manage')");
      }
    });

    it('las rutas literales van ANTES de `:id`', () => {
      /* Regla del proyecto: si no, Nest lee «sesiones» como un identificador
         de usuario y el endpoint devuelve «no encontrado». */
      expect(CTRL.indexOf("@Get('sesiones')")).toBeLessThan(CTRL.indexOf("@Get(':id')"));
    });
  });

  describe('Las dos reglas que evitan tumbar la planta', () => {
    it('un token SIN contador PASA', () => {
      /* Los tokens vivos el día del despliegue se emitieron antes de que esto
         existiera. Rechazarlos echaría a todo el mundo a la vez, en mitad de
         un turno. En quince minutos el ciclo natural los renueva. */
      expect(GUARD).toMatch(/if \(user\.pv === undefined \|\| user\.pv === null\) return true/);
    });

    it('si la BASE no responde, PASA', () => {
      /* Defensa en profundidad, no única capa: el token sigue firmado y sin
         caducar. Un fallo de base de datos no puede dejar a la planta entera
         sin sistema. Misma decisión que el guard de ámbito del bloque 12.3. */
      expect(GUARD).toMatch(/if \(!fila\) return true/);
    });
  });
});
