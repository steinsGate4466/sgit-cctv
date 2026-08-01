import {
  diasDePlazo, fechaLimite, estadoDetalle, actividadDesdeIncidencia, PLAZO_POR_DEFECTO,
} from '../src/modules/maintenance/asignacion.util';

/**
 * El modelo de trabajo: el ingeniero ASIGNA cuatro cosas y el técnico de red
 * DETALLA el resto. Estas pruebas fijan las dos reglas que sostienen el modelo:
 * qué plazo se pone solo, y cuándo una orden se considera lista para trabajar.
 */

describe('plazo automático por criticidad', () => {
  it('lo crítico no espera: 2 días', () => {
    expect(diasDePlazo('CRITICA')).toBe(2);
  });

  it('lo de menos riesgo puede esperar: 20 días', () => {
    expect(diasDePlazo('BAJA')).toBe(20);
  });

  it('sin criticidad conocida, plazo por defecto', () => {
    expect(diasDePlazo(null)).toBe(PLAZO_POR_DEFECTO);
  });

  it('una criticidad desconocida no revienta ni deja la orden sin plazo', () => {
    expect(diasDePlazo('LO_QUE_SEA')).toBe(PLAZO_POR_DEFECTO);
  });

  it('la fecha límite acaba al FINAL del día', () => {
    // Una orden con plazo "hoy" no está vencida a las nueve de la mañana. Si
    // no, el tablero mentiría durante toda la jornada.
    const d = fechaLimite('CRITICA', new Date('2026-08-01T10:00:00'));
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe('cuándo una orden está detallada', () => {
  it('sin equipo ni ubicación no se puede trabajar', () => {
    const e = estadoDetalle({ activity: 'revisar algo' });
    expect(e.detallada).toBe(false);
    expect(e.faltan[0]).toMatch(/equipo/);
  });

  it('con solo ubicación basta: las campañas de zona no tienen equipo', () => {
    const e = estadoDetalle({ locationId: 'l1', activity: 'barrido de antenas', detailedAt: new Date() });
    expect(e.detallada).toBe(true);
  });

  it('sin decir qué hay que hacer, no está lista', () => {
    const e = estadoDetalle({ assetId: 'a1', detailedAt: new Date() });
    expect(e.detallada).toBe(false);
  });

  it('tener todos los datos NO la marca como detallada: hace falta el acto', () => {
    // El detallado es una decisión del técnico de red, no un efecto colateral
    // de que los campos estén llenos.
    const e = estadoDetalle({ assetId: 'a1', activity: 'x' });
    expect(e.detallada).toBe(false);
  });
});

describe('cambio de alcance', () => {
  it('cambiar el equipo asignado queda marcado', () => {
    // El ingeniero pidió revisar la cámara y el técnico ve que es el switch.
    // No se impide, pero tiene que verse.
    const e = estadoDetalle({ assignedAssetId: 'camara', assetId: 'switch', activity: 'x', detailedAt: new Date() });
    expect(e.alcanceCambiado).toBe(true);
  });

  it('rellenar un hueco vacío NO es cambiar el alcance', () => {
    // Si el ingeniero no puso equipo, ponerlo es completar, no cambiar.
    const e = estadoDetalle({ assignedAssetId: null, assetId: 'switch', activity: 'x', detailedAt: new Date() });
    expect(e.alcanceCambiado).toBe(false);
  });

  it('el mismo equipo no marca nada', () => {
    const e = estadoDetalle({ assignedAssetId: 'a1', assetId: 'a1', activity: 'x', detailedAt: new Date() });
    expect(e.alcanceCambiado).toBe(false);
  });
});

describe('convertir una incidencia en orden', () => {
  it('arrastra código, título y detalle', () => {
    const a = actividadDesdeIncidencia({ code: 'INC-2026-0007', title: 'Sin imagen', description: 'cámara 45 del lecho' });
    expect(a).toMatch(/INC-2026-0007/);
    expect(a).toMatch(/Sin imagen/);
    expect(a).toMatch(/cámara 45/);
  });

  it('una incidencia sin datos da un texto útil igualmente', () => {
    expect(actividadDesdeIncidencia({})).toMatch(/Atender la incidencia/);
  });
});
