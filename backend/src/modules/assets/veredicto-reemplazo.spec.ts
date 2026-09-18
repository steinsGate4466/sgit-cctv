import { decidirReemplazo, UMBRAL_REEMPLAZO, TITULO } from './veredicto-reemplazo';

const om = (iso: string) => ({ fecha: iso });

describe('decidirReemplazo', () => {
  it('sin señales y sin apenas órdenes, no hay motivo', () => {
    const r = decidirReemplazo({ severidad: 'NINGUNA', codigos: [], correctivas: [] });
    expect(r.veredicto).toBe('SIN_MOTIVO');
  });

  /* LA COMPROBACIÓN QUE VA PRIMERA, Y POR QUÉ. Con diez órdenes encima, si los
     vecinos también fallan, cambiar esta cámara tira una cámara buena. */
  it('si fallan los vecinos, manda eso aunque haya diez correctivas', () => {
    const r = decidirReemplazo({
      severidad: 'CONFIRMADA',
      codigos: ['ORDENES_REPETIDAS', 'FALLA_COMPARTIDA'],
      correctivas: Array.from({ length: 10 }, () => om('2026-08-01')),
      aparatoDesde: '2026-01-01',
    });
    expect(r.veredicto).toBe('MIRAR_AGUAS_ARRIBA');
  });

  /* EL CASO QUE JUSTIFICA EL BLOQUE 106. Antes de separar sitio y aparato, este
     informe habría pedido cambiar una cámara puesta hace tres semanas. */
  it('con la cámara recién cambiada, las fallas viejas NO cuentan contra la nueva', () => {
    const r = decidirReemplazo({
      severidad: 'CONFIRMADA',
      codigos: ['ORDENES_REPETIDAS'],
      correctivas: [om('2026-01-10'), om('2026-02-14'), om('2026-03-02'), om('2026-09-15')],
      aparatoDesde: '2026-09-01',
      reemplazosPrevios: 1,
    });
    expect(r.veredicto).toBe('OBSERVAR_EL_NUEVO');
    expect(r.correctivasDelSitio).toBe(4);
    expect(r.correctivasDelAparato).toBe(1);
    expect(r.frase).toContain('ANTERIOR');
  });

  it('cuando las correctivas SON del aparato puesto, se propone el reemplazo', () => {
    const r = decidirReemplazo({
      severidad: 'CONFIRMADA',
      codigos: ['ORDENES_REPETIDAS'],
      correctivas: [om('2026-06-10'), om('2026-07-14'), om('2026-08-02')],
      aparatoDesde: '2026-01-01',
    });
    expect(r.veredicto).toBe('PROPONER_REEMPLAZO');
    expect(r.correctivasDelAparato).toBe(UMBRAL_REEMPLAZO);
  });

  /* Si el punto ya se ha comido varios aparatos, el problema deja de ser el
     modelo y pasa a ser el sitio. El informe tiene que decirlo. */
  it('con reemplazos previos, avisa de que el problema puede ser el SITIO', () => {
    const r = decidirReemplazo({
      severidad: 'CONFIRMADA',
      codigos: ['ORDENES_REPETIDAS'],
      correctivas: [om('2026-06-10'), om('2026-07-14'), om('2026-08-02')],
      aparatoDesde: '2026-01-01',
      reemplazosPrevios: 2,
    });
    expect(r.veredicto).toBe('PROPONER_REEMPLAZO');
    expect(r.frase).toContain('SITIO');
  });

  it('por debajo del umbral y sin confirmar, sólo se observa', () => {
    const r = decidirReemplazo({
      severidad: 'SOSPECHA',
      codigos: ['ORDENES_REPETIDAS'],
      correctivas: [om('2026-06-10'), om('2026-07-14')],
      aparatoDesde: '2026-01-01',
    });
    expect(r.veredicto).toBe('SEGUIR_OBSERVANDO');
  });

  /* Sin aparato registrado no se puede separar quién falló. Se cuentan todas
     —es lo único honesto— y el informe lo dice en vez de dar a entender que
     son del de ahora. */
  it('sin aparato registrado, todas las correctivas son del sitio', () => {
    const r = decidirReemplazo({
      severidad: 'CONFIRMADA',
      codigos: ['ORDENES_REPETIDAS'],
      correctivas: [om('2026-06-10'), om('2026-07-14'), om('2026-08-02')],
    });
    expect(r.correctivasDelAparato).toBe(3);
    expect(r.correctivasDelSitio).toBe(3);
    expect(r.apoyadoEnFechaEstimada).toBe(false);
  });

  /* Una fecha estimada del traspaso del 106-A no se disimula: el veredicto
     que se apoya en ella lo dice, porque quien lo lee decide con eso. */
  it('marca cuando el veredicto se apoya en una fecha estimada', () => {
    const r = decidirReemplazo({
      severidad: 'CONFIRMADA',
      codigos: [],
      correctivas: [om('2026-06-10'), om('2026-07-14'), om('2026-08-02')],
      aparatoDesde: '2026-01-01',
      aparatoDesdeEsEstimado: true,
    });
    expect(r.apoyadoEnFechaEstimada).toBe(true);
  });

  it('una orden sin fecha no se atribuye al aparato actual', () => {
    const r = decidirReemplazo({
      severidad: 'SOSPECHA',
      codigos: [],
      correctivas: [{ fecha: null }, om('2026-09-10')],
      aparatoDesde: '2026-09-01',
    });
    expect(r.correctivasDelAparato).toBe(1);
  });

  it('todos los veredictos tienen su título', () => {
    for (const v of ['MIRAR_AGUAS_ARRIBA', 'PROPONER_REEMPLAZO', 'OBSERVAR_EL_NUEVO',
      'SEGUIR_OBSERVANDO', 'SIN_MOTIVO'] as const) {
      expect(TITULO[v]).toBeTruthy();
    }
  });
});
