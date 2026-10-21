import * as fs from 'fs';
import * as path from 'path';
import { alcanceDe } from '../src/modules/dashboard/bandeja.service';

/* =============================================================================
   AUDITORÍA 20/10/2026 · PERMISOS Y ÁMBITO
   -----------------------------------------------------------------------------
   Salió abriendo el software pantalla por pantalla con tres perfiles, no
   leyendo código. Tres fallos, los tres «no rompen nada»:

   1. Producción veía el Dashboard, los Indicadores y Exportar. Se abrían con
      `dashboard.read`, que los dos cargos de Producción llevan para «Mi tren» y
      «Mi bandeja». La capacidad que separa la gestión es `wo.read` (bloque 80).
   2. Las listas filtraban con `filtroDeUbicaciones` —lo que PIDE la pantalla—
      y no con `filtroConAmbito` —lo que el USUARIO puede ver—. Un jefe de
      línea sin tren veía las incidencias, la criticidad y la bandeja de toda
      la planta.
   3. El técnico sin `credential.read` recibía la IP principal de cada equipo:
      la ficha borraba la de las extensiones y dejaba la del activo.

   Estas pruebas leen el CÓDIGO: el fallo típico aquí no es escribir mal el
   permiso, es volver a poner el filtro viejo «porque es más corto».
============================================================================= */

const raiz = path.join(__dirname, '..', 'src', 'modules');
const leer = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

/** Decoradores de UNA ruta: del ancla a la llave del método. */
function ruta(fuente: string, ancla: string): string {
  const i = fuente.indexOf(ancla);
  if (i < 0) throw new Error(`No encuentro ${ancla}`);
  return fuente.slice(i, fuente.indexOf('{', fuente.indexOf('(', i + ancla.length)));
}

describe('Auditoría 20/10 · 1 · la gestión pide `dashboard.read` Y `wo.read`', () => {
  const DASH = leer('dashboard/dashboard.controller.ts');
  for (const r of ["@Get('kpis')", "@Get('overview')", "@Get('root-causes')"]) {
    it(`Dashboard ${r}`, () => {
      expect(ruta(DASH, r)).toContain("@RequirePermissions('dashboard.read', 'wo.read')");
    });
  }

  it('la bandeja NO cambia: es la capa de resumen de todos (§57.5)', () => {
    expect(ruta(DASH, "@Get('bandeja')")).toContain("@RequirePermissions('dashboard.read')");
  });

  it('ninguna lectura de Indicadores se abre sólo con `dashboard.read`', () => {
    const IND = leer('indicadores/indicadores.controller.ts');
    expect(IND).not.toMatch(/@RequirePermissions\('dashboard\.read'\)/);
    expect(IND.match(/@RequirePermissions\('dashboard\.read', 'wo\.read'\)/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('Exportar: el catálogo pide las dos, y la topología pide `red.read`', () => {
    const EXP = leer('exportacion/exportacion.controller.ts');
    expect(ruta(EXP, '@Get()')).toContain("@RequirePermissions('dashboard.read', 'wo.read')");
    expect(EXP).toMatch(/@Get\('red'\)[^\n]*@RequirePermissions\('red\.read'\)/);
  });
});

describe('Auditoría 20/10 · 2 · las listas se cruzan con el tren del USUARIO', () => {
  const casos: [string, string][] = [
    ['incidents/incidents.service.ts', 'async findAll('],
    ['assets/assets.service.ts', 'async findAll('],
    ['assets/assets.service.ts', 'async avanceMapeo('],
    ['assets/cables.service.ts', 'async findAll('],
    ['cabinets/cabinets.service.ts', 'async list('],
    ['cabinets/cabinets.service.ts', 'async qrSheet('],
    ['criticidad/criticidad.service.ts', 'async resumen('],
  ];
  for (const [archivo, metodo] of casos) {
    it(`${archivo} · ${metodo}`, () => {
      const s = leer(archivo);
      const i = s.indexOf(metodo);
      expect(i).toBeGreaterThan(-1);
      const fin = s.indexOf('\n  async ', i + metodo.length);
      const cuerpo = s.slice(i, fin > i ? fin : undefined);
      expect(cuerpo).toContain('filtroConAmbito(this.prisma, userId');
      expect(cuerpo).not.toContain('filtroDeUbicaciones(');
    });
  }

  it('los controladores pasan el usuario de la SESIÓN', () => {
    expect(leer('incidents/incidents.controller.ts')).toContain('this.incidents.findAll(q, user?.userId)');
    expect(leer('criticidad/criticidad.controller.ts')).toContain('}, user?.userId)');
    expect(leer('assets/assets.controller.ts')).toContain('this.assets.findAll(q, sensitive, user?.userId)');
    expect(leer('cabinets/cabinets.controller.ts')).toContain('this.cabinets.list({ tren, etapa }, user?.userId)');
    expect(leer('assets/cables.controller.ts')).toContain('this.cables.findAll(q, user?.userId)');
  });

  describe('la bandeja', () => {
    it('sin ámbito, filtros vacíos: toda la planta, como antes', () => {
      expect(alcanceDe(null)).toEqual({ ambito: null, om: {}, inc: {}, enActivo: {} });
    });

    it('con ámbito, la orden es del tren por su equipo O por su ubicación', () => {
      const a = alcanceDe({ in: ['L1'] });
      expect(a.om).toEqual({ OR: [{ asset: { locationId: { in: ['L1'] } } }, { locationId: { in: ['L1'] } }] });
      expect(a.inc).toEqual({ asset: { locationId: { in: ['L1'] } } });
    });

    it('«nada» es nada: `{ in: [] }` no se convierte en «todo»', () => {
      expect(alcanceDe({ in: [] }).inc).toEqual({ asset: { locationId: { in: [] } } });
    });

    it('cada consulta de órdenes e incidencias lleva el filtro', () => {
      const B = leer('dashboard/bandeja.service.ts');
      const sinFiltro = [...B.matchAll(/this\.prisma\.(workOrder|incident)\.(findMany|count|groupBy)\(\{[\s\S]*?where: \{([^\n]*)/g)]
        .filter((m) => !/\.\.\.(om|inc)\b/.test(m[3]));
      expect(sinFiltro.map((m) => m[0].slice(0, 90))).toEqual([]);
    });
  });
});

describe('Auditoría 20/10 · 3 · la IP sólo con `credential.read`', () => {
  const S = leer('assets/assets.service.ts');

  it('la lista quita `ipAddress` cuando no es sensible', () => {
    const i = S.indexOf('if (!sensitive) {');
    expect(S.slice(i, i + 400)).toContain('ipAddress: _ip');
  });

  it('la ficha borra también la IP general del activo', () => {
    expect(S).toMatch(/if \(!sensitive\) \{\s*asset\.ipAddress = null;/);
  });

  it('el informe PDF sólo imprime la IP con permiso', () => {
    expect(S).toContain("if (sensitive) line('IP'");
    expect(leer('assets/assets.controller.ts')).toContain('this.assets.buildReport(id, sensitive)');
  });
});
