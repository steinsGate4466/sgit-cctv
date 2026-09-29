/** Bloque 161 · el ícono del mapa sale del dispositivo, sin adivinar. */
import { estiloDeCamara, iconoDelEquipo } from '../src/modules/planos/icono';

describe('Ícono de cada equipo en el mapa', () => {
  it('lee el tipo de cámara escrito a mano', () => {
    expect(estiloDeCamara('Domo')).toBe('camara-domo');
    expect(estiloDeCamara('domo PTZ 25x')).toBe('camara-ptz');
    expect(estiloDeCamara('Bullet 4MP')).toBe('camara-bala');
    expect(estiloDeCamara('Térmica radiométrica')).toBe('camara-termica');
    expect(estiloDeCamara('Ojo de pez 360°')).toBe('camara-360');
    expect(estiloDeCamara('Torreta')).toBe('camara-domo');
  });
  it('si no lo reconoce, cámara genérica: no se inventa un domo', () => {
    expect(estiloDeCamara('Fija')).toBe('camara');
    expect(estiloDeCamara(null)).toBe('camara');
    expect(estiloDeCamara('')).toBe('camara');
  });
  it('la antena según su modo y el resto según su tipo', () => {
    expect(iconoDelEquipo('WIRELESS', null, 'PMP_BASE')).toBe('antena-base');
    expect(iconoDelEquipo('WIRELESS', null, 'PTP')).toBe('antena-ptp');
    expect(iconoDelEquipo('WIRELESS', null, 'SUSCRIPTOR')).toBe('antena-suscriptor');
    expect(iconoDelEquipo('WIRELESS', null, null)).toBe('antena');
    expect(iconoDelEquipo('SWITCH')).toBe('switch');
    expect(iconoDelEquipo('NVR')).toBe('nvr');
    expect(iconoDelEquipo('PSU')).toBe('fuente');
    expect(iconoDelEquipo('ALGO_NUEVO')).toBe('otro');
  });
});
