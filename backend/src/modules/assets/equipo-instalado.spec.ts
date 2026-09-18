import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EquipoInstaladoService } from './equipo-instalado.service';

/**
 * Bloque 106-B. Lo que se prueba aquí son las PUERTAS, no el camino feliz:
 * cada una de ellas existe porque sin ella el registro deja de servir para lo
 * que se creó — el informe de reemplazo.
 */
function montar(opciones: {
  sitio?: any;
  abierto?: any;
  permisos?: string[];
  activo?: boolean;
} = {}) {
  const escrituras: any[] = [];
  const auditado: any[] = [];
  const prisma: any = {
    asset: {
      findUnique: jest.fn().mockResolvedValue(
        opciones.sitio === undefined
          ? { id: 'A1', assetCode: 'CAM-T2-014', type: 'CAMARA', deletedAt: null }
          : opciones.sitio,
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        active: opciones.activo ?? true,
        role: {
          permissions: (opciones.permisos ?? []).map((code) => ({ permission: { code } })),
        },
      }),
    },
    equipoInstalado: {
      findFirst: jest.fn().mockResolvedValue(opciones.abierto ?? null),
      findUnique: jest.fn().mockResolvedValue({
        id: 'H1', assetId: 'A1', marca: 'Hikvision', modelo: 'DS-2CD', serie: 'X1',
        firmware: null, notas: null,
      }),
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: any) => { escrituras.push(['create', args]); return { id: 'NUEVO', ...args.data }; }),
      update: jest.fn((args: any) => { escrituras.push(['update', args]); return { id: args.where.id, ...args.data }; }),
    },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  const audit: any = { record: jest.fn(async (r: any) => { auditado.push(r); }) };
  return { srv: new EquipoInstaladoService(prisma, audit), prisma, escrituras, auditado };
}

describe('instalar', () => {
  it('sin marca, modelo, serie ni firmware NO se guarda: no distinguiría un aparato del otro', async () => {
    const { srv } = montar();
    await expect(srv.instalar('A1', {}, 'U1')).rejects.toThrow(BadRequestException);
  });

  it('en un sitio vacío entra sin pedir motivo: no hay nada que retirar', async () => {
    const { srv, prisma } = montar();
    const r = await srv.instalar('A1', { marca: 'Hikvision', modelo: 'DS-2CD' }, 'U1');
    expect(r.reemplazo).toBe(false);
    expect(prisma.equipoInstalado.create).toHaveBeenCalled();
    expect(prisma.equipoInstalado.update).not.toHaveBeenCalled();
  });

  /* LA PUERTA QUE JUSTIFICA EL BLOQUE. Sin motivo, dentro de seis meses nadie
     sabe si el modelo aguanta en esa zona o hay que cambiar de modelo. */
  it('con un aparato puesto y SIN motivo, se rechaza', async () => {
    const { srv } = montar({ abierto: { id: 'H0', desde: new Date('2026-01-01'), marca: 'Dahua' } });
    await expect(srv.instalar('A1', { marca: 'Hikvision' }, 'U1'))
      .rejects.toThrow(BadRequestException);
  });

  it('un motivo de dos letras tampoco vale', async () => {
    const { srv } = montar({ abierto: { id: 'H0', desde: new Date('2026-01-01') } });
    await expect(srv.instalar('A1', { marca: 'Hikvision', motivoRetiroAnterior: 'ok' }, 'U1'))
      .rejects.toThrow(BadRequestException);
  });

  it('con motivo, cierra el anterior y abre el nuevo EN LA MISMA transacción', async () => {
    const { srv, prisma, escrituras } = montar({
      abierto: { id: 'H0', desde: new Date('2026-01-01'), marca: 'Dahua' },
    });
    const r = await srv.instalar(
      'A1', { marca: 'Hikvision', motivoRetiroAnterior: 'se quemó la fuente' }, 'U1',
    );
    expect(r.reemplazo).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(escrituras.map((e) => e[0])).toEqual(['update', 'create']);
    expect(escrituras[0][1].data.motivoRetiro).toBe('se quemó la fuente');
    expect(escrituras[0][1].data.retiradoPorId).toBe('U1');
  });

  /* El reloj del móvil del técnico puede ir adelantado. Una instalación
     fechada mañana rompe cualquier cálculo de vida útil sin que nadie lo vea. */
  it('una fecha futura se rechaza', async () => {
    const { srv } = montar();
    const manana = new Date(Date.now() + 86_400_000).toISOString();
    await expect(srv.instalar('A1', { marca: 'X', desde: manana }, 'U1'))
      .rejects.toThrow(BadRequestException);
  });

  it('no puede entrar antes de que existiera el que está puesto', async () => {
    const { srv } = montar({ abierto: { id: 'H0', desde: new Date('2026-06-01') } });
    await expect(srv.instalar('A1', {
      marca: 'X', desde: '2026-01-01T00:00:00Z', motivoRetiroAnterior: 'cambio programado',
    }, 'U1')).rejects.toThrow(BadRequestException);
  });

  it('sobre un activo dado de baja no se instala nada', async () => {
    const { srv } = montar({ sitio: { id: 'A1', assetCode: 'X', type: 'CAMARA', deletedAt: new Date() } });
    await expect(srv.instalar('A1', { marca: 'X' }, 'U1')).rejects.toThrow(NotFoundException);
  });
});

