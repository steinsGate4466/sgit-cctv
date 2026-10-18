import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  ColgarActivoDto, CrearCircuitoDto, CrearTableroDto, EditarCircuitoDto, EditarTableroDto, MedicionDto,
} from '../src/modules/electricidad/dto/electricidad.dto';
import {
  ActualizarPlantillaDto, ActualizarPuntoDto, AgregarPuntoDto, CrearPlantillaDto, ResponderPuntoDto,
} from '../src/modules/checklist/dto/checklist.dto';
import {
  DecidirMejoraDto, DejarNotaDto, GuardarProcedimientoDto, ProponerMejoraDto,
} from '../src/modules/procedimientos/dto/procedimientos.dto';

/**
 * BLOQUE 174 · LOS DTO DE ELECTRICIDAD, RUTINAS Y PROCEDIMIENTOS ACEPTAN LO
 * QUE MANDAN LAS PANTALLAS.
 *
 * El riesgo de cerrar la deuda del bloque 85 es el del bloque 90 (Roles): con
 * `forbidNonWhitelisted`, una clave que la pantalla manda y el DTO no declara
 * tumba la petición con un 400 y el formulario deja de guardar.
 *
 * Por eso cada prueba de abajo reproduce EXACTAMENTE el cuerpo de una llamada
 * real del frontend (archivo:línea en el título), pasado por JSON como viaja
 * de verdad — `undefined` desaparece, `NaN` se vuelve `null` —, y con el
 * mismo pipe que `main.ts`. Y cada DTO tiene la prueba contraria: una clave
 * desconocida SÍ se rechaza, o el DTO no estaría validando nada.
 */

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const meta = (metatype: any): ArgumentMetadata => ({ type: 'body', metatype, data: '' });
/** Como viaja por la red: lo que axios hace con el objeto. */
const comoJson = (o: unknown) => JSON.parse(JSON.stringify(o));
const pasa = (Dto: any, cuerpo: unknown) => pipe.transform(comoJson(cuerpo), meta(Dto));

const UUID = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
const UUID2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

