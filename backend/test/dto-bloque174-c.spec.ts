/* =============================================================================
   DTO DEL BLOQUE 174 (tanda C) — que ningún formulario deje de guardar
   -----------------------------------------------------------------------------
   Cada carga imita EXACTAMENTE lo que manda su cliente hoy —la pantalla o el
   agente de planta—, con los valores reales que salen de un <input>: '' y
   null incluidos. Si una de estas falla, un formulario de planta empezó a
   devolver 400 (bloque 90, Roles).

   Y una prueba por DTO de lo contrario: una clave que nadie declaró se
   rechaza. Sin ésa, un DTO que lo dejara pasar todo también saldría verde.
============================================================================= */
import { ValidationPipe } from '@nestjs/common';
import { GuardarAppUrlDto, GuardarTokenTelegramDto, ProbarCanalDto } from '../src/modules/notificaciones/dto/notificaciones.dto';
import { CrearAgenteDto, ReporteAgenteDto } from '../src/modules/monitoreo/dto/monitoreo.dto';
import { CrearSubredDto, ReservarIpDto } from '../src/modules/ipam/dto/ipam.dto';
import { ActualizarHerramientaDto, CrearHerramientaDto } from '../src/modules/inventory/dto/herramienta.dto';
import { ActualizarCatalogoDto, CrearCatalogoDto } from '../src/modules/catalogos/dto/catalogos.dto';
import { CambiarModoAccesoDto, DecidirDispositivoDto } from '../src/modules/acceso/dto/acceso.dto';
import { CrearEnlaceDto } from '../src/modules/network/dto/conexiones.dto';
import { GuardarHojaRutaDto } from '../src/modules/hojas-ruta/dto/hojas-ruta.dto';

/** La misma configuración que `main.ts`. */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

/** Lo que de verdad viaja: axios pasa el cuerpo por JSON, que quita los `undefined`. */
const comoJson = (o: unknown) => JSON.parse(JSON.stringify(o));

const validar = (dto: any, cuerpo: unknown) =>
  pipe.transform(comoJson(cuerpo), { type: 'body', metatype: dto, data: '' });

const UUID = '6f1c1a8e-3b0d-4c4e-9a51-2a7f0c9d1e22';

