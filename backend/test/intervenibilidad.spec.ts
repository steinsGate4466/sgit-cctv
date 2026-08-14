/* =============================================================================
   ¿SE PUEDE INTERVENIR EN MARCHA? — bloque 28
   -----------------------------------------------------------------------------
   Estas pruebas no protegen un número: protegen a una persona. Si la regla se
   equivoca hacia el lado permisivo, alguien sube a una zona caliente creyendo
   que el sistema le dijo que podía.

   Por eso el caso más importante de este archivo no es «clasifica bien el
   púlpito»: es «sin firma NO deja pasar, diga lo que diga la propuesta».
============================================================================= */
import {
  proponer, resolver, esperaVentana, masRestrictiva,
} from '../src/common/intervenibilidad';

describe('la propuesta del sistema', () => {
  it('el púlpito climatizado se interviene en marcha', () => {
    expect(proponer('CLIMATIZADO')).toBe('EN_MARCHA');
  });

  it('la salida del horno y el vapor exigen parada', () => {
    expect(proponer('CALOR_RADIANTE')).toBe('EXIGE_PARADA');
    expect(proponer('VAPOR_AGUA')).toBe('EXIGE_PARADA');
  });

  it('la sala eléctrica no pide parada de tren, pide permiso eléctrico', () => {
    expect(proponer('EMI_ALTA')).toBe('CON_PERMISO_ELECTRICO');
  });

  it('en cascarilla o patio, si hay que subir cambia la respuesta', () => {
    expect(proponer('POLVO_METALICO', false)).toBe('EN_MARCHA');
    expect(proponer('POLVO_METALICO', true)).toBe('CON_PERMISO_ALTURA');
    expect(proponer('INTEMPERIE_SALINA', true)).toBe('CON_PERMISO_ALTURA');
  });

  it('la altura NO rebaja una zona que ya exigía parada', () => {
    // Sería el error grave: que añadir un requisito relajara otro.
    expect(proponer('CALOR_RADIANTE', true)).toBe('EXIGE_PARADA');
  });

  it('sin ambiente declarado no se inventa nada', () => {
    expect(proponer(null)).toBe('SIN_CLASIFICAR');
    expect(proponer(undefined, true)).toBe('SIN_CLASIFICAR');
  });
});

describe('LA RED DE SEGURIDAD: la propuesta no habilita', () => {
  it('sin firma se exige parada AUNQUE el sistema propusiera trabajar en marcha', () => {
    const r = resolver('EN_MARCHA', null);
    expect(r.aplica).toBe('EXIGE_PARADA');
    expect(r.estaFirmada).toBe(false);
    expect(r.motivo).toContain('no autoriza');
  });

  it('sin firma y sin ambiente, también parada, y lo explica distinto', () => {
    const r = resolver('SIN_CLASIFICAR', null);
    expect(r.aplica).toBe('EXIGE_PARADA');
    expect(r.motivo).toContain('ambiente');
  });

  it('con firma manda la firma', () => {
    const r = resolver('EN_MARCHA', 'EN_MARCHA');
    expect(r.aplica).toBe('EN_MARCHA');
    expect(r.estaFirmada).toBe(true);
    expect(r.firmaDesactualizada).toBe(false);
  });

  it('el firmante puede ser MÁS estricto que el sistema, y eso no es un aviso', () => {
    const r = resolver('EN_MARCHA', 'EXIGE_PARADA');
    expect(r.aplica).toBe('EXIGE_PARADA');
    expect(r.firmaDesactualizada).toBe(false);
  });

  it('si la firma permite MÁS de lo que hoy toca, se marca: la planta cambió', () => {
    // Se firmó «en marcha» cuando la zona era un patio. Hoy hay un horno al
    // lado y el ambiente pasó a CALOR_RADIANTE. La firma sigue aplicándose
    // porque tiene dueño, pero grita.
    const r = resolver('EXIGE_PARADA', 'EN_MARCHA');
    expect(r.aplica).toBe('EN_MARCHA');
    expect(r.firmaDesactualizada).toBe(true);
    expect(r.motivo).toContain('cambió en planta');
  });
});

describe('qué órdenes esperan a la ventana de parada', () => {
  it('las de parada y las sin clasificar', () => {
    expect(esperaVentana('EXIGE_PARADA')).toBe(true);
    expect(esperaVentana('SIN_CLASIFICAR')).toBe(true);
  });
  it('las demás no bloquean la ventana', () => {
    expect(esperaVentana('EN_MARCHA')).toBe(false);
    expect(esperaVentana('CON_PERMISO_ELECTRICO')).toBe(false);
    expect(esperaVentana('CON_PERMISO_ALTURA')).toBe(false);
  });
});

describe('el orden de severidad', () => {
  it('nunca elige la opción más permisiva', () => {
    expect(masRestrictiva('EN_MARCHA', 'EXIGE_PARADA')).toBe('EXIGE_PARADA');
    expect(masRestrictiva('CON_PERMISO_ALTURA', 'CON_PERMISO_ELECTRICO')).toBe('CON_PERMISO_ALTURA');
    expect(masRestrictiva('SIN_CLASIFICAR', 'EXIGE_PARADA')).toBe('SIN_CLASIFICAR');
  });
});
