import * as fs from 'fs';
import * as path from 'path';
import {
  TOPE_FILAS_EXCEL, avisoDeRecorte, lineaDePortada, medirRecorte,
} from '../src/common/tope-de-filas';
import { ExportacionService } from '../src/modules/exportacion/exportacion.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

/* =============================================================================
   BLOQUE 101 · EL TECHO QUE SE DICE
   -----------------------------------------------------------------------------
   Lo que estas pruebas fijan de verdad NO es que haya un `take`: es que **el
   recorte se DIGA**. Un Excel con las últimas veinte mil órdenes entregado
   como «todas las órdenes» es peor que uno lento, porque quien lo abre cuenta
   filas, saca un total y lo lleva a una reunión.

   Y se prueba ABRIENDO el archivo, no leyendo el código. Es la lección de los
   bloques 84 y 95: un `addRow` con la clave equivocada escribe celdas vacías y
   pasa el typecheck tan contento.
============================================================================= */

const leer = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('Medir el recorte', () => {
  it('no hay recorte cuando se trajo todo', () => {
    const r = medirRecorte(120, 120);
    expect(r.recortado).toBe(false);
    expect(avisoDeRecorte(r, 'órdenes')).toBeNull();
    expect(lineaDePortada('Órdenes', r)).toBeNull();
  });

  it('hay recorte cuando falta aunque sea UNA fila', () => {
    const r = medirRecorte(20_000, 20_001);
    expect(r.recortado).toBe(true);
    expect(avisoDeRecorte(r, 'órdenes')).toContain('RECORTADA');
  });

  it('el aviso dice los DOS números y cuántas faltan', () => {
    /* «Recortado» a secas no permite saber si falta una fila o el 90 % del
       histórico, y esa diferencia decide si el archivo sirve o no. */
    const aviso = avisoDeRecorte(medirRecorte(20_000, 53_400), 'órdenes')!;
    expect(aviso).toContain('20,000');
    expect(aviso).toContain('53,400');
    expect(aviso).toContain('33,400');   // las que faltan
  });

  it('el aviso dice QUÉ se conservó y QUÉ HACER', () => {
    /* Sin «las más recientes», quien busca lo de este mes no sabe si lo tiene.
       Y sin decir qué hacer es un reproche, no un aviso (bloque 78). */
    const aviso = avisoDeRecorte(medirRecorte(20_000, 53_400), 'órdenes')!;
    expect(aviso).toContain('MÁS RECIENTES');
    expect(aviso.toLowerCase()).toContain('periodos');
  });

  it('el tope es un número razonable y está en un solo sitio', () => {
    expect(TOPE_FILAS_EXCEL).toBeGreaterThanOrEqual(10_000);
    expect(TOPE_FILAS_EXCEL).toBeLessThan(1_048_576);   // el límite de una hoja
  });
});

/* -----------------------------------------------------------------------------
   El Excel de verdad. Se arma, se escribe a un búfer y se VUELVE A ABRIR.
----------------------------------------------------------------------------- */
function prismaFalso(cuantasHay: number) {
  const filas = Array.from({ length: Math.min(cuantasHay, TOPE_FILAS_EXCEL) }, (_, i) => ({
    id: `id-${i}`, code: `OM-2026-${String(i).padStart(4, '0')}`,
    type: 'PREVENTIVO', status: 'CERRADA', activity: 'Limpieza de óptica',
    scheduledDate: new Date('2026-09-01'), executedDate: new Date('2026-09-02'),
    createdAt: new Date('2026-09-01'), zone: 'Zona 1', assetId: 'a1',
    asset: { assetCode: 'AA-CAM-T1-001' },
    location: { name: 'Tren 1 — Púlpito' },
    technician: { fullName: 'Carlos Tito' },
    closedBy: { fullName: 'Jefe de Mantenimiento' },
  }));
  return {
    workOrder: {
      findMany: jest.fn(async (args: any) => filas.slice(0, args?.take ?? filas.length)),
      count: jest.fn(async () => cuantasHay),
    },
  } as any;
}

/** Abre el búfer y devuelve el texto de todas las celdas de una hoja. */
async function textoDeLaHoja(buffer: Buffer, nombre: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(nombre);
  expect(ws).toBeTruthy();
  const textos: string[] = [];
  ws.eachRow((fila: any) => {
    fila.eachCell({ includeEmpty: false }, (celda: any) => {
      if (typeof celda.value === 'string') textos.push(celda.value);
    });
  });
  return textos;
}