describe('retirar', () => {
  it('sin motivo no se guarda', async () => {
    const { srv } = montar({ abierto: { id: 'H0', desde: new Date('2026-01-01') } });
    await expect(srv.retirar('A1', {}, 'U1')).rejects.toThrow(BadRequestException);
  });

  it('en un sitio vacío avisa en vez de callarse', async () => {
    const { srv } = montar({ abierto: null });
    await expect(srv.retirar('A1', { motivo: 'se lo llevaron al taller' }, 'U1'))
      .rejects.toThrow(BadRequestException);
  });

  it('cierra la fila con fecha, motivo y firma — y NO borra nada', async () => {
    const { srv, prisma, escrituras } = montar({
      abierto: { id: 'H0', desde: new Date('2026-01-01'), marca: 'Dahua' },
    });
    await srv.retirar('A1', { motivo: 'se lo llevaron al taller' }, 'U7');
    expect(escrituras[0][0]).toBe('update');
    expect(escrituras[0][1].data.motivoRetiro).toBe('se lo llevaron al taller');
    expect(escrituras[0][1].data.retiradoPorId).toBe('U7');
    expect((prisma.equipoInstalado as any).delete).toBeUndefined();
  });

  it('una fecha de retiro anterior a la de instalación se rechaza', async () => {
    const { srv } = montar({ abierto: { id: 'H0', desde: new Date('2026-06-01') } });
    await expect(srv.retirar('A1', { motivo: 'cambio', hasta: '2026-01-01T00:00:00Z' }, 'U1'))
      .rejects.toThrow(BadRequestException);
  });
});

describe('corregir — sólo el supervisor, y el intento denegado también se apunta', () => {
  it('sin el cargo se deniega Y queda auditado', async () => {
    const { srv, auditado } = montar({ permisos: ['asset.update'] });
    await expect(srv.corregir('H1', { serie: 'X2' }, 'U1')).rejects.toThrow(ForbiddenException);
    expect(auditado).toHaveLength(1);
    expect(auditado[0].action).toBe('CORREGIR_APARATO_DENEGADO');
    expect(auditado[0].userId).toBe('U1');
  });

  /* EL CARGO SE LEE DE LA BASE, NO DEL TOKEN: a quien se lo quitaron esta
     mañana no le vale la sesión de ayer. Una cuenta desactivada tampoco. */
  it('con el cargo pero la cuenta desactivada, tampoco', async () => {
    const { srv } = montar({ permisos: ['asset.delete'], activo: false });
    await expect(srv.corregir('H1', { serie: 'X2' }, 'U1')).rejects.toThrow(ForbiddenException);
  });

  it('con el cargo, corrige y deja el antes y el después en la auditoría', async () => {
    const { srv, auditado } = montar({ permisos: ['asset.delete'] });
    const r = await srv.corregir('H1', { serie: 'X2' }, 'U9', '10.0.0.1');
    expect(r.ok).toBe(true);
    expect(auditado[0].action).toBe('CORREGIR_APARATO');
    expect(auditado[0].before.serie).toBe('X1');
    expect(auditado[0].after.serie).toBe('X2');
  });

  it('sin ningún campo que corregir, avisa', async () => {
    const { srv } = montar({ permisos: ['asset.delete'] });
    await expect(srv.corregir('H1', {}, 'U9')).rejects.toThrow(BadRequestException);
  });
});