/* Cada entrada: [nombre del caso, DTO, cuerpo tal cual lo manda el cliente]. */
const CASOS: [string, any, unknown][] = [
  // --- notificaciones (pages/Avisos.tsx) ----------------------------------
  ['Avisos.tsx:63 · pegar el token', GuardarTokenTelegramDto, { token: '123456789:AAH-xYz_token-de-botfather' }],
  ['Avisos.tsx:63 · token vacío', GuardarTokenTelegramDto, { token: '' }],
  ['Avisos.tsx:176 · apagar los avisos', GuardarTokenTelegramDto, { token: '' }],
  ['app-url (sin pantalla) · dirección', GuardarAppUrlDto, { url: 'https://sgit-cctv.up.railway.app' }],
  ['app-url (sin pantalla) · vacía', GuardarAppUrlDto, { url: '' }],
  ['app-url (sin pantalla) · cuerpo vacío', GuardarAppUrlDto, {}],
  ['Avisos.tsx:95 · probar el canal', ProbarCanalDto, {}],

  // --- monitoreo -----------------------------------------------------------
  ['agente-planta.js:169 · lote del agente', ReporteAgenteDto, {
    equipos: [
      { assetId: UUID, responde: true, latencyMs: 3 },
      { assetId: UUID, responde: false, latencyMs: null },
    ],
  }],
  ['Monitoreo.tsx:47 · crear agente', CrearAgenteDto, { nombre: 'Agente Tren 2' }],
  ['Monitoreo.tsx:47 · crear agente sin nombre', CrearAgenteDto, { nombre: '' }],

  // --- ipam (pages/Ipam.tsx) ----------------------------------------------
  ['Ipam.tsx:94 · subred recién abierta', CrearSubredDto, {
    cidr: '', nombre: '', proposito: 'CCTV', vlan: '', gateway: '', dns1: '', tren: '',
    dhcpDesde: '', dhcpHasta: '', descripcion: '',
  }],
  ['Ipam.tsx:94 · subred rellena', CrearSubredDto, {
    cidr: '10.20.4.0/24', nombre: 'CCTV Tren 2', proposito: 'GESTION', vlan: '40',
    gateway: '10.20.4.1', dns1: '10.20.0.10', tren: 'TREN_2',
    dhcpDesde: '10.20.4.100', dhcpHasta: '10.20.4.200', descripcion: 'Cámaras del desbaste',
  }],
  ['Ipam.tsx:103 · reservar IP', ReservarIpDto, {
    ip: '10.20.4.37', tipo: 'ESTATICA', hostname: '', mac: '', descripcion: '',
  }],
  ['Ipam.tsx:103 · reservar IP rellena', ReservarIpDto, {
    ip: '10.20.4.38', tipo: 'RESERVA_DHCP', hostname: 'AA-CAM-T2-014', mac: 'aa:bb:cc:dd:ee:ff',
    descripcion: 'Cámara nueva del lecho de enfriamiento',
  }],

  // --- inventory (components/InventarioHerramientas.tsx) ------------------
  ['InventarioHerramientas.tsx:68 · alta mínima', CrearHerramientaDto, {
    code: undefined, name: 'Engrimpadora RJ45', category: undefined, notes: undefined, suggestedFor: [],
  }],
  ['InventarioHerramientas.tsx:68 · alta completa', CrearHerramientaDto, {
    code: 'HER-001', name: 'Engrimpadora RJ45', category: 'Cableado', notes: 'Con matriz Cat6',
    suggestedFor: ['CORRECTIVO', 'PREVENTIVO'],
  }],
  ['InventarioHerramientas.tsx:67 · edición', ActualizarHerramientaDto, {
    code: 'HER-001', name: 'Engrimpadora RJ45', category: undefined, notes: undefined, suggestedFor: [],
  }],
  ['inventory.service · reactivar (active)', ActualizarHerramientaDto, { active: true }],

  // --- catalogos (components/CatalogosEditables.tsx) ----------------------
  ['CatalogosEditables.tsx:74 · alta', CrearCatalogoDto, {
    kind: 'CAUSA', name: 'Conector oxidado', group: '', sequence: 0, notes: '',
  }],
  ['CatalogosEditables.tsx:74 · alta de trabajo de OM', CrearCatalogoDto, {
    kind: 'TRABAJO_OM', name: 'Limpieza de óptica', group: 'PREVENTIVO', sequence: 10,
    notes: 'Limpiar la óptica y comprobar el enfoque',
  }],
  /* La fila se carga con `group: i.group || ''` y `notes: i.notes || ''`. */
  ['CatalogosEditables.tsx:70 · edición', ActualizarCatalogoDto, {
    name: 'Conector oxidado', group: '', sequence: 0, notes: '',
  }],
  ['CatalogosEditables.tsx:98 · reactivar', ActualizarCatalogoDto, { active: true }],

  // --- acceso (pages/Equipos.tsx) -----------------------------------------
  ['Equipos.tsx:71 · modo', CambiarModoAccesoDto, { modo: 'AVISAR' }],
  ['Equipos.tsx:63 · aprobar con nombre', DecidirDispositivoDto, { estado: 'APROBADO', nombre: 'PC del púlpito T2' }],
  ['Equipos.tsx:63 · bloquear (nombre undefined)', DecidirDispositivoDto, { estado: 'BLOQUEADO', nombre: undefined }],
  ['Equipos.tsx:63 · volver a pendiente', DecidirDispositivoDto, { estado: 'PENDIENTE' }],

  // --- network: POST /network/enlaces (sin pantalla; mismo cuerpo que Conexiones.tsx:106) --
  ['Conexiones.tsx:106 · enlace', CrearEnlaceDto, {
    endpointAId: UUID, endpointBId: '7a2d2b9f-4c1e-4d5f-8b62-3b8f1d0e2f33', medium: 'FIBRA',
    isRing: false, description: undefined,
  }],
  ['Conexiones.tsx:106 · radioenlace con texto', CrearEnlaceDto, {
    endpointAId: UUID, endpointBId: '7a2d2b9f-4c1e-4d5f-8b62-3b8f1d0e2f33', medium: 'INALAMBRICO',
    isRing: true, description: 'PMP púlpito → grúa 107',
  }],

  // --- hojas-ruta (pages/HojasDeRuta.tsx:156) -----------------------------
  ['HojasDeRuta.tsx · hoja nueva', GuardarHojaRutaDto, {
    tipoEquipo: 'CAMERA', descripcion: '', ubicacionSap: undefined, grupoPlanif: 'M06',
    frecuencia: '3 MESES', puestoTrabajo: 'LAM1ELECT1', centro: '2100',
    trabajoTotalH: 8, numPersonas: 2, duracionH: 4, activa: undefined,
    operaciones: [
      { operacion: 10, subOperacion: null, descripcion: '' },
      { operacion: 10, subOperacion: 10, descripcion: 'USAR EPP BASICO' },
    ],
  }],
  ['HojasDeRuta.tsx · hoja existente (ya sin la basura del GET)', GuardarHojaRutaDto, {
    tipoEquipo: 'SWITCH', descripcion: 'MANTENIMIENTO PREVENTIVO DE SWITCH', ubicacionSap: null,
    grupoPlanif: null, frecuencia: '6M', puestoTrabajo: null, centro: null,
    trabajoTotalH: null, numPersonas: null, duracionH: 0, activa: true,
    operaciones: [{ operacion: 10, subOperacion: null, descripcion: 'PREVENTIVO SWITCH' }],
  }],
];

