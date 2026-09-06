import * as fs from 'fs';
import * as path from 'path';
import {
  alAbrirOrden, alCerrarOrden, porQueCambio, INCIDENCIA_VIVA,
} from '../src/common/incidencia-sigue-a-la-om';

/* =============================================================================
   BLOQUE 97 · LA INCIDENCIA SIGUE A SU ORDEN
   -----------------------------------------------------------------------------
   El usuario lo vio en pantalla: convertía la incidencia en OM y la incidencia
   seguía «Abierta» mientras el activo ya decía «En mantenimiento».
============================================================================= */

const leer = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('Al ABRIR la orden', () => {
  it('la incidencia pasa a EN_PROCESO', () => {
    expect(alAbrirOrden('ABIERTA')).toBe('EN_PROCESO');
    expect(alAbrirOrden('EN_DIAGNOSTICO')).toBe('EN_PROCESO');
  });

  it('NO pisa EN_ESPERA: la puso el técnico y dice por qué está parada', () => {
    /* Sobrescribirla borraría el motivo —falta repuesto, falta manlift— y
       entonces nadie sabe por qué lleva tres días sin moverse. */
    expect(alAbrirOrden('EN_ESPERA')).toBeNull();
  });

  it('NO reabre una incidencia ya resuelta o cerrada', () => {
    /* Si de verdad volvió a fallar es una incidencia NUEVA, y así el recuento
       del mes dice dos — que es la verdad. Reabrir reescribe un hecho pasado. */
    expect(alAbrirOrden('RESUELTA')).toBeNull();
    expect(alAbrirOrden('CERRADA')).toBeNull();
  });

  it('no escribe por escribir si ya estaba en proceso', () => {
    expect(alAbrirOrden('EN_PROCESO')).toBeNull();
  });
});

describe('Al CERRAR la orden', () => {
  it('la incidencia pasa a RESUELTA cuando no queda ninguna abierta', () => {
    expect(alCerrarOrden('EN_PROCESO', 0)).toBe('RESUELTA');
    expect(alCerrarOrden('ABIERTA', 0)).toBe('RESUELTA');
  });

  it('CON OTRA ORDEN ABIERTA NO SE RESUELVE', () => {
    /* Una incidencia puede necesitar dos órdenes —se cambia la fuente y luego
       el cable—. Resolverla al cerrar la primera diría «arreglado» con trabajo
       en curso, y cortaría el MTTR antes de tiempo. */
    expect(alCerrarOrden('EN_PROCESO', 1)).toBeNull();
    expect(alCerrarOrden('EN_PROCESO', 3)).toBeNull();
  });

  it('no toca la que ya estaba resuelta o cerrada', () => {
    expect(alCerrarOrden('RESUELTA', 0)).toBeNull();
    expect(alCerrarOrden('CERRADA', 0)).toBeNull();
  });

  it('RESUELTA no es CERRADA: el cierre lo firma el Jefe', () => {
    /* Si el cierre fuera automático nadie revisaría nunca. Y el MTTR se mide
       hasta RESUELTA —cuando el servicio volvió—, no hasta que el Jefe la
       revise, que puede tardar días y no es tiempo de avería. */
    const destinos = INCIDENCIA_VIVA.map((e) => alCerrarOrden(e, 0));
    expect(destinos).not.toContain('CERRADA');
  });
});

describe('Cómo queda enganchado, que es donde está el riesgo', () => {
  const svc = leer('src/modules/maintenance/maintenance.service.ts');

  it('se refleja al abrir Y al cerrar, no sólo en uno de los dos', () => {
    /* Media puerta es peor que ninguna: la incidencia se movería a EN_PROCESO
       y se quedaría ahí para siempre. */
    expect((svc.match(/reflejarEnIncidencia\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(svc).toContain("'abrir'");
    expect(svc).toContain("'cerrar'");
  });

  it('cuenta las OTRAS órdenes abiertas antes de resolver', () => {
    expect(svc).toContain("status: { notIn: ['CERRADA', 'CANCELADA'] }");
  });

  it('`resolvedAt` sólo se escribe si estaba vacía', () => {
    /* Es la mitad del MTTR. Pisarla movería una fecha que ya se contó en el
       informe del mes. */
    expect(svc).toContain('!inci.resolvedAt ? { resolvedAt: new Date() } : {}');
  });

  it('el fallo del reflejo NO se silencia: queda en auditoría', () => {
    /* Un `catch` vacío sobre una escritura es una mentira (bloque 77). Aquí no
       se tumba la orden —ya está guardada— pero se deja escrito. */
    expect(svc).toContain("'INC_ESTADO_POR_OM_FALLO'");
    expect(svc).toContain("'INC_ESTADO_POR_OM'");
  });

  it('la auditoría dice POR QUÉ cambió, no sólo que cambió', () => {
    /* Sin el motivo, tres semanas después parece que alguien tocó la
       incidencia a mano y nadie sabe quién. */
    expect(porQueCambio('ABIERTA', 'EN_PROCESO', 'OM-2026-0042')).toContain('OM-2026-0042');
    expect(porQueCambio('EN_PROCESO', 'RESUELTA', 'OM-2026-0042')).toContain('no queda ninguna');
    expect(svc).toContain('porQueCambio(actual, destino, codigoOm)');
  });

  it('la orden EMPUJA a la incidencia, nunca al revés', () => {
    /* Cerrar la incidencia a mano no puede cerrar la orden: la orden lleva
       materiales retirados y firma. */
    const inc = leer('src/modules/incidents/incidents.service.ts');
    expect(inc).not.toContain('workOrder.update');
    expect(inc).not.toContain("status: 'CERRADA'");
  });
});
