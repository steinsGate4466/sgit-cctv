import { cruzarAmbito } from './ambito-usuario';

describe('cruzarAmbito — el filtro de pantalla NUNCA amplía un permiso', () => {
  it('sin restricción, se respeta lo que pide la pantalla', () => {
    expect(cruzarAmbito('T1', [])).toBe('T1');
    expect(cruzarAmbito(null, [])).toBeNull();
  });

  it('con un solo tren permitido y sin pedir nada, se le da el suyo', () => {
    expect(cruzarAmbito(null, ['T2'])).toBe('T2');
  });

  it('pide el suyo: se lo da', () => {
    expect(cruzarAmbito('T2', ['T2'])).toBe('T2');
  });

  it('PIDE OTRO TREN A MANO: no lo ve', () => {
    // Escribir ?tren=T1 en la barra de direcciones es lo PRIMERO que alguien
    // prueba. Devuelve NADA, no el tren pedido y tampoco "todo".
    expect(cruzarAmbito('T1', ['T2'])).toBe('NADA');
  });

  it('no distingue mayúsculas al comparar', () => {
    expect(cruzarAmbito('t2', ['T2'])).toBe('t2');
  });

  it('con varios trenes permitidos y ninguno pedido, se resuelve por lista', () => {
    // null aquí significa "no se puede resolver con un solo código";
    // filtroConAmbito une los trenes permitidos.
    expect(cruzarAmbito(null, ['T1', 'T3'])).toBeNull();
  });

  it('con varios permitidos, sigue sin poder pedir uno ajeno', () => {
    expect(cruzarAmbito('T2', ['T1', 'T3'])).toBe('NADA');
  });
});
