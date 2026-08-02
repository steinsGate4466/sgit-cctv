import {
  omCerrada, omEnEspera, omAsignada, incidenciaCritica, resumenDiario, mensajeCompleto,
} from '../src/modules/notificaciones/plantillas';

/**
 * Un aviso se lee a las tres de la mañana, medio dormido, en una pantalla de
 * cinco pulgadas, con la notificación asomando media línea. Estas pruebas
 * comprueban justo eso: que esa media línea baste.
 */

describe('el asunto es el aviso entero', () => {
  it('el cierre dice QUÉ orden y de QUÉ equipo', () => {
    const a = omCerrada({ code: 'OM-2026-014', equipo: 'CAM-T2-07' });
    expect(a.asunto).toContain('OM-2026-014');
    expect(a.asunto).toContain('CAM-T2-07');
  });

  it('la espera dice QUÉ se espera, no sólo que está parada', () => {
    // "OM-123 en espera" no permite decidir nada. "esperando repuesto" sí:
    // quien lo lee sabe si le toca a él.
    const a = omEnEspera({ code: 'OM-9', queEspera: 'un repuesto', dias: 23 });
    expect(a.asunto).toContain('repuesto');
    expect(a.asunto).toContain('23');
  });

  it('el asunto no se desborda con actividades larguísimas', () => {
    const a = omEnEspera({ code: 'OM-9', queEspera: 'x'.repeat(300) });
    expect(a.asunto.length).toBeLessThan(90);
    expect(a.asunto).toMatch(/…$/);
  });

  it('recorta por palabra, no por la mitad de una', () => {
    const a = omCerrada({
      code: 'OM-1',
      actividad: 'Cambio de la fuente de alimentación del gabinete principal del tren dos',
    });
    expect(a.cuerpo).not.toMatch(/aliment…/);
  });
});

describe('el informe NO viaja por Telegram', () => {
  it('va el enlace, no el archivo', () => {
    // Un PDF con fotos de planta subido a Telegram queda alojado en sus
    // servidores, fuera del control de la empresa, y se reenvía con dos
    // toques. El resumen basta para decidir; el detalle vive en el sistema.
    const a = omCerrada({ code: 'OM-1', enlace: 'https://sgit/maintenance?q=OM-1' });
    expect(a.cuerpo).toContain('https://sgit/maintenance?q=OM-1');
    expect(a.cuerpo.toLowerCase()).not.toMatch(/\.pdf|adjunto|base64/);
  });

  it('sin enlace configurado, el aviso sigue siendo útil', () => {
    // Preferible un aviso sin enlace que uno con `undefined/maintenance`,
    // que además haría dudar del resto del mensaje.
    const a = omCerrada({ code: 'OM-1', equipo: 'CAM-1', enlace: null });
    expect(a.cuerpo).not.toMatch(/undefined|null/);
    expect(a.cuerpo).toContain('CAM-1');
  });
});

describe('los campos vacíos no ensucian el mensaje', () => {
  it('no aparecen etiquetas sin valor', () => {
    const a = omCerrada({ code: 'OM-1' });
    expect(a.cuerpo).not.toMatch(/Causa:\s*$/m);
    expect(a.cuerpo).not.toMatch(/undefined|null/);
  });

  it('lo que sí hay, aparece', () => {
    const a = omCerrada({ code: 'OM-1', causa: 'Fuente quemada', accion: 'Reemplazo' });
    expect(a.cuerpo).toContain('Causa: Fuente quemada');
    expect(a.cuerpo).toContain('Acción: Reemplazo');
  });
});

describe('resumen diario', () => {
  it('SIN NOVEDADES NO SE MANDA NADA', () => {
    // Un "hoy no hay novedades" diario es la forma más rápida de que alguien
    // silencie el bot — y con él, lo urgente.
    expect(resumenDiario({ vencidas: 0, paradas: 0, bajoMinimo: 0, sinDetallar: 0 })).toBeNull();
  });

  it('va SIN SONIDO', () => {
    // Si todo suena igual, se silencia el bot entero. Lo que despierta se
    // reserva para lo que exige levantarse.
    const a = resumenDiario({ vencidas: 2, paradas: 1, bajoMinimo: 0, sinDetallar: 0 })!;
    expect(a.silencioso).toBe(true);
  });

  it('el cierre y la incidencia crítica SÍ suenan', () => {
    expect(omCerrada({ code: 'OM-1' }).silencioso).toBe(false);
    expect(incidenciaCritica({ code: 'INC-1', titulo: 'NVR caído' }).silencioso).toBe(false);
  });

  it('sólo enumera lo que tiene cuenta', () => {
    const a = resumenDiario({ vencidas: 3, paradas: 0, bajoMinimo: 0, sinDetallar: 1 })!;
    expect(a.asunto).toContain('3 vencida');
    expect(a.asunto).toContain('1 sin detallar');
    expect(a.asunto).not.toContain('parada');
    expect(a.asunto).not.toContain('0 ');
  });
});

describe('mensajeCompleto', () => {
  it('junta asunto y cuerpo, sin espacios sobrantes', () => {
    const m = mensajeCompleto(omAsignada({ code: 'OM-5', equipo: 'SW-T1' }));
    expect(m.startsWith('🔧')).toBe(true);
    expect(m).not.toMatch(/\n\n\n/);
    expect(m).toBe(m.trim());
  });
});
