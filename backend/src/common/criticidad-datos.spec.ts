import {
  clasificarPlanta, repartoPorLetra, dificultadDelAcceso, impactoDeLaZona,
  TIPOS_DE_SOPORTE, TIPOS_QUE_VIGILAN,
  type ActivoCrit, type EntradaDePlanta, type UbicacionCrit,
} from './criticidad-datos';
import { PARAMETROS_PROPUESTOS } from './criticidad-abc';

/* =============================================================================
   BLOQUE 76 · DE LOS DATOS DE PLANTA A LA LETRA
   -----------------------------------------------------------------------------
   Lo que se prueba aquí es la CASCADA, que es la parte que no se ve leyendo el
   código: un tablero hereda del switch, que hereda de sus cámaras. Con cuatro
   objetos escritos a mano se comprueba en un segundo; con una base de pruebas
   habría que montar media planta y la prueba acabaría desactivada.

   Todos los casos son de la planta real de Pisco, no inventados: la cámara
   sola del foso, las tres del lecho, el switch del gabinete y el tablero.
============================================================================= */

const CAMARA = (over: Partial<ActivoCrit> = {}): ActivoCrit => ({
  id: 'c1', assetCode: 'AA-CAM-T1-001', type: 'CAMERA', locationId: 'z1',
  medioAcceso: 'A_PIE', impactoOperacional: null, riesgoPersonas: null, ...over,
});

const ZONA = (over: Partial<UbicacionCrit> = {}): UbicacionCrit => ({
  id: 'z1', parentId: null, name: 'Lecho de enfriamiento',
  criticidadProduccion: 'CRITICA', riesgoPersonas: false, riesgoPersonasMotivo: null, ...over,
});

const planta = (over: Partial<EntradaDePlanta> = {}): EntradaDePlanta => ({
  activos: [CAMARA()],
  ubicaciones: [ZONA()],
  fallasPorActivo: new Map(),
  dependientes: new Map(),
  ...over,
});

const letraDe = (datos: EntradaDePlanta, id: string) =>
  clasificarPlanta(datos, PARAMETROS_PROPUESTOS).get(id)!.criticidad.letra;

