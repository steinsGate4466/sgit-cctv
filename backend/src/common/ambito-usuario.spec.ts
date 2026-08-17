import {
  cruzarAmbito, alcanza, ambitoDelUsuario, noVeNada, veTodo,
  AmbitoResuelto, SIN_TREN_ASIGNADO,
} from './ambito-usuario';

/* =============================================================================
   BLOQUE 42 — EL VACÍO DEJA DE SIGNIFICAR «TODA LA PLANTA»
   -----------------------------------------------------------------------------
   Estas pruebas cubren el fallo que se vio en la captura de Producción: un
   usuario con el ámbito vacío tenía las tres pestañas de tren delante.
============================================================================= */

const ambito = (a: Partial<AmbitoResuelto>): AmbitoResuelto =>
  ({ trenes: [], alcance: 'TODO', motivo: null, ...a });

/** Prisma de mentira: sólo hace falta `user.findUnique`. */
const prismaFalso = (usuario: any) => ({
  user: { findUnique: async () => usuario },
}) as any;

describe('ambitoDelUsuario — los tres estados', () => {
  it('con trenes asignados, ve los suyos', async () => {
    const r = await ambitoDelUsuario(
      prismaFalso({ ambitoTrenes: ['AASA-PISCO-T2'], role: { exigeAmbito: true } }), 'u1',
    );
    expect(r.alcance).toBe('SUS_TRENES');
    expect(r.trenes).toEqual(['AASA-PISCO-T2']);
  });

  it('ROL QUE EXIGE ÁMBITO Y SIN TREN: no ve nada, y se dice por qué', async () => {
    const r = await ambitoDelUsuario(
      prismaFalso({ ambitoTrenes: [], role: { exigeAmbito: true } }), 'u1',
    );
    expect(r.alcance).toBe('NINGUNO');
    expect(noVeNada(r)).toBe(true);
    // El porqué viaja con el resultado: sin esto la pantalla sale vacía y
    // parece rota, cuando lo que falta es una asignación.
    expect(r.motivo).toBe(SIN_TREN_ASIGNADO);
  });

  it('ROL QUE NO LO EXIGE Y SIN TREN: sigue viendo todo (nadie pierde acceso)', async () => {
    /* Ésta es la prueba que protege el despliegue. Todos los usuarios actuales
       tienen el ámbito vacío; si el vacío pasara a «ninguno» para todos, la
       planta entera se quedaría a ciegas el día que se aplique la migración. */
    const r = await ambitoDelUsuario(
      prismaFalso({ ambitoTrenes: [], role: { exigeAmbito: false } }), 'u1',
    );
    expect(r.alcance).toBe('TODO');
    expect(veTodo(r)).toBe(true);
  });

  it('un rol sin el campo (base vieja) se trata como que no lo exige', async () => {
    const r = await ambitoDelUsuario(prismaFalso({ ambitoTrenes: [] }), 'u1');
    expect(r.alcance).toBe('TODO');
  });

  it('sin usuario identificado, ve todo: son llamadas internas sin persona detrás', async () => {
    const r = await ambitoDelUsuario(prismaFalso(null), null);
    expect(r.alcance).toBe('TODO');
  });

  it('los trenes vacíos de la lista no cuentan como asignación', async () => {
    // Un `['']` en la base venía de una importación mal hecha y habría dado
    // SUS_TRENES con un tren que no existe: no vería nada y sin explicación.
    const r = await ambitoDelUsuario(
      prismaFalso({ ambitoTrenes: ['', null], role: { exigeAmbito: true } }), 'u1',
    );
    expect(r.alcance).toBe('NINGUNO');
  });
});

describe('alcanza — y el T1 que se comía al T10', () => {
  it('sin límite alcanza a cualquier tren', () => {
    expect(alcanza(ambito({ alcance: 'TODO' }), 'AASA-PISCO-T3')).toBe(true);
  });

  it('NINGUNO no alcanza a nada, ni siquiera a un tren que exista', () => {
    expect(alcanza(ambito({ alcance: 'NINGUNO' }), 'AASA-PISCO-T1')).toBe(false);
  });

  it('alcanza a su tren por código completo', () => {
    const a = ambito({ alcance: 'SUS_TRENES', trenes: ['AASA-PISCO-T2'] });
    expect(alcanza(a, 'AASA-PISCO-T2')).toBe(true);
    expect(alcanza(a, 'AASA-PISCO-T1')).toBe(false);
  });

  it('alcanza por código corto: el ámbito se guardó de las dos formas', () => {
    const a = ambito({ alcance: 'SUS_TRENES', trenes: ['T2'] });
    expect(alcanza(a, 'AASA-PISCO-T2')).toBe(true);
  });

  it('EL FALLO QUE HABÍA: «T1» NO puede alcanzar a «T10»', () => {
    /* La versión anterior comparaba con `includes` sobre la cadena. Con tres
       trenes nunca se notó; el día que Laminación tenga un T10, el jefe del
       Tren 1 empezaría a ver una línea que no es suya y nadie lo relacionaría
       con esta línea de código. */
    const a = ambito({ alcance: 'SUS_TRENES', trenes: ['T1'] });
    expect(alcanza(a, 'AASA-PISCO-T10')).toBe(false);
    expect(alcanza(a, 'AASA-PISCO-T1')).toBe(true);
  });

  it('un activo sin tren no lo alcanza nadie sectorizado', () => {
    const a = ambito({ alcance: 'SUS_TRENES', trenes: ['T1'] });
    expect(alcanza(a, null)).toBe(false);
    expect(alcanza(a, '')).toBe(false);
  });

  it('no distingue mayúsculas', () => {
    const a = ambito({ alcance: 'SUS_TRENES', trenes: ['t2'] });
    expect(alcanza(a, 'AASA-PISCO-T2')).toBe(true);
  });
});

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
