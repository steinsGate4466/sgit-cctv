import { aNumero, aTexto, analizar, dentroDe, enPoolDhcp } from './red';

/**
 * ARITMÉTICA DE REDES
 *
 * Esto es la base de «¿qué IP le pongo?». Si falla, el sistema sugiere una IP
 * ocupada y dos equipos se tumban entre ellos de forma intermitente — el
 * fallo más caro de diagnosticar que hay en una red.
 */

describe('conversión de IPv4', () => {
  it('convierte en los dos sentidos', () => {
    expect(aNumero('10.20.4.14')).toBe(169083918);
    expect(aTexto(169083918)).toBe('10.20.4.14');
  });

  it('la última dirección no se desborda a negativo', () => {
    // Sin `>>> 0`, JavaScript trata el bit alto como signo y 255.255.255.255
    // sale como -1. Todo el cálculo de rangos se rompe en silencio.
    expect(aNumero('255.255.255.255')).toBe(4294967295);
    expect(aTexto(4294967295)).toBe('255.255.255.255');
  });

  it('rechaza lo que no es una IPv4', () => {
    for (const malo of ['10.20.4', '10.20.4.256', '10.20.4.a', '', '10.20.4.14.5', ' ']) {
      expect(aNumero(malo)).toBeNull();
    }
  });

  it('acepta espacios alrededor: se pega desde otra pantalla', () => {
    expect(aNumero('  10.20.4.14 ')).toBe(169083918);
  });
});

describe('análisis de subred', () => {
  it('un /24 normal', () => {
    const r = analizar('10.20.4.0/24')!;
    expect(aTexto(r.red)).toBe('10.20.4.0');
    expect(aTexto(r.broadcast)).toBe('10.20.4.255');
    expect(aTexto(r.primera)).toBe('10.20.4.1');
    expect(aTexto(r.ultima)).toBe('10.20.4.254');
    expect(r.utiles).toBe(254);
  });

  it('normaliza aunque le den una IP de dentro en vez de la red', () => {
    // «10.20.4.14/24» es lo que copia la gente de un ipconfig.
    const r = analizar('10.20.4.14/24')!;
    expect(aTexto(r.red)).toBe('10.20.4.0');
  });

  it('un /30: cuatro direcciones, dos útiles', () => {
    const r = analizar('192.168.1.0/30')!;
    expect(r.utiles).toBe(2);
    expect(aTexto(r.primera)).toBe('192.168.1.1');
    expect(aTexto(r.ultima)).toBe('192.168.1.2');
  });

  it('un /31 son DOS útiles, no cero', () => {
    // Enlaces punto a punto. Con la fórmula general saldría «0 útiles» y el
    // cálculo de ocupación daría infinito o dividiría por cero.
    const r = analizar('10.0.0.0/31')!;
    expect(r.utiles).toBe(2);
  });

  it('un /32 es UNA sola dirección', () => {
    const r = analizar('10.0.0.5/32')!;
    expect(r.utiles).toBe(1);
    expect(aTexto(r.primera)).toBe('10.0.0.5');
  });

  it('un /16 grande no se desborda', () => {
    const r = analizar('172.16.0.0/16')!;
    expect(r.utiles).toBe(65534);
    expect(aTexto(r.ultima)).toBe('172.16.255.254');
  });

  it('rechaza máscaras imposibles', () => {
    expect(analizar('10.20.4.0/33')).toBeNull();
    expect(analizar('10.20.4.0/-1')).toBeNull();
    expect(analizar('10.20.4.0')).toBeNull();
    expect(analizar('no soy una red')).toBeNull();
  });
});

describe('pertenencia', () => {
  it('dentro y fuera', () => {
    expect(dentroDe('10.20.4.14', '10.20.4.0/24')).toBe(true);
    expect(dentroDe('10.20.5.14', '10.20.4.0/24')).toBe(false);
  });

  it('la red y el broadcast pertenecen al rango', () => {
    expect(dentroDe('10.20.4.0', '10.20.4.0/24')).toBe(true);
    expect(dentroDe('10.20.4.255', '10.20.4.0/24')).toBe(true);
  });

  it('una IP inválida nunca pertenece', () => {
    expect(dentroDe('no', '10.20.4.0/24')).toBe(false);
  });
});

describe('pool del DHCP', () => {
  it('detecta una estática puesta dentro del pool', () => {
    // El error clásico: se configura .150 a mano, el DHCP se la da a otro
    // equipo la semana siguiente y los dos se caen a ratos.
    expect(enPoolDhcp('10.20.4.150', '10.20.4.100', '10.20.4.200')).toBe(true);
    expect(enPoolDhcp('10.20.4.50', '10.20.4.100', '10.20.4.200')).toBe(false);
  });

  it('los extremos del pool cuentan', () => {
    expect(enPoolDhcp('10.20.4.100', '10.20.4.100', '10.20.4.200')).toBe(true);
    expect(enPoolDhcp('10.20.4.200', '10.20.4.100', '10.20.4.200')).toBe(true);
  });

  it('aguanta el rango escrito al revés', () => {
    expect(enPoolDhcp('10.20.4.150', '10.20.4.200', '10.20.4.100')).toBe(true);
  });

  it('sin pool declarado, nada está en el pool', () => {
    expect(enPoolDhcp('10.20.4.150', null, null)).toBe(false);
  });
});
