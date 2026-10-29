jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { ModelosService } from '../src/modules/modelos/modelos.service';
import { DatosFichaDto } from '../src/modules/modelos/dto/modelos.dto';

/* =============================================================================
   BLOQUE 184 · «LOS DATOS LOS LLENA EL TÉCNICO, PERO FEHACIENTES»
   Lo que hace fehaciente una ficha, regla por regla, y SIEMPRE por los dos
   lados: lo que tiene que pasar pasa y lo que no, no. Con un solo lado se
   puede tener una regla que deja pasar todo, o una que no deja pasar nada.
============================================================================= */

const PDF = { buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200)]), originalname: 'ficha.pdf' };
const PNG = { buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200)]), originalname: 'ficha.pdf' };

/** Domo Hikvision DS-2CD2143G2-IS con lente de 2.8 mm, copiado de su ficha. */
const DOMO: any = {
  lente: '2.8 mm', resolucionAncho: 2688, resolucionAlto: 1520, anguloH: 103, anguloV: 55,
  doriEn: 'GRAN_ANGULAR', identificarM: 6, reconocerM: 13, observarM: 26, detectarM: 67, irM: 30,
};

function montar(o: {
  tipo?: string;
  declaradaPor?: string | null;
  verificada?: boolean;
  camaras?: number;
  repetida?: boolean;
  falloAlmacen?: boolean;
} = {}) {
  const orden: string[] = [];
  const prisma: any = {
    modeloEquipo: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1', tipoActivo: o.tipo ?? 'CAMERA', marca: 'Hikvision', modelo: 'DS-2CD2143G2-IS',
        declaradoPorId: o.declaradaPor ?? 'tecnico',
      }),
      update: jest.fn().mockResolvedValue({ id: 'm1' }),
    },
    fichaOptica: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.modeloId_lente) return Promise.resolve(o.repetida ? { id: 'otra' } : null);
        return Promise.resolve({
          id: 'f1', modeloId: 'm1', lente: '2.8 mm', documentoId: 'd1',
          declaradaPorId: o.declaradaPor === undefined ? 'tecnico' : o.declaradaPor,
          verificadaEn: o.verificada ? new Date() : null,
          identificarM: 6, reconocerM: 13, observarM: 26, detectarM: 67, anguloH: 103,
          modelo: { marca: 'Hikvision', modelo: 'DS-2CD2143G2-IS' },
          documento: { fileId: 'documentos/d1.pdf' },
          _count: { camaras: o.camaras ?? 0 },
        });
      }),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'f1', lente: data.lente })),
      update: jest.fn().mockResolvedValue({ id: 'f1' }),
      delete: jest.fn().mockImplementation(() => { orden.push('borrar'); return Promise.resolve({}); }),
      count: jest.fn().mockResolvedValue(0),
    },
    document: {
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ fileId: 'documentos/d1.pdf' }),
    },
  };
  const storage: any = {
    put: o.falloAlmacen ? jest.fn().mockRejectedValue(new Error('MinIO caído')) : jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    getBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
  };
  const audit: any = { record: jest.fn().mockImplementation(() => { orden.push('auditar'); return Promise.resolve(); }) };
  return { svc: new ModelosService(prisma, storage, audit), prisma, storage, audit, orden };
}