// ============================================================ ELECTRICIDAD
describe('electricidad · lo que manda pages/Electricidad.tsx', () => {
  it('POST /electricidad/tableros (Electricidad.tsx:90) — formulario recién abierto, sólo el código', async () => {
    // Estado inicial de Electricidad.tsx:250, con el código escrito.
    await expect(pasa(CrearTableroDto, {
      codigo: 'TAB-T2-MCC-01', nombre: '', tipo: 'DISTRIBUCION', tren: '', locationId: '',
      referencia: '', comoLlegar: '', tensionV: '', fases: '', riesgos: '', requierePermiso: true,
    })).resolves.toBeDefined();
  });

  it('POST /electricidad/tableros (Electricidad.tsx:90) — formulario completo', async () => {
    await expect(pasa(CrearTableroDto, {
      codigo: 'TAB-T2-MCC-01', nombre: 'MCC del Tren 2', tipo: 'MCC', tren: 'TREN_2', locationId: UUID,
      referencia: 'Sala eléctrica T2, al fondo', comoLlegar: 'Por la escalera del púlpito',
      tensionV: '440', fases: '3', riesgos: 'Barras energizadas al abrir. Riesgo de arco.',
      requierePermiso: true,
    })).resolves.toBeDefined();
  });

  it('POST /electricidad/tableros/:id/circuitos (Electricidad.tsx:100) — lleva tableroId dentro', async () => {
    // Estado inicial de Electricidad.tsx:309: el formulario entero, tableroId incluido.
    await expect(pasa(CrearCircuitoDto, {
      tableroId: UUID, numero: '12', designacion: '', proteccion: 'TERMOMAGNETICO',
      amperajeA: '', polos: '', estado: 'ACTIVO', esCctv: false,
    })).resolves.toBeDefined();
    await expect(pasa(CrearCircuitoDto, {
      tableroId: UUID, numero: 'Q-3', designacion: 'Switch PoE sala 1', proteccion: 'DIFERENCIAL',
      amperajeA: '16', polos: '2', estado: 'RESERVA', esCctv: false,
    })).resolves.toBeDefined();
  });

  it('POST /electricidad/circuitos/:id/activos (Electricidad.tsx:116) — colgar, con y sin PoE', async () => {
    await expect(pasa(ColgarActivoDto, { assetId: UUID, viaPoe: true })).resolves.toBeDefined();
    await expect(pasa(ColgarActivoDto, { assetId: UUID, viaPoe: false })).resolves.toBeDefined();
  });

  it('POST /electricidad/mediciones (Electricidad.tsx:131) — de un circuito, sólo temperatura', async () => {
    // Los `|| undefined` desaparecen al pasar a JSON.
    await expect(pasa(MedicionDto, {
      circuitoId: UUID, tableroId: undefined, tensionV: undefined, corrienteA: undefined,
      temperaturaC: '65.5', observacion: undefined,
    })).resolves.toBeDefined();
  });

  it('POST /electricidad/mediciones (Electricidad.tsx:131) — del tablero, todo relleno', async () => {
    await expect(pasa(MedicionDto, {
      circuitoId: undefined, tableroId: UUID, tensionV: '220', corrienteA: '12.4',
      temperaturaC: '41', observacion: 'Borne R algo caliente al tacto.',
    })).resolves.toBeDefined();
  });

  /* Sin pantalla hoy: se prueba con todo lo que lee el servicio, para que el
     día que se haga la pantalla de edición no nazca rota. */
  it('PATCH /electricidad/tableros/:id (sin llamada en el frontend) — todo lo que lee el servicio', async () => {
    await expect(pasa(EditarTableroDto, {
      nombre: 'MCC T2', tipo: 'MCC', locationId: null, tren: 'T2', referencia: '', comoLlegar: '',
      riesgos: null, notas: '', alimentadoDeId: UUID2, tensionV: '', fases: 3,
      corrienteNominalA: '250.5', requierePermiso: false,
    })).resolves.toBeDefined();
  });

  it('PATCH /electricidad/circuitos/:id (sin llamada en el frontend) — todo lo que lee el servicio', async () => {
    await expect(pasa(EditarCircuitoDto, {
      numero: '12', designacion: '', proteccion: 'FUSIBLE', curva: 'C', estado: 'DESCONOCIDO',
      notas: null, amperajeA: '', polos: null, tensionV: '220', esCctv: true,
    })).resolves.toBeDefined();
  });

  it('el alta de tablero también acepta lo que lee el servicio y la pantalla aún no manda', async () => {
    await expect(pasa(CrearTableroDto, {
      codigo: 'TAB-01', corrienteNominalA: '100', alimentadoDeId: UUID2, notas: 'x',
    })).resolves.toBeDefined();
    await expect(pasa(CrearCircuitoDto, { numero: '1', curva: 'B', tensionV: '220', notas: 'x' }))
      .resolves.toBeDefined();
    await expect(pasa(ColgarActivoDto, { assetId: UUID, viaPoe: true, notas: 'Por el puerto 3' }))
      .resolves.toBeDefined();
  });

  it('colgar sin decir qué equipo se rechaza con 400, no revienta el servicio', async () => {
    await expect(pasa(ColgarActivoDto, { viaPoe: true })).rejects.toThrow(BadRequestException);
  });

  it('un tipo de tablero que no existe se rechaza', async () => {
    await expect(pasa(CrearTableroDto, { codigo: 'TAB-01', tipo: 'NUCLEAR' })).rejects.toThrow(BadRequestException);
  });
});

