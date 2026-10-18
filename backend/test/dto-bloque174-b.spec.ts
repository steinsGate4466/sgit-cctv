import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import {
  AgregarMaterialDto, ActualizarMaterialDto, GenerarRetiroDto, RegistrarReemplazoDto,
} from '../src/modules/maintenance/dto/preparacion.dto';
import { AsignarOmDto, DesdeIncidenciaDto, DetallarOmDto } from '../src/modules/maintenance/dto/asignar-om.dto';
import {
  DeclararCriticidadDto, ParametrosCriticidadDto, RiesgoDeZonaDto,
} from '../src/modules/criticidad/dto/criticidad.dto';
import { CrearCampanaDto, DecidirZonaDto, RepartirZonasDto } from '../src/modules/campanas/dto/campanas.dto';
import { DeclararZonaDto, FirmarIntervencionDto } from '../src/modules/zonas/dto/zonas.dto';

/* =============================================================================
   BLOQUE 174 (parte B) · LOS DTO ACEPTAN LO QUE MANDAN LAS PANTALLAS
   -----------------------------------------------------------------------------
   El riesgo de cerrar la deuda del bloque 85 es el del bloque 90 (Roles): con
   `forbidNonWhitelisted`, un DTO que olvida un campo que el formulario SÍ
   manda rechaza la petición entera con un 400 y el formulario deja de guardar.

   Por eso cada prueba manda EXACTAMENTE el cuerpo que arma su pantalla —con
   sus '' y sus null—, pasado por el MISMO pipe que `main.ts`. Y cada DTO tiene
   la prueba contraria: una clave que nadie declaró se rechaza. Sólo con la
   primera se podría tener un DTO que deja pasar todo; sólo con la segunda, uno
   que no deja pasar nada.

   JSON.parse(JSON.stringify(...)) imita al navegador: axios serializa el
   cuerpo y las claves con `undefined` desaparecen.
============================================================================= */

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const comoJson = (o: any) => JSON.parse(JSON.stringify(o));
const pasar = (metatype: any, cuerpo: any) =>
  pipe.transform(comoJson(cuerpo), { type: 'body', metatype });

const ID = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b';
const ID2 = '0a1b2c3d-4e5f-4061-8293-a4b5c6d7e8f9';

