import {
  motivoParaNoGuardar, motivoParaNoBorrar, normalizarAmbito, alcanzaElTren,
  RolAEditar, ContextoDeEdicion,
} from './roles.guardas';

const rol = (p: Partial<RolAEditar> = {}): RolAEditar =>
  ({ id: 'r1', nombre: 'Prueba', sistema: false, usuarios: 0, ...p });
const ctx = (p: Partial<ContextoDeEdicion> = {}): ContextoDeEdicion =>
  ({ rolDelEditorId: 'otro', administradoresRestantes: 3, ...p });

describe('motivoParaNoGuardar', () => {
  it('deja guardar un rol de sólo lectura', () => {
    expect(motivoParaNoGuardar(rol(), ['dashboard.read', 'wo.read'], ctx())).toBeNull();
  });

  it('no deja guardar un rol sin ningún permiso', () => {
    // Un rol vacío no es "restringido": es una cuenta que no puede ni entrar,
    // y el usuario lo vive como "el sistema está roto".
    expect(motivoParaNoGuardar(rol(), [], ctx())).toMatch(/sin ningún permiso/);
  });

  it('impide que te quites a ti mismo la administración de roles', () => {
    const m = motivoParaNoGuardar(
      rol({ id: 'mio' }), ['dashboard.read', 'user.manage'], ctx({ rolDelEditorId: 'mio' }),
    );
    expect(m).toMatch(/tu propio rol/);
  });

  it('impide que te quites a ti mismo la administración de usuarios', () => {
    const m = motivoParaNoGuardar(
      rol({ id: 'mio' }), ['dashboard.read', 'role.manage'], ctx({ rolDelEditorId: 'mio' }),
    );
    expect(m).toMatch(/Administrar usuarios/);
  });

  it('deja editar TU PROPIO rol mientras conserves las dos llaves', () => {
    // Editarse a uno mismo no es el problema; quedarse fuera sí.
    expect(motivoParaNoGuardar(
      rol({ id: 'mio' }),
      ['dashboard.read', 'role.manage', 'user.manage', 'audit.read'],
      ctx({ rolDelEditorId: 'mio' }),
    )).toBeNull();
  });

  it('no deja desarmar al ÚLTIMO rol que administra usuarios', () => {
    const m = motivoParaNoGuardar(
      rol({ id: 'admin' }), ['dashboard.read'], ctx({ administradoresRestantes: 0 }),
    );
    expect(m).toMatch(/último rol/);
  });

  it('sí deja quitarlo si queda otro que administra', () => {
    expect(motivoParaNoGuardar(
      rol({ id: 'admin' }), ['dashboard.read'], ctx({ administradoresRestantes: 1 }),
    )).toBeNull();
  });
});

describe('motivoParaNoBorrar', () => {
  it('no borra un rol del sistema', () => {
    expect(motivoParaNoBorrar(rol({ sistema: true, nombre: 'Administrador' })))
      .toMatch(/vino con el sistema/);
  });

  it('no borra un rol con usuarios dentro', () => {
    // Borrarlo dejaría a esa gente sin poder entrar, y sin aviso.
    expect(motivoParaNoBorrar(rol({ usuarios: 4 }))).toMatch(/4 usuario/);
  });

  it('borra un rol propio y vacío', () => {
    expect(motivoParaNoBorrar(rol())).toBeNull();
  });
});

describe('normalizarAmbito', () => {
  it('vacío es vacío: sin restricción', () => {
    expect(normalizarAmbito([])).toEqual([]);
    expect(normalizarAmbito(null)).toEqual([]);
    expect(normalizarAmbito('T1')).toEqual([]); // no es un array
  });

  it('limpia espacios, mayúsculas y repetidos', () => {
    expect(normalizarAmbito([' t1 ', 'T2', 't1', ''])).toEqual(['T1', 'T2']);
  });

  it('devuelve orden estable', () => {
    // Si no fuese estable, la auditoría registraría un cambio cada vez que
    // se guarda el mismo ámbito en distinto orden.
    expect(normalizarAmbito(['T3', 'T1'])).toEqual(normalizarAmbito(['T1', 'T3']));
  });
});

describe('alcanzaElTren', () => {
  it('ámbito vacío lo ve todo', () => {
    expect(alcanzaElTren([], 'T2')).toBe(true);
    expect(alcanzaElTren([], null)).toBe(true);
  });

  it('con ámbito, sólo su tren', () => {
    expect(alcanzaElTren(['T2'], 'T2')).toBe(true);
    expect(alcanzaElTren(['T2'], 'T1')).toBe(false);
  });

  it('no distingue mayúsculas', () => {
    expect(alcanzaElTren(['T2'], 't2')).toBe(true);
  });

  it('lo NO ubicado no lo ve quien tiene ámbito', () => {
    // Un activo sin tren podría estar en cualquier sitio. Enseñárselo al
    // jefe del Tren 2 sería enseñarle algo que quizá no es suyo.
    expect(alcanzaElTren(['T2'], null)).toBe(false);
  });
});
