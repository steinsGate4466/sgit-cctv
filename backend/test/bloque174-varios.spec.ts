import * as fs from 'fs';
import * as path from 'path';
import { cabecerasDeRecorte, TOPE_LISTA_PANTALLA } from '../src/common/tope-de-filas';
import { INCIDENCIA_ABIERTA, WO_EN_CURSO } from '../src/common/asset-status';

const leer = (r: string) => fs.readFileSync(path.join(__dirname, '..', r), 'utf8');

describe('bloque 174 · listas con techo que lo dicen', () => {
  it('pone X-Total y X-Recortado', () => {
    const h: Record<string, string> = {};
    cabecerasDeRecorte({ setHeader: (k, v) => { h[k] = v; } }, 500, 812);
    expect(h).toEqual({ 'X-Total': '812', 'X-Recortado': '1' });
    cabecerasDeRecorte({ setHeader: (k, v) => { h[k] = v; } }, 12, 12);
    expect(h['X-Recortado']).toBe('0');
  });

  it.each([
    ['src/modules/access/access.service.ts', 'accessRequest.findMany'],
    ['src/modules/campanas/campanas.service.ts', 'campanaMapeo.findMany'],
    ['src/modules/procedimientos/procedimientos.service.ts', 'mejoraProcedimiento.findMany'],
  ])('%s lleva techo y cuenta el total', (archivo) => {
    const s = leer(archivo);
    expect(s).toContain('take: TOPE_LISTA_PANTALLA');
    expect(s).toContain('cabecerasDeRecorte(res');
  });

  it('el navegador puede leer el total (CORS expone las cabeceras)', () => {
    expect(leer('src/main.ts')).toMatch(/exposedHeaders:\s*\[[^\]]*'X-Total'/);
    expect(TOPE_LISTA_PANTALLA).toBeGreaterThanOrEqual(200);
  });
});

describe('bloque 174 · «sin servicio» por estado real', () => {
  it('el filtro usa las MISMAS listas que el estado efectivo de la ficha', () => {
    expect(WO_EN_CURSO).toEqual(['ABIERTA', 'EN_PROCESO', 'EN_ESPERA']);
    expect(INCIDENCIA_ABIERTA).toEqual(['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO']);
    const s = leer('src/modules/assets/assets.service.ts');
    const w = s.slice(s.indexOf('private whereDeListado('), s.indexOf('async findAll('));
    expect(w).toMatch(/q\.sinServicio/);
    expect(w).toMatch(/workOrders: \{ some: \{ status: \{ in: WO_EN_CURSO/);
    expect(w).toMatch(/incidents: \{ some: \{ status: \{ in: INCIDENCIA_ABIERTA/);
    expect(w).toMatch(/notIn: \['BAJA', 'STOCK'\]/);
  });

  it('options() trae el modo de la radio y el tren (AP del que cuelga, lo de tu zona primero)', () => {
    const s = leer('src/modules/assets/assets.service.ts');
    const o = s.slice(s.indexOf('async options('), s.indexOf('async options(') + 2000);
    expect(o).toMatch(/modoRadio: a\.wireless\?\.mode/);
    expect(o).toMatch(/tren: ctx\[a\.id\]\?\.trenCode/);
  });
});
