import * as fs from 'fs';
import * as path from 'path';
import {
  compararConPlantilla, estaDesfasado, informeDeDesfase, motivoParaNoPonerAlDia,
} from '../src/common/desfase-de-roles';

/* =============================================================================
   BLOQUE 96 · LOS ROLES QUE SE DESVÍAN DE SU PLANTILLA
   -----------------------------------------------------------------------------
   El usuario entró con «Jefe de línea (Producción)» y le salía media gestión
   del mantenimiento — y a la vez NO podía abrir una orden. Su rol llevaba
   bloques desviado y nadie se enteró: **las plantillas sólo se aplican al
   CREAR un rol** (bloque 90).

   Falla ABRIENDO, que es el peor modo: el rol se queda con permisos de más y
   no salta nada.
============================================================================= */

const raiz = path.join(__dirname, '..');
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8');

const PLANTILLAS = [
  { nombre: 'Jefe de línea (Producción)', permisos: ['om.mirar', 'incident.read', 'wo.create'] },
];
const rol = (extra: Partial<any> = {}) => ({
  id: 'r1', nombre: 'Jefe de línea (Producción)',
  permisos: ['om.mirar', 'incident.read', 'wo.create'],
  usuarios: 3, sistema: false, ...extra,
});

describe('El desfase de un rol contra su plantilla', () => {
  it('un rol que coincide no está desviado', () => {
    const d = compararConPlantilla(rol(), PLANTILLAS);
    expect(d.faltan).toEqual([]);
    expect(d.sobran).toEqual([]);
    expect(estaDesfasado(d)).toBe(false);
  });

  it('dice QUÉ le falta y QUÉ le sobra, no sólo que hay diferencias', () => {
    /* Es el caso real: tenía `wo.read` —el permiso ancho, que le abría toda la
       gestión— y le faltaba `om.mirar`, que es el acotado. */
    const d = compararConPlantilla(
      rol({ permisos: ['wo.read', 'incident.read', 'dashboard.read'] }), PLANTILLAS,
    );
    expect(d.sobran).toEqual(['dashboard.read', 'wo.read']);
    expect(d.faltan).toEqual(['om.mirar', 'wo.create']);
    expect(estaDesfasado(d)).toBe(true);
  });

  it('un rol SIN plantilla no se toca, y se dice por qué', () => {
    /* Puede ser un rol hecho a medida —y entonces está bien— o uno renombrado.
       Inventarle una plantilla sería aplicar los permisos equivocados: fallar
       diciendo «no sé» es aceptable, fallar adivinando no. */
    const d = compararConPlantilla(rol({ nombre: 'Rol inventado por el ingeniero' }), PLANTILLAS);
    expect(d.plantilla).toBeNull();
    expect(estaDesfasado(d)).toBe(false);
    expect(motivoParaNoPonerAlDia(d)).toContain('no coincide con ninguna plantilla');
  });

  it('no deja poner al día uno que ya está al día', () => {
    expect(motivoParaNoPonerAlDia(compararConPlantilla(rol(), PLANTILLAS)))
      .toContain('ya coincide');
  });

  it('el informe devuelve TODOS los roles, no sólo los rotos', () => {
    /* Una lista que sólo enseña problemas no deja ver los que no tienen
       plantilla — y ésos son justo los que hay que revisar a mano. */
    const informe = informeDeDesfase(
      [rol(), rol({ id: 'r2', nombre: 'A medida' }),
        rol({ id: 'r3', permisos: ['wo.read'] })],
      PLANTILLAS,
    );
    expect(informe).toHaveLength(3);
    expect(informe.filter((d) => estaDesfasado(d))).toHaveLength(1);
    expect(informe.filter((d) => d.plantilla === null)).toHaveLength(1);
  });

  it('el orden de los permisos no inventa un desfase', () => {
    /* Sin ordenar, dos listas con los mismos permisos en distinto orden
       saldrían como diferentes y el panel gritaría todos los días — y un panel
       que grita cuando no pasa nada se deja de leer (regla del bloque 9). */
    const d = compararConPlantilla(
      rol({ permisos: ['wo.create', 'om.mirar', 'incident.read'] }), PLANTILLAS,
    );
    expect(estaDesfasado(d)).toBe(false);
  });
});

describe('Cómo se aplica, que es donde está el riesgo', () => {
  const svc = leer('src/modules/roles/roles.service.ts');

  it('PASA POR `actualizar()`: no hay una segunda puerta a los permisos', () => {
    /* Si escribiera por su cuenta, el día que se añada una guarda alguien la
       pondría sólo en una de las dos. Así hereda todas: no dejar la planta sin
       administrador, no quitarte a ti mismo `user.manage`, la transacción, el
       `permisosVersion` del bloque 86 y la auditoría. */
    const m = svc.slice(svc.indexOf('async ponerAlDia'), svc.indexOf('async borrar'));
    expect(m).toContain('this.actualizar(id,');
    expect(m).not.toContain('rolePermission.deleteMany');
    expect(m).not.toContain('$transaction');
  });

  it('se niega antes de tocar nada si no hay con qué comparar', () => {
    const m = svc.slice(svc.indexOf('async ponerAlDia'), svc.indexOf('async borrar'));
    expect(m).toContain('motivoParaNoPonerAlDia');
    expect(m).toContain('BadRequestException(motivo)');
  });

  it('el endpoint lo cierra `role.manage` y el editor sale de la SESIÓN', () => {
    /* Si el editor viniera en el cuerpo, cualquiera podría poner al día un rol
       a nombre de otro y la auditoría dejaría de servir para lo que existe. */
    const c = leer('src/modules/roles/roles.controller.ts');
    const bloque = c.slice(c.indexOf("@Post(':id/poner-al-dia')"));
    expect(bloque).toContain("@RequirePermissions('role.manage')");
    expect(bloque).toContain('@CurrentUser()');
    expect(bloque).toContain('user?.userId');
  });

  it('«desfase» va declarada ANTES que la ruta con :id', () => {
    /* Si no, Nest lee la palabra como un identificador y devuelve un 404 que
       no explica nada. Es la regla del bloque 3 con `@Get('traducir')`. */
    const c = leer('src/modules/roles/roles.controller.ts');
    expect(c.indexOf("@Get('desfase')")).toBeLessThan(c.indexOf("@Patch(':id')"));
  });
});
