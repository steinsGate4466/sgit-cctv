import * as fs from 'fs';
import * as path from 'path';
import {
  avisoDelPuerto, esEnlace, exigirPoeDisponible, puedeIrAUnPuerto, validarCapacidad, vlanValida,
} from '../src/modules/network/reglas-de-puerto';

/* Bloque 173 · un puerto de switch: VLAN, PoE, qué se enchufa y la capacidad. */
describe('reglas de un puerto de switch', () => {
  it('VLAN: 1–4094 (802.1Q); vacío es null; 0, 4095 y 5000 no existen', () => {
    expect(vlanValida(undefined)).toBeNull();
    expect(vlanValida('')).toBeNull();
    expect(vlanValida(1)).toBe(1);
    expect(vlanValida('4094')).toBe(4094);
    for (const malo of [0, 4095, 5000, -1, 10.5, 'abc']) expect(() => vlanValida(malo)).toThrow(/1 y 4094/);
  });

  it('PoE: no se marca un puerto más de los que dice la ficha; sin dato, no se frena', () => {
    expect(() => exigirPoeDisponible({ marcarPoe: true, poeMarcadosEnOtros: 8, poePorts: 8, switchCode: 'SW' })).toThrow(/8 puertos PoE/);
    expect(() => exigirPoeDisponible({ marcarPoe: true, poeMarcadosEnOtros: 0, poePorts: 0, switchCode: 'SW' })).toThrow(/no tiene puertos PoE/);
    expect(() => exigirPoeDisponible({ marcarPoe: true, poeMarcadosEnOtros: 7, poePorts: 8, switchCode: 'SW' })).not.toThrow();
    expect(() => exigirPoeDisponible({ marcarPoe: true, poeMarcadosEnOtros: 50, poePorts: null, switchCode: 'SW' })).not.toThrow();
    expect(() => exigirPoeDisponible({ marcarPoe: false, poeMarcadosEnOtros: 99, poePorts: 0, switchCode: 'SW' })).not.toThrow();
  });

  it('qué va a un puerto: estructura, tableros, pantallas y fuentes no', () => {
    for (const t of ['CABINET', 'TABLERO_ELECTRICO', 'PANTALLA', 'PSU']) expect(puedeIrAUnPuerto(t)).toBe(false);
    for (const t of ['CAMERA', 'WIRELESS', 'NVR', 'SWITCH', 'ROUTER', 'PC']) expect(puedeIrAUnPuerto(t)).toBe(true);
  });

  it('un switch, router o firewall en el puerto es un ENLACE; una cámara no', () => {
    expect(esEnlace('SWITCH')).toBe(true);
    expect(esEnlace('FIREWALL')).toBe(true);
    expect(esEnlace('CAMERA')).toBe(false);
    expect(esEnlace(null)).toBe(false);
  });

  it('cámara o antena en un puerto sin PoE avisa (inyector o fuente); con PoE, no', () => {
    expect(avisoDelPuerto({ poe: false, tipoEquipo: 'CAMERA' })).toMatch(/inyector/);
    expect(avisoDelPuerto({ poe: false, tipoEquipo: 'WIRELESS' })).toMatch(/inyector/);
    expect(avisoDelPuerto({ poe: true, tipoEquipo: 'CAMERA' })).toBeNull();
    expect(avisoDelPuerto({ poe: false, tipoEquipo: 'NVR' })).toBeNull();
  });

  it('capacidad: 1–96 puertos, no menos que el mayor puerto usado, PoE ≤ puertos', () => {
    expect(validarCapacidad({ puertos: 24, poe: 16, mayorRegistrado: 3 })).toEqual({ portCount: 24, poePorts: 16 });
    expect(validarCapacidad({ puertos: '8', poe: '', mayorRegistrado: 0 })).toEqual({ portCount: 8, poePorts: null });
    expect(() => validarCapacidad({ puertos: 0, poe: null, mayorRegistrado: 0 })).toThrow(/entre 1 y 96/);
    expect(() => validarCapacidad({ puertos: 8, poe: null, mayorRegistrado: 12 })).toThrow(/puerto 12/);
    expect(() => validarCapacidad({ puertos: 8, poe: 9, mayorRegistrado: 0 })).toThrow(/de 0 a 8/);
  });

  /* Lo que el usuario vio: «no se guarda qué puertos se seleccionó». El servidor
     manda `numero`; la pantalla tiene que leer `numero`. */
  it('el servidor manda `numero` y la rejilla lee `numero` (sin tilde)', () => {
    const svc = fs.readFileSync(path.join(__dirname, '../src/modules/network/conexiones.service.ts'), 'utf8');
    expect(svc).toMatch(/numero: p\.portNumber/);
    const fe = path.join(__dirname, '../../frontend/src/components/SwitchYPuertos.tsx');
    if (fs.existsSync(fe)) {
      // Sin comentarios: el de cabecera CUENTA el fallo y cita `x.número`.
      const t = fs.readFileSync(fe, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      expect(t).toMatch(/p\.numero/);
      expect(t).not.toMatch(/\.número/);
    }
  });

  it('guardar y vaciar un puerto comprueban el ámbito del switch y sincronizan la ficha en una transacción', () => {
    const svc = fs.readFileSync(path.join(__dirname, '../src/modules/network/conexiones.service.ts'), 'utf8');
    const guardar = svc.slice(svc.indexOf('async guardarPuerto('), svc.indexOf('private async sincronizarFicha('));
    expect(guardar).toMatch(/switchDelAmbito\(/);
    expect(guardar).toMatch(/\$transaction/);
    expect(guardar).toMatch(/sincronizarFicha\(/);
    const vaciar = svc.slice(svc.indexOf('async vaciarPuerto('));
    expect(vaciar).toMatch(/switchDelAmbito\(/);
    expect(vaciar).toMatch(/sincronizarFicha\(/);
  });
});