describe('DTO del bloque 174 (C) · lo que mandan los clientes se acepta', () => {
  it.each(CASOS)('%s', async (_n, dto, cuerpo) => {
    await expect(validar(dto, cuerpo)).resolves.toBeInstanceOf(dto);
  });

  it('la edición de catálogo tolera `sequence` como texto (Number() lo hace la pantalla, pero un <input> manda texto)', async () => {
    await expect(validar(ActualizarCatalogoDto, { name: 'X', group: null, sequence: '3', notes: null })).resolves.toBeDefined();
  });
});

describe('DTO del bloque 174 (C) · una clave que nadie declaró se rechaza', () => {
  const INTRUSOS: [string, any, Record<string, unknown>][] = [
    ['GuardarTokenTelegramDto', GuardarTokenTelegramDto, { token: '' }],
    ['GuardarAppUrlDto', GuardarAppUrlDto, { url: '' }],
    ['ProbarCanalDto', ProbarCanalDto, {}],
    ['ReporteAgenteDto', ReporteAgenteDto, { equipos: [] }],
    ['CrearAgenteDto', CrearAgenteDto, { nombre: 'Agente' }],
    ['CrearSubredDto', CrearSubredDto, { cidr: '10.0.0.0/24' }],
    ['ReservarIpDto', ReservarIpDto, { ip: '10.0.0.5' }],
    ['CrearHerramientaDto', CrearHerramientaDto, { name: 'Pinza' }],
    ['ActualizarHerramientaDto', ActualizarHerramientaDto, { name: 'Pinza' }],
    ['CrearCatalogoDto', CrearCatalogoDto, { kind: 'CAUSA', name: 'X' }],
    ['ActualizarCatalogoDto', ActualizarCatalogoDto, { name: 'X' }],
    ['CambiarModoAccesoDto', CambiarModoAccesoDto, { modo: 'LIBRE' }],
    ['DecidirDispositivoDto', DecidirDispositivoDto, { estado: 'APROBADO' }],
    ['CrearEnlaceDto', CrearEnlaceDto, { endpointAId: 'a', endpointBId: 'b' }],
    ['GuardarHojaRutaDto', GuardarHojaRutaDto, { tipoEquipo: 'CAMERA', operaciones: [] }],
  ];

  it.each(INTRUSOS)('%s', async (_n, dto, cuerpo) => {
    await expect(validar(dto, { ...cuerpo, campoQueNadieDeclaro: 1 })).rejects.toThrow();
  });

  it('la hoja de ruta tal como llega del GET (id, createdAt, aprobadaPor…) se rechaza: por eso la pantalla ya no la manda entera', async () => {
    await expect(validar(GuardarHojaRutaDto, {
      id: UUID, tipoEquipo: 'CAMERA', descripcion: 'X', createdAt: '2026-09-01T00:00:00.000Z',
      aprobadaPor: { id: UUID, fullName: 'Jefe' }, operaciones: [],
    })).rejects.toThrow();
  });
});

describe('DTO del bloque 174 (C) · la clase sin campos', () => {
  it('acepta el cuerpo ausente (una petición sin JSON)', async () => {
    await expect(pipe.transform(undefined, { type: 'body', metatype: ProbarCanalDto, data: '' })).resolves.toBeDefined();
  });
});

describe('DTO del bloque 174 (C) · los valores cerrados', () => {
  it('un propósito de subred fuera del enum se rechaza', async () => {
    await expect(validar(CrearSubredDto, { proposito: 'VIDEO' })).rejects.toThrow();
  });
  it('un estado de dispositivo fuera del enum se rechaza (antes era un 500 de la base)', async () => {
    await expect(validar(DecidirDispositivoDto, { estado: 'APROBAR' })).rejects.toThrow();
  });
  it('un tipo de equipo fuera del enum se rechaza en la hoja de ruta', async () => {
    await expect(validar(GuardarHojaRutaDto, { tipoEquipo: 'CAMARA', operaciones: [] })).rejects.toThrow();
  });
});
