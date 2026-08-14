/* =============================================================================
   SEGURIDAD — límite de peticiones y política de contraseña (bloque 26)
   -----------------------------------------------------------------------------
   Las dos son funciones puras a propósito: son reglas que TI va a leer y
   discutir, y una regla que sólo se puede comprobar levantando el servidor no
   se discute, se acepta a ciegas.
============================================================================= */
import {
  ContadorDePeticiones, LIMITE_GENERAL, LIMITE_PESADO,
  claveDeOrigen, esRutaPesada,
} from '../src/common/limite-peticiones';
import { revisarPassword, LONGITUD_MINIMA } from '../src/common/politica-password';

describe('límite de peticiones', () => {
  it('deja pasar el uso normal', () => {
    const c = new ContadorDePeticiones();
    for (let i = 0; i < LIMITE_GENERAL.maximo; i++) {
      expect(c.consultar('ip:1.1.1.1', LIMITE_GENERAL, 1000)).toBeNull();
    }
  });

  it('corta al pasarse y dice cuántos segundos faltan', () => {
    const c = new ContadorDePeticiones();
    for (let i = 0; i < LIMITE_GENERAL.maximo; i++) c.consultar('ip:x', LIMITE_GENERAL, 1000);
    const espera = c.consultar('ip:x', LIMITE_GENERAL, 1000);
    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThanOrEqual(60);
  });

  it('la ventana se reinicia cuando pasa el minuto', () => {
    const c = new ContadorDePeticiones();
    for (let i = 0; i < LIMITE_GENERAL.maximo + 5; i++) c.consultar('ip:y', LIMITE_GENERAL, 1000);
    expect(c.consultar('ip:y', LIMITE_GENERAL, 1000)).not.toBeNull();
    // Un minuto y pico después.
    expect(c.consultar('ip:y', LIMITE_GENERAL, 62_000)).toBeNull();
  });

  it('un origen no consume el cupo de otro', () => {
    const c = new ContadorDePeticiones();
    for (let i = 0; i < LIMITE_GENERAL.maximo + 5; i++) c.consultar('u:ana', LIMITE_GENERAL, 1000);
    expect(c.consultar('u:ana', LIMITE_GENERAL, 1000)).not.toBeNull();
    expect(c.consultar('u:luis', LIMITE_GENERAL, 1000)).toBeNull();
  });

  it('lo pesado se corta mucho antes', () => {
    const c = new ContadorDePeticiones();
    for (let i = 0; i < LIMITE_PESADO.maximo; i++) {
      expect(c.consultar('u:ana', LIMITE_PESADO, 1000)).toBeNull();
    }
    expect(c.consultar('u:ana', LIMITE_PESADO, 1000)).not.toBeNull();
  });

  it('no acumula entradas muertas para siempre', () => {
    const c = new ContadorDePeticiones();
    for (let i = 0; i < 500; i++) c.consultar(`ip:10.0.0.${i}`, LIMITE_GENERAL, 1000);
    expect(c.tamano).toBe(500);
    // Pasada la ventana, la siguiente consulta limpia lo caducado.
    c.consultar('ip:nuevo', LIMITE_GENERAL, 200_000);
    expect(c.tamano).toBe(1);
  });

  it('cuenta por usuario cuando lo hay: toda la planta sale por la misma IP', () => {
    expect(claveDeOrigen('abc', '190.1.1.1')).toBe('u:abc');
    expect(claveDeOrigen(undefined, '190.1.1.1')).toBe('ip:190.1.1.1');
  });

  it('reconoce las rutas caras', () => {
    expect(esRutaPesada('/maintenance/123/informe')).toBe(true);
    expect(esRutaPesada('/exportar/activos')).toBe(true);
    expect(esRutaPesada('/assets')).toBe(false);
  });
});

describe('política de contraseña', () => {
  const buena = 'el foso del tren dos 7';

  it('acepta una frase larga y corriente', () => {
    expect(revisarPassword(buena).valida).toBe(true);
  });

  it('rechaza las cortas aunque parezcan complicadas', () => {
    const r = revisarPassword('Ab3$xY9!');   // 8, cumplía la regla vieja
    expect(r.valida).toBe(false);
    expect(r.motivos.join(' ')).toContain(String(LONGITUD_MINIMA));
  });

  it('rechaza lo que un atacante prueba primero sabiendo dónde está', () => {
    for (const mala of ['AcerosArequipa2026', 'PiscoLaminacion1', 'sgit-cctv-2026!']) {
      expect(revisarPassword(mala).valida).toBe(false);
    }
  });

  it('rechaza la contraseña que lleva dentro el correo del usuario', () => {
    const r = revisarPassword('cristhian-2026-ok', ['cristhian@acerosarequipa.com', 'Cristhian Ramos']);
    expect(r.valida).toBe(false);
    expect(r.motivos.join(' ')).toContain('nombre');
  });

  it('rechaza secuencias y repeticiones', () => {
    expect(revisarPassword('mantener abcde 12').valida).toBe(false);
    expect(revisarPassword('la caaaandela roja 4').valida).toBe(false);
  });

  it('una frase de más de 20 letras vale sin números', () => {
    expect(revisarPassword('la camara del foso del lecho').valida).toBe(true);
  });

  it('devuelve TODOS los motivos, no sólo el primero', () => {
    const r = revisarPassword('abc');
    expect(r.motivos.length).toBeGreaterThan(1);
  });
});
