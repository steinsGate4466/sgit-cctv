import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../src/common/nombre-del-equipo', () => ({
  apuntarAparato: jest.fn(async () => undefined),
  nombreDelEquipo: jest.fn(async () => null),
  nombresDeEquipos: jest.fn(async () => ({ porAparato: new Map(), porIp: new Map() })),
}));

import { AuthService } from '../src/modules/auth/auth.service';
import {
  CATALOGO_PERMISOS, PLANTILLAS_DE_ROL, PERMISO_PANTALLA_FIJA, problemaPantallaFija, soloMira,
} from '../src/modules/roles/catalogo-permisos';

/* =============================================================================
   BLOQUE 183 · «me botó trabajando», la parte del SERVIDOR
   -----------------------------------------------------------------------------
   La renovación rota el token. Si la RESPUESTA se pierde (wifi de la nave),
   el navegador vuelve con el token viejo pasados los 30 s de gracia, y el
   servidor lo tomaba por un robo: cerraba todas las sesiones. Ahora mira si
   la sesión sucesora llegó a usarse.
============================================================================= */
describe('renovación · una respuesta perdida no es un robo', () => {
  const SECRETO = 'secreto-de-pruebas-largo-123';
  beforeAll(() => {
    process.env.JWT_SECRET = SECRETO;
    process.env.JWT_REFRESH_SECRET = SECRETO + '-refresh';
  });

  const USUARIO = {
    id: 'u1', email: 'tec@aasa.pe', fullName: 'Técnico', active: true, permisosVersion: 1,
    role: { name: 'Técnico', permissions: [{ permission: { code: 'wo.read' } }] },
  };
  const hace = (ms: number) => new Date(Date.now() - ms);

  function montar(sesiones: Record<string, any>) {
    const prisma: any = {
      sesion: {
        findUnique: jest.fn(async ({ where }: any) => sesiones[where.id] ?? null),
        update: jest.fn(async ({ where, data }: any) => Object.assign(sesiones[where.id], data)),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let n = 0;
          for (const s of Object.values(sesiones)) {
            const coincide = (where.id ? s.id === where.id : s.userId === where.userId) && !s.revocadaEn;
            if (coincide) { Object.assign(s, data); n++; }
          }
          return { count: n };
        }),
        create: jest.fn(async ({ data }: any) => { sesiones[data.id] = { ...data, revocadaEn: null, primerUsoEn: null }; return data; }),
      },
      user: { findUnique: jest.fn(async () => USUARIO) },
    };
    const audit: any = { record: jest.fn(async () => undefined) };
    const jwt = new JwtService();
    return { s: new AuthService(prisma, jwt, audit), prisma, audit, jwt };
  }

  const refreshDe = (jwt: JwtService, jti: string) =>
    jwt.signAsync({ sub: 'u1', jti }, { secret: SECRETO + '-refresh', expiresIn: '7d' });

  const vieja = (extra: any = {}) => ({
    id: 's1', userId: 'u1', dispositivoId: 'PC1',
    revocadaEn: hace(5 * 60_000), motivoRevocacion: 'rotado', sucesoraId: 's2', ...extra,
  });

  it('sucesora SIN USAR: se recupera, sin cerrar nada, y la sucesora huérfana se retira', async () => {
    const sesiones: any = {
      s1: vieja(),
      s2: { id: 's2', userId: 'u1', revocadaEn: null, primerUsoEn: null },
      s9: { id: 's9', userId: 'u1', revocadaEn: null, primerUsoEn: hace(1000) }, // su celular
    };
    const { s, audit, jwt } = montar(sesiones);
    const r = await s.refresh(await refreshDe(jwt, 's1'), null, null, 'PC1');
    expect(r.accessToken).toBeTruthy();
    expect(sesiones.s2.motivoRevocacion).toMatch(/respuesta perdida/);
    expect(sesiones.s9.revocadaEn).toBeNull(); // la otra sesión de la persona sigue viva
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SESION_RECUPERADA' }));
    expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'SESION_REUTILIZADA' }));
    expect(sesiones.s1.sucesoraId).not.toBe('s2'); // apunta a la nueva
  });

  it('sucesora USADA: dos copias del token circulando → se cierra todo (robo)', async () => {
    const sesiones: any = {
      s1: vieja(),
      s2: { id: 's2', userId: 'u1', revocadaEn: null, primerUsoEn: hace(60_000) },
    };
    const { s, audit, jwt } = montar(sesiones);
    await expect(s.refresh(await refreshDe(jwt, 's1'), null, null, 'PC1')).rejects.toThrow(/por seguridad/);
    expect(sesiones.s2.revocadaEn).not.toBeNull();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SESION_REUTILIZADA' }));
  });

  it('desde OTRO aparato no se recupera nunca', async () => {
    const sesiones: any = { s1: vieja(), s2: { id: 's2', userId: 'u1', revocadaEn: null, primerUsoEn: null } };
    const { s, jwt } = montar(sesiones);
    await expect(s.refresh(await refreshDe(jwt, 's1'), null, null, 'OTRO')).rejects.toThrow(/por seguridad/);
  });

  it('cerrada por la persona (Salir, cerrar todas): nunca se recupera', async () => {
    const sesiones: any = {
      s1: vieja({ motivoRevocacion: 'cierre de sesión' }),
      s2: { id: 's2', userId: 'u1', revocadaEn: null, primerUsoEn: null },
    };
    const { s, jwt } = montar(sesiones);
    await expect(s.refresh(await refreshDe(jwt, 's1'), null, null, 'PC1')).rejects.toThrow(/por seguridad/);
  });

  it('la sucesora no llegó a guardarse: se recupera', async () => {
    const sesiones: any = { s1: vieja({ sucesoraId: 'nunca-existio' }) };
    const { s, jwt } = montar(sesiones);
    await expect(s.refresh(await refreshDe(jwt, 's1'), null, null, 'PC1')).resolves.toHaveProperty('accessToken');
  });

  it('si no se puede guardar la sesión, se FALLA ahora (antes salía un token huérfano que echaba 15 min después)', async () => {
    const sesiones: any = { s1: { id: 's1', userId: 'u1', revocadaEn: null, motivoRevocacion: null } };
    const { s, prisma, jwt } = montar(sesiones);
    prisma.sesion.create.mockRejectedValue(new Error('base caída'));
    await expect(s.refresh(await refreshDe(jwt, 's1'), null, null, 'PC1')).rejects.toThrow(/base caída/);
    expect(prisma.sesion.create).toHaveBeenCalledTimes(2); // un reintento
  });

  it('el guard apunta el PRIMER uso de cada sesión', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/common/guards/acceso-vigente.guard.ts'), 'utf8');
    expect(src).toMatch(/"primerUsoEn" = COALESCE\("primerUsoEn", now\(\)\)/);
  });
});

