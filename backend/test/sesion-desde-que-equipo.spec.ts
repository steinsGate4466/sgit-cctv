import * as fs from 'fs';
import * as path from 'path';
import { nombreDelEquipo, nombresDeEquipos, apuntarAparato } from '../src/common/nombre-del-equipo';

/* Auditoría 20/10 · «Quién está dentro» tiene que decir DESDE QUÉ EQUIPO.
   El servidor está en internet: toda la planta llega con la misma IP pública.
   Lo que distingue un PC de otro es el identificador del aparato, al que el
   Jefe le pone nombre en Equipos conocidos. */

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

describe('nombre del equipo de una sesión', () => {
  it('manda el nombre del aparato; si no tiene, el equipo conocido de esa IP', async () => {
    const prisma: any = {
      dispositivoAutorizado: { findUnique: jest.fn().mockResolvedValue({ nombre: 'PC púlpito T2', equipoConocido: null }) },
      equipoConocido: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Laptop mantto' }) },
    };
    expect(await nombreDelEquipo(prisma, '10.0.0.5', 'abc12345')).toBe('PC púlpito T2');
    prisma.dispositivoAutorizado.findUnique.mockResolvedValue({ nombre: null, equipoConocido: null });
    expect(await nombreDelEquipo(prisma, '10.0.0.5', 'abc12345')).toBe('Laptop mantto');
  });

  it('«local (servidor)» no es una IP: no se busca', async () => {
    const prisma: any = { dispositivoAutorizado: { findUnique: jest.fn() }, equipoConocido: { findUnique: jest.fn() } };
    expect(await nombreDelEquipo(prisma, 'local (servidor)', null)).toBeNull();
    expect(prisma.equipoConocido.findUnique).not.toHaveBeenCalled();
  });

  it('si la base falla, no tumba el login: devuelve null', async () => {
    const prisma: any = { dispositivoAutorizado: { findUnique: jest.fn().mockRejectedValue(new Error('x')) } };
    expect(await nombreDelEquipo(prisma, null, 'abc12345')).toBeNull();
    await expect(apuntarAparato({ dispositivoAutorizado: { findUnique: jest.fn().mockRejectedValue(new Error('x')) } } as any, 'abc12345', {})).resolves.toBeUndefined();
  });

  it('en lote, una consulta por tabla, no una por fila', async () => {
    const prisma: any = {
      dispositivoAutorizado: { findMany: jest.fn().mockResolvedValue([{ dispositivoId: 'a1', nombre: 'PC 1' }]) },
      equipoConocido: { findMany: jest.fn().mockResolvedValue([{ ip: '10.0.0.9', nombre: 'Laptop' }]) },
    };
    const r = await nombresDeEquipos(prisma, [{ dispositivoId: 'a1', ip: '1.1.1.1' }, { dispositivoId: 'a1' }, { ip: '10.0.0.9' }]);
    expect(prisma.dispositivoAutorizado.findMany).toHaveBeenCalledTimes(1);
    expect(r.porAparato.get('a1')).toBe('PC 1');
    expect(r.porIp.get('10.0.0.9')).toBe('Laptop');
  });

  it('login y renovación reciben el aparato y la sesión lo guarda', () => {
    const c = src('modules/auth/auth.controller.ts');
    expect(c.match(/@Headers\('x-dispositivo'\)/g)?.length).toBe(2);
    const a = src('modules/auth/auth.service.ts');
    expect(a).toContain('dispositivoId: dispositivoId || null');
    expect(a).toContain('equipo: await nombreDelEquipo(');
    expect(a).toContain('await apuntarAparato(');
  });
});

describe('revisión de formularios · quien firma tiene que poder hacerlo', () => {
  const { exigirFirmanteConPermiso } = require('../src/common/firmante');
  it('sin el permiso se rechaza y queda en auditoría; con él pasa', async () => {
    const registrar = jest.fn().mockResolvedValue(undefined);
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ role: { permissions: [{ permission: { code: 'wo.update' } }] } }) } };
    await expect(exigirFirmanteConPermiso(prisma, 'u1', 'wo.approve', registrar)).rejects.toThrow(/no tiene permiso/);
    expect(registrar).toHaveBeenCalled();
    await expect(exigirFirmanteConPermiso(prisma, 'u1', 'wo.update', registrar)).resolves.toBeUndefined();
  });
  it('las cinco acciones firmadas lo comprueban', () => {
    const n = ['modules/incidents/incidents.service.ts', 'modules/maintenance/maintenance.service.ts', 'modules/assets/assets.service.ts']
      .map((f) => (src(f).match(/exigirFirmanteConPermiso\(this\.prisma/g) || []).length);
    expect(n).toEqual([1, 2, 2]);
  });
});