// =============================================================== CHECKLIST
describe('checklist · lo que mandan RutinasEditor.tsx y RutinaEnCampo.tsx', () => {
  it('POST /checklist/plantillas (RutinasEditor.tsx:54)', async () => {
    await expect(pasa(CrearPlantillaDto, { assetType: 'CAMERA' })).resolves.toBeDefined();
    await expect(pasa(CrearPlantillaDto, { assetType: 'CABINET' })).resolves.toBeDefined();
  });

  it('POST /checklist/plantillas/:id/puntos (RutinasEditor.tsx:70) — punto nuevo, ayuda vacía', async () => {
    // Estado inicial de RutinasEditor.tsx:177.
    await expect(pasa(AgregarPuntoDto, {
      text: 'Limpiar el lente y comprobar imagen en el púlpito', help: '', sequence: 30, critical: false,
    })).resolves.toBeDefined();
  });

  it('PATCH /checklist/puntos/:id (RutinasEditor.tsx:65) — editar un punto que venía sin ayuda', async () => {
    // `setPunto({ ...i })`: la ayuda viene de la base como null.
    await expect(pasa(ActualizarPuntoDto, {
      text: 'Revisar el prensaestopa', help: null, sequence: 0, critical: true,
    })).resolves.toBeDefined();
  });

  it('POST /checklist/orden/:woId (RutinaEnCampo.tsx:71) — OK sin nota', async () => {
    // `note` es undefined y desaparece en el JSON.
    await expect(pasa(ResponderPuntoDto, { itemId: UUID, result: 'OK', note: undefined }))
      .resolves.toBeDefined();
    await expect(pasa(ResponderPuntoDto, { itemId: UUID, result: 'NO_APLICA', note: undefined }))
      .resolves.toBeDefined();
  });

  it('POST /checklist/orden/:woId (RutinaEnCampo.tsx:71) — NO conforme con su nota', async () => {
    await expect(pasa(ResponderPuntoDto, {
      itemId: UUID, result: 'NO_OK', note: 'Prensaestopa roto, entra agua.',
    })).resolves.toBeDefined();
  });

  it('PATCH /checklist/plantillas/:id (sin llamada en el frontend) — lo que lee el servicio', async () => {
    await expect(pasa(ActualizarPlantillaDto, { name: 'Rutina de cámaras', active: false }))
      .resolves.toBeDefined();
  });

  it('PATCH /checklist/puntos/:id — desactivar con `active`, que el servicio sí lee', async () => {
    await expect(pasa(ActualizarPuntoDto, { active: false })).resolves.toBeDefined();
  });

  it('un resultado que no es OK / NO_OK / NO_APLICA se rechaza', async () => {
    await expect(pasa(ResponderPuntoDto, { itemId: UUID, result: 'BIEN' })).rejects.toThrow(BadRequestException);
  });
});