describe('la prueba es el PDF del fabricante', () => {
  it('sin PDF no hay ficha, y lo dice con palabras', async () => {
    const { svc, prisma } = montar();
    await expect(svc.crearFicha('m1', undefined, DOMO, 'tecnico')).rejects.toThrow(/Falta el PDF/);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('un archivo que NO es un PDF (por sus bytes) no vale, aunque se llame .pdf', async () => {
    const { svc, prisma } = montar();
    await expect(svc.crearFicha('m1', PNG, DOMO, 'tecnico')).rejects.toThrow(/PDF del fabricante/);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('con el PDF: se guarda como documento de la ficha, con nombre del almacén que NO es el del archivo', async () => {
    const { svc, prisma, storage } = montar();
    await svc.crearFicha('m1', { ...PDF, originalname: '../../etc/passwd.pdf' }, DOMO, 'tecnico');
    expect(prisma.document.create.mock.calls[0][0].data.category).toBe('FICHA_TECNICA');
    expect(storage.put.mock.calls[0][0]).toBe('documentos/d1.pdf');
    expect(prisma.fichaOptica.create.mock.calls[0][0].data).toMatchObject({ declaradaPorId: 'tecnico', documentoId: 'd1', doriAnguloRef: 103 });
  });

  it('si el almacén falla a medias, no queda un documento huérfano', async () => {
    const { svc, prisma } = montar({ falloAlmacen: true });
    await expect(svc.crearFicha('m1', PDF, DOMO, 'tecnico')).rejects.toThrow(/MinIO/);
    expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(prisma.fichaOptica.create).not.toHaveBeenCalled();
  });

  it('sólo las cámaras llevan ficha óptica', async () => {
    const { svc } = montar({ tipo: 'SWITCH' });
    await expect(svc.crearFicha('m1', PDF, DOMO, 'tecnico')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la misma lente dos veces no: se corrige la que hay', async () => {
    const { svc, prisma } = montar({ repetida: true });
    await expect(svc.crearFicha('m1', PDF, DOMO, 'tecnico')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });
});

describe('lo imposible se rechaza ANTES de guardar nada', () => {
  it('un cero de más (670 en vez de 67)', async () => {
    const { svc, prisma } = montar();
    await expect(svc.crearFicha('m1', PDF, { ...DOMO, detectarM: 670 }, 'tecnico')).rejects.toThrow(/revisa/i);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('el asistente de revisión dice lo mismo que el guardado, sin guardar', () => {
    const { svc } = montar();
    expect(svc.revisarFicha({ ...DOMO, detectarM: 670 }).problemas.length).toBeGreaterThan(0);
    const bien = svc.revisarFicha(DOMO);
    expect(bien.problemas).toEqual([]);
    expect(bien.gran?.dia).toEqual({ identificar: 6, reconocer: 13, observar: 26, detectar: 67 });
    expect(bien.tele).toBeNull();   // fija: no hay tele que enseñar
  });

  it('una PTZ enseña también lo que ve en tele', () => {
    const { svc } = montar();
    const r = svc.revisarFicha({
      lente: '5.9-188.8 mm', resolucionAncho: 2560, resolucionAlto: 1440, anguloH: 60.2, anguloHTele: 2,
      zoomOptico: 32, doriEn: 'TELE', identificarM: 240, reconocerM: 480, observarM: 952.4, detectarM: 2400, irM: 150,
    } as any);
    expect(r.problemas).toEqual([]);
    expect(r.tele?.dia.detectar).toBe(2400);
    expect(r.gran!.dia.detectar).toBeLessThan(2400);
  });
});

describe('dos ojos: declara uno, verifica OTRO', () => {
  it('quien la cargó no la puede verificar', async () => {
    const { svc, prisma } = montar({ declaradaPor: 'tecnico' });
    await expect(svc.verificarFicha('f1', 'tecnico')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.fichaOptica.update).not.toHaveBeenCalled();
  });

  it('otra persona sí, y queda con su nombre', async () => {
    const { svc, prisma } = montar({ declaradaPor: 'tecnico' });
    await svc.verificarFicha('f1', 'jefe');
    expect(prisma.fichaOptica.update.mock.calls[0][0].data.verificadaPorId).toBe('jefe');
  });

  it('corregir un número QUITA la verificación: hay que volver a mirarla', async () => {
    const { svc, prisma } = montar({ verificada: true });
    await svc.editarFicha('f1', { ...DOMO, irM: 25 }, 'tecnico');
    expect(prisma.fichaOptica.update.mock.calls[0][0].data).toMatchObject({ verificadaPorId: null, verificadaEn: null, declaradaPorId: 'tecnico' });
  });

  it('guardar SIN cambiar nada no le quita la verificación a nadie', async () => {
    const { svc, prisma } = montar({ verificada: true });
    prisma.fichaOptica.findUnique.mockResolvedValue({
      id: 'f1', modeloId: 'm1', verificadaEn: new Date(), declaradaPorId: 'tecnico',
      lente: '2.8 mm', resolucionAncho: 2688, resolucionAlto: 1520, sensor: null, anguloH: 103, anguloV: 55,
      anguloHTele: null, zoomOptico: null, doriAnguloRef: 103,
      identificarM: 6, reconocerM: 13, observarM: 26, detectarM: 67, irM: 30,
    });
    const r: any = await svc.editarFicha('f1', DOMO, 'otro');
    expect(r.sinCambios).toBe(true);
    expect(prisma.fichaOptica.update).not.toHaveBeenCalled();
  });

  it('lo mismo con el ciclo de vida del modelo', async () => {
    const { svc, prisma } = montar();
    await expect(svc.verificarModelo('m1', 'tecnico')).rejects.toBeInstanceOf(ForbiddenException);
    await svc.verificarModelo('m1', 'jefe');
    expect(prisma.modeloEquipo.update.mock.calls[0][0].data.verificadoPorId).toBe('jefe');
  });
});

describe('borrar una ficha', () => {
  it('quien la cargó, mientras nadie la haya verificado', async () => {
    const { svc, prisma } = montar({ declaradaPor: 'tecnico' });
    await svc.borrarFicha('f1', 'tecnico', ['asset.update']);
    expect(prisma.fichaOptica.delete).toHaveBeenCalled();
  });

  it('ya verificada, el que la cargó no; el jefe sí', async () => {
    const a = montar({ declaradaPor: 'tecnico', verificada: true });
    await expect(a.svc.borrarFicha('f1', 'tecnico', ['asset.update'])).rejects.toBeInstanceOf(ForbiddenException);
    const b = montar({ declaradaPor: 'tecnico', verificada: true });
    await b.svc.borrarFicha('f1', 'jefe', ['wo.approve']);
    expect(b.prisma.fichaOptica.delete).toHaveBeenCalled();
  });

  it('otro técnico no puede borrar lo que cargó un compañero', async () => {
    const { svc } = montar({ declaradaPor: 'tecnico' });
    await expect(svc.borrarFicha('f1', 'otro', ['asset.update'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nunca con cámaras que la usan: el mapa se quedaría sin saber qué ven', async () => {
    const { svc, prisma } = montar({ camaras: 3 });
    await expect(svc.borrarFicha('f1', 'jefe', ['wo.approve'])).rejects.toThrow(/3 cámara/);
    expect(prisma.fichaOptica.delete).not.toHaveBeenCalled();
  });

  it('se audita ANTES de borrar (bloque 15)', async () => {
    const { svc, orden } = montar();
    await svc.borrarFicha('f1', 'jefe', ['wo.approve']);
    expect(orden).toEqual(['auditar', 'borrar']);
  });
});

describe('los números llegan del formulario con archivo, como texto', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const validar = (cuerpo: any) => pipe.transform(cuerpo, { type: 'body', metatype: DatosFichaDto } as any);
  const comoTexto = Object.fromEntries(Object.entries(DOMO).map(([k, v]) => [k, String(v)]));

  it('se convierten a número antes de validar', async () => {
    const r: any = await validar(comoTexto);
    expect(r.detectarM).toBe(67);
    expect(r.anguloH).toBe(103);
  });

  it('el error sale en castellano y nombra el dato, no el campo interno', async () => {
    const e: any = await validar({ ...comoTexto, anguloH: '400' }).catch((x) => x);
    const msg = JSON.stringify(e.getResponse().message);
    expect(msg).toMatch(/Ángulo horizontal: un número entre 0.5 y 360°/);
    expect(msg).not.toMatch(/anguloH|must not/);
  });

  it('un campo que no es de la ficha se rechaza (no se cuela nada)', async () => {
    const e: any = await validar({ ...comoTexto, verificadaPorId: 'yo' }).catch((x) => x);
    expect(JSON.stringify(e.getResponse().message)).toMatch(/verificadaPorId/);
  });
});