describe('Bloque 76 — la letra sale de los datos que ya tiene el sistema', () => {
  describe('Lo que declaró Producción se reutiliza, no se vuelve a preguntar', () => {
    it('la criticidad de la zona se traduce a impacto operacional', () => {
      expect(impactoDeLaZona('CRITICA')).toBe(4);
      expect(impactoDeLaZona('ALTA')).toBe(3);
      expect(impactoDeLaZona('MEDIA')).toBe(2);
      expect(impactoDeLaZona('BAJA')).toBe(1);
    });

    it('una zona sin declarar deja el equipo SIN CLASIFICAR, nunca en C', () => {
      /* Ponerlo en C haría que cuatrocientas cámaras sin revisar parecieran
         poco importantes, y nadie las revisaría nunca. */
      const d = planta({ ubicaciones: [ZONA({ criticidadProduccion: null })] });
      expect(letraDe(d, 'c1')).toBe('SIN_CLASIFICAR');
    });

    it('el impacto se hereda aunque lo declare la ETAPA y no la zona concreta', () => {
      /* El árbol de planta manda: la cámara cuelga de una zona que cuelga de
         una etapa. Si sólo se mirara el padre inmediato, declarar la etapa no
         serviría de nada y habría que declarar zona por zona. */
      const d = planta({
        activos: [CAMARA({ locationId: 'z2' })],
        ubicaciones: [
          ZONA({ id: 'etapa', parentId: null, criticidadProduccion: 'CRITICA' }),
          ZONA({ id: 'z2', parentId: 'etapa', criticidadProduccion: null, riesgoPersonas: false }),
        ],
      });
      const r = clasificarPlanta(d, PARAMETROS_PROPUESTOS).get('c1')!;
      expect(r.entrada.impactoOperacional).toBe(4);
      expect(r.origenImpacto).toBe('ZONA');
    });

    it('lo que declara el ACTIVO gana a lo de la zona', () => {
      /* Dos cámaras en la misma zona pueden mirar cosas distintas: una al paso
         de grúa y otra a un pasillo. Sin esto habría que elegir entre subir de
         más toda la zona o dejar sin proteger la que lo necesita. */
      const d = planta({ activos: [CAMARA({ impactoOperacional: 1 })] });
      const r = clasificarPlanta(d, PARAMETROS_PROPUESTOS).get('c1')!;
      expect(r.entrada.impactoOperacional).toBe(1);
      expect(r.origenImpacto).toBe('ACTIVO');
    });
  });

  describe('El respaldo se cuenta, no se pregunta', () => {
    it('una cámara sola en su sitio no tiene respaldo', () => {
      const r = clasificarPlanta(planta(), PARAMETROS_PROPUESTOS).get('c1')!;
      expect(r.entrada.equiposQueCubrenLoMismo).toBe(0);
    });

    it('tres cámaras en la misma zona se cubren entre ellas, y la letra BAJA', () => {
      /* Es la «flexibilidad operacional» del método CTR, y en CCTV es literal:
         si otra cámara ve lo mismo, ésta puede esperar a la próxima parada. */
      const sola = planta();
      const acompanada = planta({
        activos: [
          CAMARA(),
          CAMARA({ id: 'c2', assetCode: 'AA-CAM-T1-002' }),
          CAMARA({ id: 'c3', assetCode: 'AA-CAM-T1-003' }),
        ],
      });
      const rSola = clasificarPlanta(sola, PARAMETROS_PROPUESTOS).get('c1')!;
      const rAcomp = clasificarPlanta(acompanada, PARAMETROS_PROPUESTOS).get('c1')!;

      expect(rSola.entrada.equiposQueCubrenLoMismo).toBe(0);
      expect(rAcomp.entrada.equiposQueCubrenLoMismo).toBe(2);
      expect(rAcomp.criticidad.puntaje!).toBeLessThan(rSola.criticidad.puntaje!);
    });

    it('un equipo NO se cuenta a sí mismo como respaldo', () => {
      const r = clasificarPlanta(
        planta({ activos: [CAMARA(), CAMARA({ id: 'c2', assetCode: 'X' })] }),
        PARAMETROS_PROPUESTOS,
      ).get('c1')!;
      expect(r.entrada.equiposQueCubrenLoMismo).toBe(1);
    });

    it('dos switches en la misma sala NO se cubren el uno al otro', () => {
      /* Cada uno tiene enchufadas sus propias cámaras. Contarlos como respaldo
         mutuo bajaría la letra de los dos y se revisarían la mitad de veces. */
      const d = planta({
        activos: [
          CAMARA({ id: 's1', assetCode: 'SW-1', type: 'SWITCH' }),
          CAMARA({ id: 's2', assetCode: 'SW-2', type: 'SWITCH' }),
        ],
      });
      const r = clasificarPlanta(d, PARAMETROS_PROPUESTOS).get('s1')!;
      expect(r.entrada.equiposQueCubrenLoMismo).toBe(0);
    });
  });

  describe('Cómo se llega sale del acceso ya declarado (bloque 41)', () => {
    it('a pie es lo más fácil y la grúa lo más difícil', () => {
      expect(dificultadDelAcceso('A_PIE')).toBe(1);
      expect(dificultadDelAcceso('GRUA')).toBe(4);
    });

    it('sin declarar NO es «a pie»', () => {
      /* Suponer lo más cómodo justo donde falta información es exactamente al
         revés de como falla este proyecto: se falla hacia el lado seguro. */
      expect(dificultadDelAcceso(null)).toBeGreaterThan(1);
      expect(dificultadDelAcceso('OTRO')).toBeGreaterThan(1);
    });
  });

  describe('La regla del soporte: un switch hereda de lo que sostiene', () => {
    const conSwitch = (letraDeLaCamara: 'A' | 'C'): EntradaDePlanta => planta({
      activos: [
        CAMARA({
          impactoOperacional: letraDeLaCamara === 'A' ? 4 : 1,
          riesgoPersonas: false,
          medioAcceso: letraDeLaCamara === 'A' ? 'GRUA' : 'A_PIE',
        }),
        CAMARA({ id: 'sw', assetCode: 'AA-SW-T1-01', type: 'SWITCH', locationId: 'gab' }),
      ],
      ubicaciones: [ZONA(), ZONA({ id: 'gab', criticidadProduccion: null })],
      fallasPorActivo: new Map(letraDeLaCamara === 'A' ? [['c1', 4]] : []),
      dependientes: new Map([['sw', ['c1']]]),
    });

    it('hereda la letra de la cámara que sostiene', () => {
      expect(letraDe(conSwitch('A'), 'c1')).toBe('A');
      expect(letraDe(conSwitch('A'), 'sw')).toBe('A');
    });

    it('si lo que sostiene no importa, el switch tampoco', () => {
      expect(letraDe(conSwitch('C'), 'sw')).toBe('C');
    });

    it('un switch SIN NADA ENCHUFADO no se trata como soporte', () => {
      /* Si se tratara como soporte se quedaría en SIN_CLASIFICAR para siempre,
         cuando lo que pasa es que aún no se ha declarado qué tiene conectado.
         Cae por el camino normal y sale como pendiente, que es la verdad. */
      const d = planta({
        activos: [CAMARA({ id: 'sw', assetCode: 'SW', type: 'SWITCH', locationId: 'gab' })],
        ubicaciones: [ZONA({ id: 'gab', criticidadProduccion: null })],
      });
      const r = clasificarPlanta(d, PARAMETROS_PROPUESTOS).get('sw')!;
      expect(r.criticidad.letra).toBe('SIN_CLASIFICAR');
      expect(r.criticidad.porSoporte).toBe(false);
    });

    it('la cadena entera: tablero ← switch ← cámara', () => {
      /* Es la cadena de planta escrita en ESTANDAR_ACTIVOS.md:
         220 V (tablero) → switch PoE → cámaras. Si el tablero no heredara,
         saltaría una llave y nadie sabría que se apagó lo más crítico. */
      const d = planta({
        activos: [
          CAMARA({ impactoOperacional: 4, riesgoPersonas: true }),
          CAMARA({ id: 'sw', assetCode: 'SW', type: 'SWITCH', locationId: 'gab' }),
          CAMARA({ id: 'tab', assetCode: 'TAB', type: 'TABLERO_ELECTRICO', locationId: 'gab' }),
        ],
        ubicaciones: [ZONA(), ZONA({ id: 'gab', criticidadProduccion: null })],
        dependientes: new Map([['sw', ['c1']], ['tab', ['sw']]]),
      });
      expect(letraDe(d, 'c1')).toBe('A');
      expect(letraDe(d, 'sw')).toBe('A');
      expect(letraDe(d, 'tab')).toBe('A');
    });

    it('la CANTIDAD no sube la letra: dieciséis cámaras C siguen dando C', () => {
      /* Perder dieciséis cosas que no importaban sigue sin importar. La
         cantidad se dice en el porqué, no en la letra. */
      const camaras = Array.from({ length: 16 }, (_, i) => CAMARA({
        id: `c${i}`, assetCode: `AA-CAM-${i}`, locationId: `z${i}`,
        impactoOperacional: 1, riesgoPersonas: false,
      }));
      const d = planta({
        activos: [...camaras, CAMARA({ id: 'nvr', assetCode: 'NVR', type: 'NVR', locationId: 'gab' })],
        ubicaciones: [
          ...camaras.map((c) => ZONA({ id: c.locationId!, criticidadProduccion: 'BAJA' })),
          ZONA({ id: 'gab', criticidadProduccion: null }),
        ],
        dependientes: new Map([['nvr', camaras.map((c) => c.id)]]),
      });
      expect(letraDe(d, 'nvr')).toBe('C');
    });

    it('un ciclo declarado por error NO cuelga el servidor', () => {
      /* Si alguien declara desde la pantalla que A cuelga de B y B de A, sin
         guarda la recursión no termina y la pantalla nunca responde. Un fallo
         de datos no puede dejar la pantalla en blanco. */
      const d = planta({
        activos: [
          CAMARA({ id: 'sw1', assetCode: 'SW1', type: 'SWITCH', locationId: 'gab' }),
          CAMARA({ id: 'sw2', assetCode: 'SW2', type: 'SWITCH', locationId: 'gab' }),
        ],
        ubicaciones: [ZONA({ id: 'gab', criticidadProduccion: null })],
        dependientes: new Map([['sw1', ['sw2']], ['sw2', ['sw1']]]),
      });
      const m = clasificarPlanta(d, PARAMETROS_PROPUESTOS);
      expect(m.size).toBeGreaterThan(0);
    });

    it('un ciclo en el ÁRBOL DE UBICACIONES tampoco lo cuelga', () => {
      const d = planta({
        ubicaciones: [
          ZONA({ id: 'z1', parentId: 'z2', criticidadProduccion: null, riesgoPersonas: null }),
          ZONA({ id: 'z2', parentId: 'z1', criticidadProduccion: null, riesgoPersonas: null }),
        ],
      });
      expect(letraDe(d, 'c1')).toBe('SIN_CLASIFICAR');
    });
  });

  describe('La seguridad no se promedia, tampoco heredada de la zona', () => {
    it('una zona con riesgo para personas hace A a su cámara, aunque todo lo demás sea mínimo', () => {
      const d = planta({
        activos: [CAMARA({ medioAcceso: 'A_PIE' }), CAMARA({ id: 'c2', assetCode: 'B' }),
          CAMARA({ id: 'c3', assetCode: 'C' }), CAMARA({ id: 'c4', assetCode: 'D' })],
        ubicaciones: [ZONA({ criticidadProduccion: 'BAJA', riesgoPersonas: true, riesgoPersonasMotivo: 'Paso de grúa' })],
      });
      const r = clasificarPlanta(d, PARAMETROS_PROPUESTOS).get('c1')!;
      expect(r.criticidad.letra).toBe('A');
      expect(r.criticidad.porSeguridad).toBe(true);
      // El motivo viaja para poder pintarlo: «es A porque aquí pasa la grúa».
      expect(r.riesgoMotivo).toBe('Paso de grúa');
    });

    it('el activo puede decir que ÉL no mira el peligro, y entonces no es A por seguridad', () => {
      const d = planta({
        activos: [CAMARA({ riesgoPersonas: false, impactoOperacional: 1 })],
        ubicaciones: [ZONA({ criticidadProduccion: 'BAJA', riesgoPersonas: true, riesgoPersonasMotivo: 'Foso' })],
      });
      const r = clasificarPlanta(d, PARAMETROS_PROPUESTOS).get('c1')!;
      expect(r.criticidad.porSeguridad).toBe(false);
      expect(r.origenRiesgo).toBe('ACTIVO');
    });
  });

  describe('El reparto de la planta', () => {
    it('cuenta cada letra, y los pendientes también', () => {
      const d = planta({
        activos: [
          CAMARA({ impactoOperacional: 4, riesgoPersonas: true }),
          CAMARA({ id: 'c2', assetCode: 'B', impactoOperacional: 1, riesgoPersonas: false }),
          CAMARA({ id: 'c3', assetCode: 'C', locationId: 'sinDeclarar' }),
        ],
        ubicaciones: [ZONA(), ZONA({ id: 'sinDeclarar', criticidadProduccion: null, riesgoPersonas: null })],
      });
      const r = repartoPorLetra(clasificarPlanta(d, PARAMETROS_PROPUESTOS));
      expect(r.A).toBe(1);
      expect(r.SIN_CLASIFICAR).toBe(1);
      expect(r.A + r.B + r.C + r.SIN_CLASIFICAR).toBe(3);
    });
  });

  describe('Las listas de tipos', () => {
    it('la fibra no está en ninguna: un cable no es un activo (regla 1)', () => {
      expect(TIPOS_DE_SOPORTE.has('FIBER')).toBe(false);
      expect(TIPOS_QUE_VIGILAN.has('FIBER')).toBe(false);
    });

    it('el switch y el grabador son soporte; la cámara no', () => {
      expect(TIPOS_DE_SOPORTE.has('SWITCH')).toBe(true);
      expect(TIPOS_DE_SOPORTE.has('NVR')).toBe(true);
      expect(TIPOS_DE_SOPORTE.has('TABLERO_ELECTRICO')).toBe(true);
      expect(TIPOS_DE_SOPORTE.has('CAMERA')).toBe(false);
    });
  });
});