// ========================================================= PROCEDIMIENTOS
describe('procedimientos · lo que mandan CampoDelTurno.tsx y Mejoras.tsx', () => {
  it('POST /activos/:id/notas (CampoDelTurno.tsx:210) — aviso con su caducidad', async () => {
    await expect(pasa(DejarNotaDto, {
      tipo: 'DEJADO_A_MEDIAS', texto: 'Quedó el conector provisional, falta cambiarlo.', diasVigencia: 30,
    })).resolves.toBeDefined();
  });

  it('POST /activos/:id/notas (CampoDelTurno.tsx:210) — con el número de días borrado (NaN → null)', async () => {
    // `setDias(Number(''))` deja NaN, y JSON lo manda como null.
    await expect(pasa(DejarNotaDto, {
      tipo: 'RIESGO_ACCESO', texto: 'La escalera del poste 4 está floja.', diasVigencia: Number(''),
    })).resolves.toBeDefined();
  });

  it('POST /procedimientos/:id/mejoras (CampoDelTurno.tsx:272) — con y sin minutos', async () => {
    await expect(pasa(ProponerMejoraDto, {
      texto: 'Antes de desmontar, reiniciar el PoE del puerto.', minutosReales: 25,
    })).resolves.toBeDefined();
    // `minutos || undefined` con el campo vacío.
    await expect(pasa(ProponerMejoraDto, {
      texto: 'Antes de desmontar, reiniciar el PoE del puerto.', minutosReales: undefined,
    })).resolves.toBeDefined();
  });

  it('PATCH /procedimientos-mejoras/:id (Mejoras.tsx:126) — aceptar, sin motivo', async () => {
    await expect(pasa(DecidirMejoraDto, { estado: 'ACEPTADA', motivo: undefined, comoPaso: true }))
      .resolves.toBeDefined();
    await expect(pasa(DecidirMejoraDto, { estado: 'ACEPTADA', motivo: undefined, comoPaso: false }))
      .resolves.toBeDefined();
  });

  it('PATCH /procedimientos-mejoras/:id (Mejoras.tsx:126) — rechazar, con motivo', async () => {
    await expect(pasa(DecidirMejoraDto, {
      estado: 'RECHAZADA', motivo: 'Ya está en el paso 3.', comoPaso: true,
    })).resolves.toBeDefined();
  });

  it('POST /procedimientos (sin llamada en el frontend) — todo lo que lee el servicio', async () => {
    await expect(pasa(GuardarProcedimientoDto, {
      id: UUID, tipoActivo: 'CAMERA', marca: 'Hikvision', modelo: '', titulo: 'Cámara sin imagen',
      pasos: ['Comprobar PoE en el switch', 'Reiniciar el puerto'], advertencias: null,
      minutosEstimados: 30, activo: true,
    })).resolves.toBeDefined();
    await expect(pasa(GuardarProcedimientoDto, {
      tipoActivo: 'NVR', titulo: 'Grabador no graba', pasos: ['Revisar disco'],
    })).resolves.toBeDefined();
  });

  it('un tipo de aviso desconocido NO se rechaza: el servicio lo convierte en VIGILAR', async () => {
    await expect(pasa(DejarNotaDto, { tipo: 'OTRA_COSA', texto: 'Aviso de prueba' })).resolves.toBeDefined();
  });
});

// ================================== LA PRUEBA CONTRARIA: UNA CLAVE DE MÁS
describe('cada DTO rechaza una clave que nadie declaró', () => {
  const casos: [string, any, Record<string, unknown>][] = [
    ['CrearTableroDto', CrearTableroDto, { codigo: 'TAB-01' }],
    ['EditarTableroDto', EditarTableroDto, { nombre: 'x' }],
    ['CrearCircuitoDto', CrearCircuitoDto, { numero: '1' }],
    ['EditarCircuitoDto', EditarCircuitoDto, { numero: '1' }],
    ['ColgarActivoDto', ColgarActivoDto, { assetId: UUID }],
    ['MedicionDto', MedicionDto, { circuitoId: UUID }],
    ['CrearPlantillaDto', CrearPlantillaDto, { assetType: 'CAMERA' }],
    ['ActualizarPlantillaDto', ActualizarPlantillaDto, { name: 'x' }],
    ['AgregarPuntoDto', AgregarPuntoDto, { text: 'x' }],
    ['ActualizarPuntoDto', ActualizarPuntoDto, { text: 'x' }],
    ['ResponderPuntoDto', ResponderPuntoDto, { itemId: UUID, result: 'OK' }],
    ['DejarNotaDto', DejarNotaDto, { texto: 'Aviso de prueba' }],
    ['GuardarProcedimientoDto', GuardarProcedimientoDto, { titulo: 'x' }],
    ['ProponerMejoraDto', ProponerMejoraDto, { texto: 'Una mejora larga' }],
    ['DecidirMejoraDto', DecidirMejoraDto, { estado: 'ACEPTADA' }],
  ];

  it.each(casos)('%s: válido pasa, y con `createdAt` de más da 400', async (_n, Dto, valido) => {
    await expect(pasa(Dto, valido)).resolves.toBeDefined();
    await expect(pasa(Dto, { ...valido, createdAt: '2026-10-16T10:00:00.000Z' })).rejects.toThrow(BadRequestException);
  });
});
