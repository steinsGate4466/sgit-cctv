import { CUPO_LOGIN, CUPO_RENOVAR, estadoInicial, evaluar } from '../src/common/freno';
import * as fs from 'fs';
import * as path from 'path';
import { esRotacionConcurrente, GRACIA_MS } from '../src/modules/auth/rotacion';

/**
 * Bloque 170 — «se sale de la página aunque esté trabajando».
 * Dos peticiones que renuevan con el mismo token casi a la vez NO son un robo.
 */
describe('rotación de refresh · robo o lote concurrente', () => {
  const ahora = Date.parse('2026-10-08T12:00:00Z');
  const hace = (ms: number) => new Date(ahora - ms);

  it('sesión sin revocar: no aplica', () => {
    expect(esRotacionConcurrente({ revocadaEn: null, motivoRevocacion: null }, ahora)).toBe(false);
    expect(esRotacionConcurrente(null, ahora)).toBe(false);
  });

  it('rotada hace 100 ms por renovación: es la otra petición del lote, NO un robo', () => {
    expect(esRotacionConcurrente({ revocadaEn: hace(100), motivoRevocacion: 'rotado' }, ahora)).toBe(true);
  });

  it('rotada justo antes del margen: todavía se acepta', () => {
    expect(esRotacionConcurrente({ revocadaEn: hace(GRACIA_MS - 1), motivoRevocacion: 'rotado' }, ahora)).toBe(true);
  });

  it('rotada hace más del margen: reutilización de verdad, se cierra todo', () => {
    expect(esRotacionConcurrente({ revocadaEn: hace(GRACIA_MS), motivoRevocacion: 'rotado' }, ahora)).toBe(false);
    expect(esRotacionConcurrente({ revocadaEn: hace(10 * 60_000), motivoRevocacion: 'rotado' }, ahora)).toBe(false);
  });

  it('cerrada por el usuario, por contraseña o por robo: NUNCA hay margen', () => {
    for (const motivo of ['cierre de sesión', 'cerradas por el usuario', 'token reutilizado', 'cambio de contraseña']) {
      expect(esRotacionConcurrente({ revocadaEn: hace(50), motivoRevocacion: motivo }, ahora)).toBe(false);
    }
  });

  it('una fecha en el futuro (reloj descuadrado) no abre la puerta', () => {
    expect(esRotacionConcurrente({ revocadaEn: new Date(ahora + 5000), motivoRevocacion: 'rotado' }, ahora)).toBe(false);
  });
});


/**
 * Bloque 170 — en planta todos salen por la MISMA IP pública (NAT). El cupo de
 * renovar es de toda la planta, no de una persona.
 */
describe('freno de /auth/refresh · la planta entera detrás de una IP', () => {
  it('300 personas renovando cada 15 min (100 cada 5 min) caben con holgura', () => {
    let estado = estadoInicial();
    const t0 = Date.parse('2026-10-08T12:00:00Z');
    // 200 en 200 s: el doble de lo esperado para 300 personas, sin bloquear.
    for (let i = 0; i < 200; i++) {
      const v = evaluar(estado, CUPO_RENOVAR, t0 + i * 1000);
      expect(v.permitido).toBe(true);
      estado = v.estado;
    }
  });

  it('el castigo de renovar es corto y más ancho que el del login', () => {
    expect(CUPO_RENOVAR.maximo).toBeGreaterThanOrEqual(10 * CUPO_LOGIN.maximo);
    expect(CUPO_RENOVAR.castigoMs).toBeLessThanOrEqual(60_000);
  });

  it('el controlador usa CUPO_RENOVAR en /refresh, no el del login', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/modules/auth/auth.controller.ts'), 'utf8');
    const bloque = src.slice(src.indexOf('@Post(\'refresh\')') - 120, src.indexOf('@Post(\'refresh\')'));
    expect(bloque).toContain('CUPO_RENOVAR');
    expect(bloque).not.toContain('CUPO_LOGIN');
  });
});
