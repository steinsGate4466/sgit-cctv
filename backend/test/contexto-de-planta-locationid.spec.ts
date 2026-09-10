import * as fs from 'fs';
import * as path from 'path';
import {
  EtapaDelCatalogo, UbicacionDelArbol, calcularContexto,
} from '../src/common/plant-context';

/* =============================================================================
   BLOQUE 102 · LA CÁMARA QUE EXISTÍA EN UNA PANTALLA Y NO EN LA OTRA
   -----------------------------------------------------------------------------
   El usuario abrió las dos pantallas y le dijeron cosas contrarias del MISMO
   tren:

       «Por tren»     ->  Tren 1: 2 cámaras · 1 antena · 6 activos
       «Mis cámaras»  ->  Tren 1: «todavía no tiene cámaras cargadas»

   La causa era una consulta que pedía `location` —el objeto— y no
   `locationId` —la clave foránea—. Con `select:` Prisma trae SÓLO lo pedido,
   así que el recorrido del árbol no arrancaba y no había tren.

   Estas pruebas fijan las TRES cosas que impiden que vuelva.
============================================================================= */

const leer = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* Un árbol mínimo de planta: TREN 1 -> Zona, y la cámara colgando de la zona. */
const ARBOL = new Map<string, UbicacionDelArbol>([
  ['loc-tren', {
    id: 'loc-tren', code: 'AASA-PISCO-T1', name: 'Tren 1 (Laminación)',
    type: 'TREN', parentId: null, siglaTren: 'T1',
  }],
  ['loc-zona', {
    id: 'loc-zona', code: 'AASA-PISCO-T1-Z1', name: 'Púlpito de control',
    type: 'ZONA', parentId: 'loc-tren',
  }],
]);
const ETAPAS = new Map<string, EtapaDelCatalogo>();
const AHORA = new Date('2026-09-10T12:00:00Z').getTime();

describe('El recorrido del árbol depende de `locationId`', () => {
  it('con `locationId` encuentra el tren', () => {
    const ctx = calcularContexto(
      { id: 'cam-1', criticality: 'MEDIA', locationId: 'loc-zona' },
      ARBOL, ETAPAS, AHORA,
    );
    expect(ctx.trenCode).toBe('AASA-PISCO-T1');
    expect(ctx.trenSigla).toBe('T1');
  });

  it('funciona también si la cámara cuelga DIRECTAMENTE del tren', () => {
    /* Es el caso real de la planta del usuario: en su captura los activos
       salen bajo un nodo que se llama igual que el tren. */
    const ctx = calcularContexto(
      { id: 'cam-2', criticality: 'MEDIA', locationId: 'loc-tren' },
      ARBOL, ETAPAS, AHORA,
    );
    expect(ctx.trenCode).toBe('AASA-PISCO-T1');
  });

  it('SIN `locationId` no hay tren — y así es como la pantalla salía vacía', () => {
    /* ESTE es el bug, reproducido. `null` es lo que llegaba de hecho cuando la
       consulta se dejaba el campo (`undefined` se comporta igual en la guarda).
       Un activo en STOCK da lo mismo, y eso es CORRECTO: la diferencia entre
       «no cuelga de ningún sitio» y «no se preguntó» no la puede ver el
       cálculo. Por eso el arreglo tiene que estar en el TIPO, no aquí. */
    const ctx = calcularContexto(
      { id: 'cam-3', criticality: 'MEDIA', locationId: null },
      ARBOL, ETAPAS, AHORA,
    );
    expect(ctx.trenCode).toBeNull();
  });

  it('y con el tren a null, el filtro por tren descarta la cámara', () => {
    /* La consecuencia exacta: así es como `camaras-caidas` se quedaba en cero.
       Se reproduce el filtro tal cual está en el servicio. */
    const ctx = calcularContexto(
      { id: 'cam-4', criticality: 'MEDIA', locationId: null },
      ARBOL, ETAPAS, AHORA,
    );
    const pasaElFiltro = (ctx.trenCode || '').toUpperCase()
      .includes('AASA-PISCO-T1'.toUpperCase());
    expect(pasaElFiltro).toBe(false);
  });
});

describe('Lo que impide que el bug vuelva', () => {
  it('`ActivoLike.locationId` es OBLIGATORIO, sin interrogación', () => {
    /* Con `locationId?:` una consulta que se lo deje COMPILA, y entonces la
       pantalla sale vacía sin un solo error. La interrogación era el bug. */
    const fuente = leer('src/common/plant-context.ts');
    const i = fuente.indexOf('interface ActivoLike');
    const cuerpo = fuente.slice(i, fuente.indexOf('}', i) + 1);
    expect(cuerpo).toContain('locationId: string | null');
    expect(cuerpo).not.toMatch(/locationId\s*\?\s*:/);
  });

  it('la consulta de «Mis cámaras» pide `locationId`', () => {
    /* EL ANCLA SE BUSCA DESDE LA CONSULTA HACIA ADELANTE, no desde el
       principio del archivo. La primera versión de esta prueba hacía
       `indexOf('computeEffectiveStatuses')` a secas y devolvía CADENA VACÍA:
       ese nombre aparece antes, en la línea del `import`. Una prueba que se
       cae señalando un import es un falso positivo, y es exactamente la regla
       del bloque 77 —«antes de anclar, comprobar que el ancla es ÚNICA»—
       aplicada a una prueba en vez de a una edición. */
    const svc = leer('src/modules/dashboard/camaras-caidas.service.ts');
    const desde = svc.indexOf('asset.findMany');
    const hasta = svc.indexOf('computeEffectiveStatuses', desde);
    expect(desde).toBeGreaterThan(0);
    expect(hasta).toBeGreaterThan(desde);
    expect(svc.slice(desde, hasta)).toContain('locationId: true');
  });

  it('NINGUNA llamada pasa su lista con `as any`', () => {
    /* Ese `as any` es lo que tuvo al compilador callado. Había DIECINUEVE.
       Se comprueba sobre el ARGUMENTO, no sobre el `.catch(() => ({} as any))`
       que va después y es legítimo. */
    const dir = path.join(__dirname, '..', 'src');
    const malos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const c = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'generated' && e.name !== 'node_modules') recorrer(c);
        } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
          const t = fs.readFileSync(c, 'utf8');
          for (const m of t.matchAll(/resolverContextoDePlanta\s*\(\s*[^,]+,\s*([^)]*?)\)/g)) {
            if (/\bas\s+any\b/.test(m[1])) malos.push(path.relative(dir, c));
          }
        }
      }
    };
    recorrer(dir);
    expect(malos).toEqual([]);
  });
});
