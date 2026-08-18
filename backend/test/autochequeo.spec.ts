import {
  autochequeo, resumirChequeo, FotoDeLaBase, LoQueEsperaElCodigo,
} from '../src/common/autochequeo';

/**
 * PRUEBAS DEL AUTOCHEQUEO — bloque 44.
 *
 * Cada caso de aquí abajo corresponde a un fallo que YA PASÓ en este proyecto.
 * Ninguno está inventado: un chequeo que nunca ha saltado por un motivo real
 * acaba siendo ruido, y la gente que aprende a ignorar el ruido también ignora
 * lo que importa.
 */

const ESPERA: LoQueEsperaElCodigo = {
  permisos: ['asset.read', 'role.manage', 'user.manage', 'asset.delete', 'om.mirar'],
  rolesSectorizados: ['Jefe de Tren'],
  permisosDeAdministrador: ['asset.delete', 'user.manage'],
};

const base = (b: Partial<FotoDeLaBase> = {}): FotoDeLaBase => ({
  permisosEnLaBase: [...ESPERA.permisos],
  roles: [{
    nombre: 'Jefe de Mantenimiento',
    permisos: [...ESPERA.permisos],
    exigeAmbito: false, usuarios: 1, usuariosSinAmbito: 1,
  }],
  trenes: [{ code: 'AASA-PISCO-T1', sigla: 'T1' }],
  activos: 10,
  ...b,
});

const claves = (b: FotoDeLaBase) => autochequeo(b, ESPERA).map((x) => x.clave);

describe('autochequeo · el caso bueno y el caso vacío', () => {
  it('con todo en su sitio no dice nada', () => {
    expect(autochequeo(base(), ESPERA)).toHaveLength(0);
  });

  it('BASE SIN SEMBRAR: un solo aviso y se calla', () => {
    /* En el primer arranque TODO estaría mal. Llenar el registro de errores
       enseña a no leerlo, así que se dice una cosa y se sale. */
    const r = autochequeo(base({ roles: [] }), ESPERA);
    expect(r).toHaveLength(1);
    expect(r[0].clave).toBe('BASE_SIN_SEMBRAR');
    expect(r[0].gravedad).toBe('AVISO');
  });
});

describe('autochequeo · el fallo del bloque 34, que estuvo semanas oculto', () => {
  it('caza un permiso que el código exige y la base no tiene', () => {
    /* Es EXACTAMENTE lo que pasó: `role.manage` se añadió a la semilla, la
       semilla dejó de correr en cada arranque, y el Jefe de Mantenimiento se
       quedó sin poder abrir la pantalla de Roles. Nadie se enteró porque un
       permiso que falta no da error: sólo desaparece el menú. */
    const r = autochequeo(base({
      permisosEnLaBase: ESPERA.permisos.filter((p) => p !== 'role.manage'),
    }), ESPERA);
    const f = r.find((x) => x.clave === 'PERMISOS_QUE_FALTAN')!;
    expect(f).toBeDefined();
    expect(f.gravedad).toBe('ERROR');
    expect(f.que).toContain('role.manage');
    // El hallazgo dice qué hacer. Sin eso es una queja.
    expect(f.queHacer).toContain('semilla');
  });

  it('avisa si NADIE puede administrar el sistema', () => {
    const r = claves(base({
      roles: [{ nombre: 'Técnico', permisos: ['asset.read'], exigeAmbito: false, usuarios: 3, usuariosSinAmbito: 3 }],
    }));
    expect(r).toContain('SIN_ADMINISTRADOR');
  });

  it('con un solo rol que reúna la terna, basta', () => {
    expect(claves(base())).not.toContain('SIN_ADMINISTRADOR');
  });
});

