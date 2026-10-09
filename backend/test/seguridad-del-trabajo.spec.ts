/* Bloque 168 · «formularios de seguridad que no se autocompletan o dejan a criterio técnico». */
import { perfilDeSeguridad, requisitosSinMarcar } from '../src/common/seguridad-del-trabajo';

const claves = (p: ReturnType<typeof perfilDeSeguridad>) => p.requisitos.map((r) => r.clave);

describe('perfil de seguridad del trabajo', () => {
  it('cámara a 6 m en manlift, zona firmada en marcha: altura, PETAR, manlift, dos personas, sin parada', () => {
    const p = perfilDeSeguridad({ tipoEquipo: 'CAMERA', alturaM: 6, medioAcceso: 'MANLIFT', intervencionAplica: 'EN_MARCHA', intervencionFirmada: true, riesgoPersonas: false });
    expect(p.enAltura).toBe(true);
    expect(p.parada).toBe(false);
    expect(p.personasMinimas).toBe(2);
    expect(claves(p)).toEqual(expect.arrayContaining(['ATS', 'EPP_BASICO', 'PETAR_ALTURA', 'EPP_ALTURA', 'MANLIFT', 'ACOMPANANTE']));
    expect(claves(p)).not.toContain('PARADA');
    expect(p.epp).toContain('Arnés de cuerpo entero');
    expect(p.riesgos).toContain('Caída a distinto nivel');
    expect(p.faltaDeclarar).toEqual([]);
  });

  it('desde 1,80 m es altura aunque se llegue en escalera; por debajo, no', () => {
    expect(perfilDeSeguridad({ alturaM: 1.8, medioAcceso: 'ESCALERA', intervencionAplica: 'EN_MARCHA', intervencionFirmada: true }).enAltura).toBe(true);
    expect(perfilDeSeguridad({ alturaM: 1.5, medioAcceso: 'ESCALERA', intervencionAplica: 'EN_MARCHA', intervencionFirmada: true }).enAltura).toBe(false);
  });

  it('zona SIN firma: se trabaja con parada y se dice que falta firmar', () => {
    const p = perfilDeSeguridad({ alturaM: 0.5, medioAcceso: 'A_PIE', intervencionAplica: 'EXIGE_PARADA', intervencionFirmada: false });
    expect(p.parada).toBe(true);
    expect(claves(p)).toContain('PARADA');
    expect(p.faltaDeclarar.join(' ')).toMatch(/interviene la zona/);
  });

  it('acceso no declarado: si la zona exige subir, se trata como altura y propone manlift avisando el origen', () => {
    const p = perfilDeSeguridad({ zonaRequiereAltura: true, intervencionAplica: 'EN_MARCHA', intervencionFirmada: true });
    expect(p.enAltura).toBe(true);
    expect(p.medio).toBe('MANLIFT');
    expect(p.medioOrigen).toBe('zona');
    expect(p.faltaDeclarar.join(' ')).toMatch(/Cómo se llega/);
  });

  it('el acceso DECLARADO del equipo manda sobre la zona (cámara a 2 m en pared, en zona de altura)', () => {
    const p = perfilDeSeguridad({ alturaM: 1.2, medioAcceso: 'A_PIE', zonaRequiereAltura: true, intervencionAplica: 'EN_MARCHA', intervencionFirmada: true });
    expect(p.enAltura).toBe(false);
  });

  it('alimentado desde un tablero que pide permiso: LOTO, EPP eléctrico, dos personas y los riesgos del tablero tal cual', () => {
    const p = perfilDeSeguridad({ alturaM: 1, medioAcceso: 'A_PIE', intervencionAplica: 'EN_MARCHA', intervencionFirmada: true,
      tablero: { codigo: 'TAB-T2-MCC-01', requierePermiso: true, riesgos: 'Barras energizadas a 440 V' } });
    expect(p.bloqueoElectrico).toBe(true);
    expect(claves(p)).toEqual(expect.arrayContaining(['BLOQUEO_LOTO', 'EPP_ELECTRICO', 'ACOMPANANTE']));
    expect(p.riesgos).toContain('Barras energizadas a 440 V');
    expect(p.requisitos.find((r) => r.clave === 'BLOQUEO_LOTO')!.porque).toMatch(/TAB-T2-MCC-01/);
  });

  it('el riesgo para personas que declaró la zona se copia tal cual, y el ambiente añade su EPP', () => {
    const p = perfilDeSeguridad({ intervencionAplica: 'EXIGE_PARADA', intervencionFirmada: true, ambiente: 'CALOR_RADIANTE',
      riesgoPersonas: true, riesgoPersonasMotivo: 'Paso de barra a 1 100 °C' });
    expect(p.riesgos[0]).toBe('Paso de barra a 1 100 °C');
    expect(claves(p)).toContain('EPP_AMBIENTE');
    expect(p.epp).toContain('Ropa ignífuga / aluminizada');
  });

  it('el acompañante no se marca: se declara; lo demás, si falta, se lista', () => {
    const p = perfilDeSeguridad({ alturaM: 8, medioAcceso: 'MANLIFT', intervencionAplica: 'EN_MARCHA', intervencionFirmada: true });
    const faltan = requisitosSinMarcar(p, ['ATS', 'EPP_BASICO', 'ACOMPANANTE']).map((r) => r.clave);
    expect(faltan).toEqual(['PETAR_ALTURA', 'EPP_ALTURA', 'MANLIFT']);
  });
});