describe('La hoja de Órdenes del Excel', () => {
  it('cuando NO se recortó, no lleva ningún aviso', async () => {
    /* Un aviso permanente se deja de leer, y entonces no sirve el día que sí
       hay recorte (regla de los verificadores desde el bloque 9). */
    const svc = new ExportacionService(prismaFalso(50));
    const { buffer } = await svc.exportarUna('ordenes');
    const textos = await textoDeLaHoja(buffer, 'Órdenes');
    expect(textos.some((t) => t.includes('RECORTADA'))).toBe(false);
    expect(textos).toContain('OM-2026-0000');
  });

  it('cuando SÍ se recortó, el aviso está DENTRO del archivo', async () => {
    /* Éste es el corazón del bloque. Sin esta fila, el archivo miente. */
    const svc = new ExportacionService(prismaFalso(53_400));
    const { buffer } = await svc.exportarUna('ordenes');
    const textos = await textoDeLaHoja(buffer, 'Órdenes');
    const aviso = textos.find((t) => t.includes('RECORTADA'));
    expect(aviso).toBeTruthy();
    expect(aviso).toContain('53,400');
  });

  it('pide a la base SÓLO el tope, y pide el recuento aparte', async () => {
    /* El `count` es lo que hace posible decir la verdad: sin él, veinte mil de
       veinte mil y veinte mil de doscientas mil se ven idénticos. */
    const prisma = prismaFalso(53_400);
    const svc = new ExportacionService(prisma);
    await svc.exportarUna('ordenes');
    expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: TOPE_FILAS_EXCEL }),
    );
    expect(prisma.workOrder.count).toHaveBeenCalled();
  });

  it('el aviso va al FINAL y no rompe la cabecera', async () => {
    /* Arriba rompería el `autoFilter` y el panel congelado: la primera fila de
       datos tiene que seguir siendo la 2, o los filtros de Excel dejan de
       funcionar — y una hoja con los filtros rotos se abandona. */
    const svc = new ExportacionService(prismaFalso(53_400));
    const { buffer } = await svc.exportarUna('ordenes');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Órdenes');
    expect(ws.getRow(1).getCell(1).value).toBe('Código');
    expect(String(ws.getRow(2).getCell(1).value)).toMatch(/^OM-2026-/);
    expect(String(ws.getRow(ws.rowCount).getCell(1).value)).toContain('RECORTADA');
  });
});

describe('Cómo quedó montado', () => {
  const svc = leer('src/modules/exportacion/exportacion.service.ts');

  it('las hojas se arman ANTES de la portada', () => {
    /* Si la portada se escribiera primero no podría avisar de las hojas
       recortadas, y quien abre el libro por la portada y no baja a Órdenes no
       vería el aviso nunca. Una advertencia a la que hay que llegar no es una
       advertencia (bloque 62). */
    const todo = svc.slice(svc.indexOf('async exportarTodo'));
    expect(todo.indexOf('hojas.push')).toBeLessThan(todo.indexOf("addWorksheet('LÉEME')"));
    expect(todo).toContain('lineaDePortada');
  });

  it('las hojas que NO crecen con el uso no llevan tope', () => {
    /* Activos, gabinetes, ubicaciones, almacén y red crecen con el tamaño de
       la PLANTA, no con los años. Un tope ahí no gana nada y podría esconder
       una fila, que es peor. */
    const activos = svc.slice(svc.indexOf('hojaActivos'), svc.indexOf('hojaGabinetes'));
    expect(activos).not.toContain('TOPE_FILAS_EXCEL');
    expect(activos).not.toContain('recorte');
  });

  it('las DOS hojas que crecen llevan tope y recuento', () => {
    for (const [metodo, hasta, modelo] of [
      ['hojaOrdenes', 'hojaIncidencias', 'workOrder'],
      ['hojaIncidencias', 'hojaRepuestos', 'incident'],
    ] as const) {
      const trozo = svc.slice(svc.indexOf(metodo), svc.indexOf(hasta));
      expect(trozo).toContain('take: TOPE_FILAS_EXCEL');
      expect(trozo).toContain(`${modelo}.count()`);
      expect(trozo).toContain('medirRecorte');
    }
  });
});