/* =============================================================================
   BLOQUE 183 · PANTALLA FIJA — una sesión que no caduca sólo puede MIRAR
============================================================================= */
describe('pantalla fija · sólo lectura, forzado por el servidor', () => {
  it('el permiso existe en el catálogo', () => {
    const codigos = CATALOGO_PERMISOS.flatMap((g) => g.permisos.map((p) => p.code));
    expect(codigos).toContain(PERMISO_PANTALLA_FIJA);
  });

  it('con sólo lectura se acepta, y el permiso no cuenta como escritura', () => {
    const rol = [PERMISO_PANTALLA_FIJA, 'activos.mirar', 'incident.read', 'dashboard.read'];
    expect(problemaPantallaFija(rol)).toBeNull();
    expect(soloMira(rol)).toBe(true);
  });

  it('con cualquier escritura se rechaza, también reportar', () => {
    for (const w of ['incident.create', 'wo.create', 'asset.update', 'user.manage', 'wo.approve']) {
      expect(problemaPantallaFija([PERMISO_PANTALLA_FIJA, 'activos.mirar', w])).toContain(w);
    }
  });

  it('con contraseñas de equipos, auditoría o usuarios se rechaza', () => {
    for (const r of ['credential.read', 'audit.read', 'user.read']) {
      expect(problemaPantallaFija([PERMISO_PANTALLA_FIJA, r])).toContain(r);
    }
  });

  it('sin el permiso, la regla no aplica (no frena a ningún otro rol)', () => {
    expect(problemaPantallaFija(['incident.create', 'credential.read'])).toBeNull();
  });

  it('la plantilla «Pantalla fija» cumple su propia regla', () => {
    const p = PLANTILLAS_DE_ROL.find((x) => x.permisos.includes(PERMISO_PANTALLA_FIJA));
    expect(p).toBeDefined();
    expect(problemaPantallaFija(p!.permisos)).toBeNull();
  });

  it('el servicio de roles la aplica al crear Y al editar (validarCodigos)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/modules/roles/roles.service.ts'), 'utf8');
    const v = src.slice(src.indexOf('private validarCodigos'));
    expect(v).toMatch(/problemaPantallaFija\(limpios\)/);
    expect((src.match(/this\.validarCodigos\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