describe('autochequeo · el efecto secundario del bloque 42', () => {
  it('avisa de la gente que dejó de ver todo al sectorizar su rol', () => {
    /* Al marcar «Jefe de Producción» como sectorizado, quien no tenga tren
       asignado deja de ver NADA. Es lo pedido, pero tiene que verse. */
    const r = autochequeo(base({
      roles: [
        ...base().roles,
        { nombre: 'Jefe de Tren', permisos: ['om.mirar'], exigeAmbito: true, usuarios: 3, usuariosSinAmbito: 2 },
      ],
    }), ESPERA);
    const f = r.find((x) => x.clave === 'SECTORIZADO_SIN_TREN')!;
    expect(f.gravedad).toBe('ERROR');
    expect(f.que).toContain('2 de sus 3');
    expect(f.que).toContain('no ven NADA');
  });

  it('un rol sectorizado con todos sus usuarios asignados no molesta', () => {
    const r = claves(base({
      roles: [
        ...base().roles,
        { nombre: 'Jefe de Tren', permisos: ['om.mirar'], exigeAmbito: true, usuarios: 3, usuariosSinAmbito: 0 },
      ],
    }));
    expect(r).not.toContain('SECTORIZADO_SIN_TREN');
  });

  it('caza la sectorización perdida: el código la exige y la base no la tiene', () => {
    const r = claves(base({
      roles: [
        ...base().roles,
        { nombre: 'Jefe de Tren', permisos: ['om.mirar'], exigeAmbito: false, usuarios: 1, usuariosSinAmbito: 0 },
      ],
    }));
    expect(r).toContain('SECTORIZACION_PERDIDA');
  });
});

describe('autochequeo · las siglas de tren (bloque 43)', () => {
  it('avisa de un tren sin sigla declarada', () => {
    const r = autochequeo(base({
      trenes: [{ code: 'AASA-PISCO-T1', sigla: null }, { code: 'AASA-PISCO-T2', sigla: '  ' }],
    }), ESPERA);
    const f = r.find((x) => x.clave === 'TREN_SIN_SIGLA')!;
    expect(f.gravedad).toBe('AVISO');
    expect(f.que).toContain('2 tren');
  });

  it('SIGLA REPETIDA es ERROR: el ámbito de un tren alcanza al otro', () => {
    /* Es una fuga de información silenciosa, justo lo que el bloque 42 cerró.
       Dos trenes con la misma sigla lo reabren sin que nada avise. */
    const r = autochequeo(base({
      trenes: [{ code: 'AASA-PISCO-T1', sigla: 'T1' }, { code: 'AASA-PISCO-T1-BIS', sigla: 't1' }],
    }), ESPERA);
    const f = r.find((x) => x.clave === 'SIGLA_REPETIDA')!;
    expect(f.gravedad).toBe('ERROR');
    // No distingue mayúsculas: «T1» y «t1» son el mismo tren para el ámbito.
    expect(f.que).toContain('2 trenes');
  });
});

describe('autochequeo · lo que NO es un fallo', () => {
  it('una planta sin activos se dice, pero como aviso', () => {
    const r = autochequeo(base({ activos: 0 }), ESPERA);
    const f = r.find((x) => x.clave === 'SIN_ACTIVOS')!;
    expect(f.gravedad).toBe('AVISO');
    // Se explica para que nadie lo lea como avería.
    expect(f.queHacer).toContain('no es una avería');
  });
});

describe('autochequeo · el orden y el resumen', () => {
  it('los errores salen antes que los avisos', () => {
    const r = autochequeo(base({
      activos: 0,
      trenes: [{ code: 'AASA-PISCO-T1', sigla: null }],
      permisosEnLaBase: [],
    }), ESPERA);
    const grav = r.map((x) => x.gravedad);
    expect(grav.indexOf('ERROR')).toBeLessThan(grav.indexOf('AVISO'));
  });

  it('el resumen distingue «todo bien» de «hay errores»', () => {
    expect(resumirChequeo([])).toContain('coincide');
    const conError = autochequeo(base({ permisosEnLaBase: [] }), ESPERA);
    expect(resumirChequeo(conError)).toContain('ERROR');
    // Y dice lo que de verdad importa: que no va a haber ningún mensaje.
    expect(resumirChequeo(conError)).toContain('no van a dar ningún mensaje');
  });

  it('con sólo avisos, el resumen no grita', () => {
    const soloAvisos = autochequeo(base({ activos: 0 }), ESPERA);
    expect(resumirChequeo(soloAvisos)).toContain('sin errores');
  });
});