// ---------------------------------------------------------------------------
describe('preparacion.controller — OmMateriales.tsx', () => {
  // OmMateriales.tsx:133 · agregar(): con repuesto del catálogo
  it('POST materials — repuesto del catálogo, sin descripción ni unidad', async () => {
    const nuevo = { sparePartId: ID, description: '', plannedQty: '2', unit: '' };
    await expect(pasar(AgregarMaterialDto, {
      sparePartId: nuevo.sparePartId || undefined,
      description: nuevo.description?.trim() || undefined,
      plannedQty: nuevo.plannedQty === '' ? undefined : Number(nuevo.plannedQty),
      unit: nuevo.unit?.trim() || undefined,
    })).resolves.toBeDefined();
  });

  // OmMateriales.tsx:133 · agregar(): escrito a mano, con decimales (cable en metros)
  it('POST materials — material escrito a mano, 12,5 m', async () => {
    await expect(pasar(AgregarMaterialDto, {
      sparePartId: undefined, description: 'Cable UTP Cat6 exterior', plannedQty: 12.5, unit: 'm',
    })).resolves.toBeDefined();
  });

  // OmMateriales.tsx:133 · agregar(): sin cantidad (plannedQty '' → undefined)
  it('POST materials — sin cantidad prevista', async () => {
    await expect(pasar(AgregarMaterialDto, {
      sparePartId: undefined, description: 'Conector RJ45', plannedQty: undefined, unit: undefined,
    })).resolves.toBeDefined();
  });

  it('POST materials — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(AgregarMaterialDto, { description: 'x', id: ID })).rejects.toThrow();
  });

  // OmMateriales.tsx:146 · marcarUsado(): con valor
  it('PATCH materials/:materialId — cantidad usada', async () => {
    await expect(pasar(ActualizarMaterialDto, { usedQty: Number('3') })).resolves.toBeDefined();
  });

  // OmMateriales.tsx:146 · marcarUsado(): campo vaciado ('' → undefined → {})
  it('PATCH materials/:materialId — campo vaciado manda {}', async () => {
    await expect(pasar(ActualizarMaterialDto, { usedQty: undefined })).resolves.toBeDefined();
  });

  it('PATCH materials/:materialId — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(ActualizarMaterialDto, { usedQty: 1, status: 'RETIRADO' })).rejects.toThrow();
  });

  // OmMateriales.tsx:90 · generarRetiro()
  it('POST materials/retiro — la pantalla manda {}', async () => {
    await expect(pasar(GenerarRetiroDto, {})).resolves.toBeDefined();
  });

  it('POST materials/retiro — itemIds y nota que lee el servicio', async () => {
    await expect(pasar(GenerarRetiroDto, { itemIds: [ID, ID2], nota: 'Turno noche' })).resolves.toBeDefined();
  });

  it('POST materials/retiro — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(GenerarRetiroDto, { userId: ID })).rejects.toThrow();
  });

  // OmMateriales.tsx:167 · registrarSwap(): los dos equipos y nota
  it('POST swaps — retirado, instalado y nota', async () => {
    const swap = { removedAssetId: ID, installedAssetId: ID2, note: ' Lente rajada ' };
    await expect(pasar(RegistrarReemplazoDto, {
      removedAssetId: swap.removedAssetId || undefined,
      installedAssetId: swap.installedAssetId || undefined,
      note: swap.note?.trim() || undefined,
    })).resolves.toBeDefined();
  });

  // OmMateriales.tsx:167 · registrarSwap(): sólo el retirado, sin nota
  it('POST swaps — sólo el retirado', async () => {
    await expect(pasar(RegistrarReemplazoDto, {
      removedAssetId: ID, installedAssetId: undefined, note: undefined,
    })).resolves.toBeDefined();
  });

  it('POST swaps — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(RegistrarReemplazoDto, { removedAssetId: ID, workOrderId: ID2 })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('maintenance.controller — AsignarOm.tsx y DetallarOm.tsx', () => {
  const cuerpoDeAsignar = (form: any) => ({
    type: form.type,
    activity: form.activity,
    assetId: form.assetId || undefined,
    technicianId: form.technicianId || undefined,
    scheduledDate: form.scheduledDate || undefined,
  });

  // AsignarOm.tsx:64 · sin incidencia, formulario completo
  it('POST asignar — formulario completo', async () => {
    await expect(pasar(AsignarOmDto, cuerpoDeAsignar({
      type: 'PREVENTIVO', activity: 'Limpieza de domo y revisión de conector',
      assetId: ID, technicianId: ID2, scheduledDate: '2026-10-16',
    }))).resolves.toBeDefined();
  });

  // AsignarOm.tsx:64 · sin equipo ni técnico, fecha borrada
  it('POST asignar — sin equipo, sin técnico y sin fecha', async () => {
    await expect(pasar(AsignarOmDto, cuerpoDeAsignar({
      type: 'MAPEO', activity: 'Levantar la sala eléctrica', assetId: '', technicianId: '', scheduledDate: '',
    }))).resolves.toBeDefined();
  });

  // AsignarOm.tsx:64 · actividad vacía: la rechaza el SERVICIO con su mensaje, no el DTO
  it('POST asignar — actividad vacía llega al servicio', async () => {
    await expect(pasar(AsignarOmDto, cuerpoDeAsignar({
      type: 'CORRECTIVO', activity: '', assetId: ID, technicianId: '', scheduledDate: '2026-10-16',
    }))).resolves.toBeDefined();
  });

  it('POST asignar — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(AsignarOmDto, { activity: 'x', assignedById: ID })).rejects.toThrow();
  });

  // AsignarOm.tsx:63 · desde una incidencia (mismo cuerpo)
  it('POST desde-incidencia/:id — el cuerpo de AsignarOm', async () => {
    await expect(pasar(DesdeIncidenciaDto, cuerpoDeAsignar({
      type: 'CORRECTIVO', activity: '', assetId: ID, technicianId: ID2, scheduledDate: '2026-10-16',
    }))).resolves.toBeDefined();
  });

  it('POST desde-incidencia/:id — sin técnico ni equipo', async () => {
    await expect(pasar(DesdeIncidenciaDto, cuerpoDeAsignar({
      type: 'CORRECTIVO', activity: 'Cámara sin imagen', assetId: '', technicianId: '', scheduledDate: '',
    }))).resolves.toBeDefined();
  });

  it('POST desde-incidencia/:id — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(DesdeIncidenciaDto, { activity: 'x', incidentId: ID })).rejects.toThrow();
  });

  const cuerpoDeDetallar = (form: any) => ({
    assetId: form.assetId || null,
    activity: form.activity,
    plannedDurationMin: form.plannedDurationMin === '' ? null : Number(form.plannedDurationMin),
    plannedStopAt: form.plannedStopAt || undefined,
    scopeNote: form.scopeNote,
  });

  // DetallarOm.tsx:73 · sin duración ni parada, sin cambio de equipo
  it('PATCH :id/detallar — duración vacía (null) y scopeNote vacío', async () => {
    await expect(pasar(DetallarOmDto, cuerpoDeDetallar({
      assetId: ID, activity: 'Revisar cámara', plannedDurationMin: '', plannedStopAt: '', scopeNote: '',
    }))).resolves.toBeDefined();
  });

  // DetallarOm.tsx:73 · cambia el equipo, con duración y parada
  it('PATCH :id/detallar — cambio de equipo con motivo, duración y parada', async () => {
    await expect(pasar(DetallarOmDto, cuerpoDeDetallar({
      assetId: ID2, activity: 'Cambiar fuente PoE', plannedDurationMin: '45',
      plannedStopAt: '2026-10-20', scopeNote: 'El equipo pedido está bien; la falla está en otro equipo',
    }))).resolves.toBeDefined();
  });

  // DetallarOm.tsx:73 · sin equipo (assetId '' → null)
  it('PATCH :id/detallar — sin equipo manda assetId null', async () => {
    await expect(pasar(DetallarOmDto, cuerpoDeDetallar({
      assetId: '', activity: 'Levantamiento', plannedDurationMin: 120, plannedStopAt: '', scopeNote: '',
    }))).resolves.toBeDefined();
  });

  it('PATCH :id/detallar — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(DetallarOmDto, { activity: 'x', detailedAt: '2026-10-16' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('criticidad.controller — Criticidad.tsx, CriticidadActivo.tsx y Zonas.tsx', () => {
  // Criticidad.tsx:131 · `nums` = copia de `datos.parametros` (las cinco claves)
  it('PUT parametros — los cinco números', async () => {
    await expect(pasar(ParametrosCriticidadDto, {
      corteA: 40, corteB: 18, diasA: 30, diasB: 60, diasC: 90,
    })).resolves.toBeDefined();
  });

  // Criticidad.tsx:131 · un campo borrado: Number('') = 0, lo rechaza el SERVICIO
  it('PUT parametros — campo vaciado (0) llega al servicio', async () => {
    await expect(pasar(ParametrosCriticidadDto, {
      corteA: 40, corteB: Number(''), diasA: 30, diasB: 60, diasC: 90,
    })).resolves.toBeDefined();
  });

  it('PUT parametros — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(ParametrosCriticidadDto, {
      corteA: 40, corteB: 18, diasA: 30, diasB: 60, diasC: 90, confirmados: true,
    })).rejects.toThrow();
  });

  // CriticidadActivo.tsx:96 · `{ [campo]: valor }`, una clave por petición
  it.each([
    ['impactoOperacional', 4],
    ['impactoOperacional', 1],
    ['impactoOperacional', null],
    ['riesgoPersonas', true],
    ['riesgoPersonas', false],
    ['riesgoPersonas', null],
  ])('POST :id — { %s: %p }', async (campo, valor) => {
    await expect(pasar(DeclararCriticidadDto, { [campo]: valor })).resolves.toBeDefined();
  });

  /* `declarar()` distingue «no vino» de «vino como null» con `'campo' in dto`.
     Si el DTO inventara la clave que no se mandó, declarar sólo el riesgo
     borraría el impacto. */
  it('POST :id — la clave que no se mandó NO aparece en el DTO', async () => {
    const dto = await pasar(DeclararCriticidadDto, { riesgoPersonas: true });
    expect('riesgoPersonas' in dto).toBe(true);
    expect('impactoOperacional' in dto).toBe(false);
    const dto2 = await pasar(DeclararCriticidadDto, { impactoOperacional: null });
    expect('impactoOperacional' in dto2).toBe(true);
    expect(dto2.impactoOperacional).toBeNull();
    expect('riesgoPersonas' in dto2).toBe(false);
  });

  it('POST :id — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(DeclararCriticidadDto, { riesgoPersonas: true, letra: 'A' })).rejects.toThrow();
  });

  // Zonas.tsx:384 · riesgo '' → null, motivo vacío
  it.each([
    [null, ''],
    [true, 'Paso de grúa con carga suspendida'],
    [false, ''],
  ])('PUT zona/:id — riesgoPersonas %p', async (riesgoPersonas, riesgoPersonasMotivo) => {
    await expect(pasar(RiesgoDeZonaDto, { riesgoPersonas, riesgoPersonasMotivo })).resolves.toBeDefined();
  });

  it('PUT zona/:id — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(RiesgoDeZonaDto, { riesgoPersonas: true, riesgoPersonasMotivo: 'x', nombre: 'Foso' }))
      .rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('campanas.controller — Campanas.tsx', () => {
  // Campanas.tsx:83 · `nueva` tal cual sale del formulario
  it('POST /campanas — recién abierto: tren «Todos» y fechas vacías', async () => {
    await expect(pasar(CrearCampanaDto, {
      nombre: 'Mapeo Tren 2', tren: '', descripcion: '', inicioPrevisto: '', finPrevisto: '',
    })).resolves.toBeDefined();
  });

  it('POST /campanas — con tren, fecha y descripción', async () => {
    await expect(pasar(CrearCampanaDto, {
      nombre: 'Mapeo Tren 1 · laminación', tren: 'TREN_1', descripcion: 'Levantar todo el desbaste',
      inicioPrevisto: '2026-10-20', finPrevisto: '',
    })).resolves.toBeDefined();
  });

  it('POST /campanas — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(CrearCampanaDto, { nombre: 'x', estado: 'CERRADA' })).rejects.toThrow();
  });

  // Campanas.tsx:93 · guardarReparto()
  it('POST :id/zonas — filas con y sin asignado/esperados/notas', async () => {
    const filas = [
      { locationId: ID, asignadoAId: ID2, esperados: '12', notas: 'Empezar por el púlpito' },
      { locationId: ID2, asignadoAId: '', esperados: '', notas: '' },
      { locationId: '', asignadoAId: '', esperados: '', notas: '' },
    ];
    await expect(pasar(RepartirZonasDto, {
      zonas: filas.filter((f) => f.locationId).map((f) => ({
        locationId: f.locationId,
        asignadoAId: f.asignadoAId || undefined,
        esperados: f.esperados ? Number(f.esperados) : undefined,
        notas: f.notas || undefined,
      })),
    })).resolves.toBeDefined();
  });

  it('POST :id/zonas — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(RepartirZonasDto, { zonas: [], campanaId: ID })).rejects.toThrow();
  });

  // Campanas.tsx:117 · decidir()
  it.each([
    [true, ''],
    [false, 'Faltan fotos en 3 cámaras'],
  ])('PATCH zona/:zonaId/decidir — aprobar %p', async (aprobar, observaciones) => {
    await expect(pasar(DecidirZonaDto, { aprobar, observaciones })).resolves.toBeDefined();
  });

  it('PATCH zona/:zonaId/decidir — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(DecidirZonaDto, { aprobar: true, observaciones: '', revisadoPorId: ID })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('zonas.controller — Zonas.tsx', () => {
  // Zonas.tsx:366 · guardar() del editor de zona
  it('PATCH :id — zona CRÍTICA con todo escrito', async () => {
    await expect(pasar(DeclararZonaDto, {
      criticidadProduccion: 'CRITICA',
      porQueEsVital: 'Sin vista aquí se para la línea.',
      impactoSiSeCae: 'No se ve la salida del horno',
      queSeVigila: 'Descarga del horno',
      revisarAntesDe: '2027-03-31',
    })).resolves.toBeDefined();
  });

  it('PATCH :id — retirar la declaración: nivel null, textos vacíos, sin fecha', async () => {
    const nivel = '';
    const revisar = '';
    await expect(pasar(DeclararZonaDto, {
      criticidadProduccion: nivel || null,
      porQueEsVital: '', impactoSiSeCae: '', queSeVigila: '',
      revisarAntesDe: revisar || null,
    })).resolves.toBeDefined();
  });

  it('PATCH :id — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(DeclararZonaDto, { criticidadProduccion: 'MEDIA', nombre: 'Foso' })).rejects.toThrow();
  });

  // Zonas.tsx:538 · guardar() de la firma de intervención
  it.each([
    ['EN_MARCHA', 'Púlpito climatizado, sin barra', false],
    ['EXIGE_PARADA', '', true],
    ['', '', false],
  ])('PATCH :id/intervencion — %p', async (nivel, motivo, altura) => {
    await expect(pasar(FirmarIntervencionDto, {
      intervencionFirmada: nivel || null,
      intervencionMotivo: motivo,
      requiereAltura: altura,
    })).resolves.toBeDefined();
  });

  it('PATCH :id/intervencion — una clave que nadie declaró se rechaza', async () => {
    await expect(pasar(FirmarIntervencionDto, {
      intervencionFirmada: 'EXIGE_PARADA', intervencionMotivo: '', requiereAltura: false, environment: 'CALOR',
    })).rejects.toThrow();
  });
});
