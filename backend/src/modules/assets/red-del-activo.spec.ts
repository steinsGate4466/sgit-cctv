import { NotFoundException } from '@nestjs/common';
import { RedDelActivoService } from './red-del-activo.service';

const SUBREDES = [
  { id: 'S16', cidr: '10.20.0.0/16', nombre: 'Planta', vlan: 1, gateway: '10.20.0.1',
    dns1: null, dns2: null, dhcpDesde: null, dhcpHasta: null, tren: null },
  { id: 'S24', cidr: '10.20.4.0/24', nombre: 'CCTV Tren 2', vlan: 40, gateway: '10.20.4.1',
    dns1: '10.20.0.10', dns2: null, dhcpDesde: '10.20.4.200', dhcpHasta: '10.20.4.250', tren: 'T2' },
];

function montar(asset: any, subredes: any[] = SUBREDES) {
  const prisma: any = {
    asset: { findUnique: jest.fn().mockResolvedValue(asset) },
    subred: { findMany: jest.fn().mockResolvedValue(subredes) },
  };
  return new RedDelActivoService(prisma);
}

const camara = (ip: string | null, vlanId: string | null = null) => ({
  id: 'A1', assetCode: 'CAM-T2-014', type: 'CAMARA', deletedAt: null,
  camera: ip ? { ipAddress: ip, vlanId } : null, switchDev: null, nvr: null,
});

describe('red del activo', () => {
  it('sin IP registrada lo dice, en vez de devolver una ficha vacía', async () => {
    const r: any = await montar(camara(null)).del('A1');
    expect(r.ip).toBeNull();
    expect(r.motivo).toContain('no tiene dirección IP');
  });

  /* EL CASO QUE JUSTIFICA ORDENAR POR ESPECIFICIDAD. Con un /24 dentro de un
     /16 declarados los dos, la máscara buena es la del /24. Al revés, el
     equipo no llegaría a su puerta de enlace. */
  it('con un /24 dentro de un /16, gana el /24', async () => {
    const r: any = await montar(camara('10.20.4.31')).del('A1');
    expect(r.subred.cidr).toBe('10.20.4.0/24');
    expect(r.subred.prefijo).toBe('/24');
    expect(r.subred.mascara).toBe('255.255.255.0');
    expect(r.subred.gateway).toBe('10.20.4.1');
    expect(r.subred.vlan).toBe(40);
  });

  it('una IP que sólo cae en el /16 devuelve el /16', async () => {
    const r: any = await montar(camara('10.20.9.5')).del('A1');
    expect(r.subred.cidr).toBe('10.20.0.0/16');
    expect(r.subred.mascara).toBe('255.255.0.0');
  });

  /* NO SE INVENTA UNA MÁSCARA. Un /24 supuesto sobre una red que es /22 hace
     perder una mañana en planta. */
  it('una IP fuera de toda subred declarada NO recibe máscara supuesta', async () => {
    const r: any = await montar(camara('192.168.50.7')).del('A1');
    expect(r.subred).toBeNull();
    expect(r.motivo).toContain('no cae en ninguna subred declarada');
    expect(JSON.stringify(r)).not.toContain('255.255');
  });

  /* Una estática dentro del pool del DHCP es un choque esperando a pasar. */
  it('avisa cuando la IP está dentro del rango que reparte el DHCP', async () => {
    const r: any = await montar(camara('10.20.4.210')).del('A1');
    expect(r.enPoolDhcp).toBe(true);
  });

  it('fuera del pool no avisa', async () => {
    const r: any = await montar(camara('10.20.4.31')).del('A1');
    expect(r.enPoolDhcp).toBe(false);
  });

  it('la IP de gestión de un switch también se encuentra', async () => {
    const sw = {
      id: 'A2', assetCode: 'SW-T2-01', type: 'SWITCH', deletedAt: null,
      camera: null, switchDev: { mgmtIp: '10.20.4.2' }, nvr: null,
    };
    const r: any = await montar(sw).del('A2');
    expect(r.ip).toBe('10.20.4.2');
    expect(r.campo).toContain('switch');
  });

  it('la NIC del NVR también', async () => {
    const nvr = {
      id: 'A3', assetCode: 'NVR-T2', type: 'NVR', deletedAt: null,
      camera: null, switchDev: null, nvr: { nicPrimary: '10.20.4.9' },
    };
    const r: any = await montar(nvr).del('A3');
    expect(r.ip).toBe('10.20.4.9');
  });

  it('un activo dado de baja no responde', async () => {
    await expect(montar({ ...camara('10.20.4.31'), deletedAt: new Date() }).del('A1'))
      .rejects.toThrow(NotFoundException);
  });

  /* Una subred desactivada ya no manda: si alguien la retiró, no puede seguir
     explicando la máscara de un equipo. */
  it('las subredes desactivadas no se consultan', async () => {
    const srv = montar(camara('10.20.4.31'));
    await srv.del('A1');
    const prisma: any = (srv as any).prisma;
    expect(prisma.subred.findMany.mock.calls[0][0].where).toEqual({ activa: true });
  });
});
