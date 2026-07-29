jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { evaluarFicha, resumenPendiente } from '../src/common/asset-completeness';
import { validarFicha, fichaParaCrear, fichaParaActualizar, sinFichas } from '../src/modules/assets/asset-spec.util';
import { CablesService, LIMITE_TRAMO_M } from '../src/modules/assets/cables.service';

/**
 * Camino crítico del Bloque 2: que la ficha del tipo se escriba en la tabla
 * correcta, y que el sistema sepa qué le falta a cada activo.
 *
 * Si una ficha se guarda en la tabla equivocada, el mapa de canales y el
 * diagrama muestran datos imposibles y nadie se entera hasta meses después.
 */
describe('Bloque 2 — fichas por tipo, completitud y tramos de cable', () => {

  // ------------------------------------------------- ficha correcta por tipo
  describe('validación de la ficha', () => {
    it('acepta la ficha que corresponde al tipo', () => {
      expect(validarFicha('CAMERA', { camera: { nvrChannel: 3 } })).toBe('camera');
      expect(validarFicha('SWITCH', { switchDev: { portCount: 24 } })).toBe('switchDev');
      expect(validarFicha('PANTALLA', { screen: { label: 'Pantalla 1' } })).toBe('screen');
    });

    it('rechaza una ficha que no corresponde al tipo', () => {
      // Sin esto se podría crear un switch con ficha de cámara: quedaría una
      // fila en asset_cameras apuntando a un activo de tipo SWITCH.
      expect(() => validarFicha('SWITCH', { camera: { nvrChannel: 3 } }))
        .toThrow(/no corresponde/i);
    });

    it('rechaza dos fichas a la vez', () => {
      expect(() => validarFicha('CAMERA', { camera: {}, nvr: {} }))
        .toThrow(/más de una ficha/i);
    });

    it('acepta un activo SIN ficha: se completa después', () => {
      expect(validarFicha('CAMERA', {})).toBeNull();
    });

    it('rechaza ficha en un tipo que aún no la tiene', () => {
      expect(() => validarFicha('UPS', { camera: {} })).toThrow(/no tiene ficha propia/i);
    });
  });

  describe('traducción a Prisma', () => {
    it('arma el bloque create anidado', () => {
      const r = fichaParaCrear('CAMERA', { camera: { nvrChannel: 7, nvrName: 'Grúa 2' } });
      expect(r).toEqual({ camera: { create: { nvrChannel: 7, nvrName: 'Grúa 2' } } });
    });

    it('NO crea una ficha vacía', () => {
      // Una fila vacía haría creer que la ficha ya está hecha y falsearía el
      // porcentaje de completitud.
      expect(fichaParaCrear('CAMERA', { camera: {} })).toEqual({});
      expect(fichaParaCrear('CAMERA', { camera: { nvrName: '' } })).toEqual({});
    });

    it('usa upsert al editar, porque el activo pudo crearse sin ficha', () => {
      const r: any = fichaParaActualizar('NVR', { nvr: { channels: 64 } });
      expect(r.nvr.upsert.create).toEqual({ channels: 64 });
      expect(r.nvr.upsert.update).toEqual({ channels: 64 });
    });

    it('sinFichas deja solo los campos del activo base', () => {
      const r = sinFichas({ assetCode: 'AA-1', type: 'CAMERA', camera: { nvrChannel: 1 } });
      expect(r).toEqual({ assetCode: 'AA-1', type: 'CAMERA' });
    });
  });

  // ------------------------------------------------------------ completitud
  describe('qué le falta a la ficha', () => {
    const camara = (over: any = {}) => ({
      type: 'CAMERA', locationId: 'l1', photos: [{ id: 'p1' }],
      brand: 'Hikvision', model: 'DS-2CD', serialNumber: 'X1',
      camera: { nvrId: 'n1', nvrChannel: 3, nvrName: 'Grúa 2', ipAddress: '192.168.1.5' },
      ...over,
    });

    it('una cámara completa no tiene faltantes clave', () => {
      const c = evaluarFicha(camara());
      expect(c.incompleta).toBe(false);
      expect(c.faltanClave).toHaveLength(0);
    });

    it('sin nombre en el grabador queda marcada como incompleta', () => {
      // Es el idioma común con el púlpito: sin él, cada reporte por radio hay
      // que traducirlo a mano.
      const c = evaluarFicha(camara({ camera: { nvrId: 'n1', nvrChannel: 3 } }));
      expect(c.incompleta).toBe(true);
      expect(c.faltanClave.map((f) => f.campo)).toContain('camera.nvrName');
    });

    it('sin ubicación ni foto queda incompleta', () => {
      const c = evaluarFicha(camara({ locationId: null, photos: [] }));
      const campos = c.faltanClave.map((f) => f.campo);
      expect(campos).toContain('locationId');
      expect(campos).toContain('photos');
    });

    it('cuenta 0 como valor VÁLIDO, no como vacío', () => {
      // Un switch sin PoE tiene 0 puertos PoE: es una respuesta, no un hueco.
      const c = evaluarFicha({
        type: 'SWITCH', locationId: 'l1', photos: [{ id: 'p' }], cabinetId: 'c1',
        switchDev: { mgmtIp: '10.0.0.5', mgmtNetwork: 'GESTION', portCount: 24, poePorts: 0 },
      });
      expect(c.faltanOtros.map((f) => f.campo)).not.toContain('switchDev.poePorts');
    });

    it('cuenta false como valor VÁLIDO en "¿tenemos credenciales?"', () => {
      // "No tenemos la clave" es justamente el dato que alimenta la campaña
      // de barrido de antenas. Tratarlo como vacío lo haría invisible.
      const c = evaluarFicha({
        type: 'WIRELESS', locationId: 'l1', photos: [{ id: 'p' }],
        wireless: { mode: 'SUSCRIPTOR', hasCredentials: false },
      });
      expect(c.faltanClave.map((f) => f.campo)).not.toContain('wireless.hasCredentials');
    });

    it('el porcentaje refleja lo realmente lleno', () => {
      const vacia = evaluarFicha({ type: 'CAMERA' });
      expect(vacia.porcentaje).toBe(0);
      expect(evaluarFicha(camara()).porcentaje).toBeGreaterThan(60);
    });

    it('el resumen para el QR nombra lo que falta', () => {
      const r = resumenPendiente(camara({ photos: [] }));
      expect(r).toMatch(/Foto de referencia/);
    });

    it('el resumen es null cuando no falta nada clave', () => {
      expect(resumenPendiente(camara())).toBeNull();
    });

    it('un tipo sin ficha propia solo pide los campos comunes', () => {
      const c = evaluarFicha({ type: 'UPS', locationId: 'l1', photos: [{ id: 'p' }] });
      expect(c.incompleta).toBe(false);
    });
  });

  // ------------------------------------------------------ tramos de cable
  describe('avisos del tramo de cable', () => {
    it('avisa cuando el tramo excede los 90 m', () => {
      // Es la causa del "se arregla y vuelve a fallar": pasado el límite el
      // enlace no falla, falla A VECES.
      const a = CablesService.avisos({ meters: 118, metersEstimated: false });
      expect(a.join(' ')).toMatch(/excede el límite/i);
    });

    it('aclara si la medida es estimada, para no decidir sobre un dato inventado', () => {
      const a = CablesService.avisos({ meters: 118, metersEstimated: true });
      expect(a.join(' ')).toMatch(/estimada/i);
    });

    it('avisa cuando está al límite aunque no lo pase', () => {
      const a = CablesService.avisos({ meters: 85 });
      expect(a.join(' ')).toMatch(/al límite/i);
    });

    it('no avisa nada en un tramo corto y correcto', () => {
      expect(CablesService.avisos({ meters: 30, route: 'CANALETA', shielded: true })).toHaveLength(0);
    });

    it('avisa por cable sin blindaje en bandeja', () => {
      // En una siderúrgica, un UTP junto a fuerza se llena de ruido: mismo
      // síntoma intermitente e irreproducible.
      const a = CablesService.avisos({ meters: 40, route: 'BANDEJA', shielded: false });
      expect(a.join(' ')).toMatch(/blindaje/i);
    });

    it('avisa por cobre a la intemperie en zona costera', () => {
      const a = CablesService.avisos({ meters: 20, route: 'INTEMPERIE', category: 'CAT6' });
      expect(a.join(' ')).toMatch(/salinidad/i);
    });

    it('no se queja de la fibra a la intemperie', () => {
      const a = CablesService.avisos({ meters: 20, route: 'INTEMPERIE', category: 'FIBRA_MONOMODO' });
      expect(a.join(' ')).not.toMatch(/salinidad/i);
    });

    it('el límite de norma es 90 m', () => {
      expect(LIMITE_TRAMO_M).toBe(90);
    });

    it('un tramo sin medida no genera aviso de longitud', () => {
      // No se inventa un aviso sobre un dato que no existe.
      expect(CablesService.avisos({ meters: null }).join(' ')).not.toMatch(/límite/i);
    });
  });
});
