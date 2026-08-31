import {
  FallaParaCalculo, disponibilidadReal, mtbfReal, nivelDeServicio, peoresPorFallas,
  tiempoDeDeteccion, tiempoDeRespuesta, tiempoDeReparacion, tiempoSinServicio,
} from './fiabilidad';

/* =============================================================================
   BLOQUE 78 · LOS TRES TRAMOS, CADA UNO CON SU DUEÑO
   -----------------------------------------------------------------------------
   El caso que da sentido a todo el módulo, y es de planta real:

       03:00  la cámara del lecho se apaga
       08:00  el operador del púlpito lo ve al entrar de turno
       10:00  el técnico sube
       11:00  vuelve a funcionar

   El MTTR viejo —de orden abierta a orden cerrada— diría 8 horas y le cargaría
   a mantenimiento 7 que no son suyas. Aquí son 5 de detección, 2 de
   organización y 1 de reparación.
============================================================================= */

const h = (hora: number) => new Date(2026, 8, 1, hora, 0, 0);

const falla = (o: Partial<FallaParaCalculo> = {}): FallaParaCalculo => ({
  assetId: 'cam-1',
  occurredAt: h(3),
  detectedAt: h(8),
  repairStartedAt: h(10),
  restoredAt: h(11),
  ocurrioEsEstimado: false,
  esFalsaAlarma: false,
  ...o,
});

describe('Bloque 78 — fiabilidad sobre averías, no sobre órdenes', () => {
  describe('Cada tramo mide lo suyo', () => {
    it('la detección son las horas hasta que alguien se entera', () => {
      expect(tiempoDeDeteccion([falla()]).horas).toBe(5);
    });

    it('la respuesta son las horas hasta que alguien se pone', () => {
      expect(tiempoDeRespuesta([falla()]).horas).toBe(2);
    });

    it('la reparación es SÓLO el trabajo — el MTTR de mantenimiento', () => {
      /* Éste es el número que defiende el jefe de mantenimiento. Si aquí
         entraran las cinco horas de detección, estaría defendiendo un dato
         que no le corresponde. */
      expect(tiempoDeReparacion([falla()]).horas).toBe(1);
    });

    it('lo que sufre Producción es el total: 8 horas', () => {
      expect(tiempoSinServicio([falla()]).horas).toBe(8);
    });

    it('los cuatro tramos NO son el mismo número', () => {
      const f = [falla()];
      const v = [
        tiempoDeDeteccion(f).horas, tiempoDeRespuesta(f).horas,
        tiempoDeReparacion(f).horas, tiempoSinServicio(f).horas,
      ];
      expect(new Set(v).size).toBe(4);
    });
  });

  describe('Lo estimado no se disfraza de medido', () => {
    it('una falla sin hora real de caída NO entra en el tiempo de detección', () => {
      /* Con `occurredAt = detectedAt` el tramo sale cero y diría que nos
         enteramos al instante. Es exactamente la mentira que este módulo
         viene a quitar. */
      const estimada = falla({ occurredAt: h(8), ocurrioEsEstimado: true });
      expect(tiempoDeDeteccion([estimada]).muestra).toBe(0);
      expect(tiempoDeDeteccion([estimada]).horas).toBeNull();
    });

    it('pero SÍ entra en los demás tramos: la reparación se midió igual', () => {
      const estimada = falla({ occurredAt: h(8), ocurrioEsEstimado: true });
      expect(tiempoDeReparacion([estimada]).horas).toBe(1);
    });

    it('se dice cuántos de la muestra son estimados', () => {
      const r = tiempoSinServicio([falla(), falla({ ocurrioEsEstimado: true })]);
      expect(r.muestra).toBe(2);
      expect(r.estimados).toBe(1);
    });
  });

  describe('Sin datos, null — nunca cero', () => {
    it('sin averías no hay tramo', () => {
      /* Un cero se pinta en el gráfico y se lee «vamos perfectos». Un null se
         pinta «sin datos» y manda a alguien a averiguar por qué. */
      expect(tiempoDeReparacion([]).horas).toBeNull();
      expect(tiempoSinServicio([]).horas).toBeNull();
    });

    it('una avería sin cerrar no se cuenta como reparada', () => {
      expect(tiempoDeReparacion([falla({ restoredAt: null })]).horas).toBeNull();
    });

    it('el MTBF exige DOS averías', () => {
      /* Con una sola no hay intervalo entre fallos: hay un fallo suelto.
         «El equipo aguanta 720 horas» sacado de una muestra de uno suena a
         dato y es ruido. */
      expect(mtbfReal([falla()], 720)).toBeNull();
      expect(mtbfReal([falla(), falla()], 720)).toBe(360);
    });
  });

  describe('Las falsas alarmas no hunden a nadie', () => {
    it('se descartan de todos los cálculos', () => {
      const f = [falla(), falla({ esFalsaAlarma: true, restoredAt: h(23) })];
      // La falsa duraría 20 h y arrastraría la media si contara.
      expect(tiempoSinServicio(f).horas).toBe(8);
      expect(tiempoSinServicio(f).muestra).toBe(1);
    });

    it('no cuentan como fallo para el MTBF', () => {
      expect(mtbfReal([falla(), falla({ esFalsaAlarma: true })], 720)).toBeNull();
    });
  });

  describe('Datos mal metidos no envenenan la media', () => {
    it('un tramo negativo se salta, no se resta', () => {
      /* Alguien pone la hora de restablecimiento ANTES que la de caída. Un
         número negativo dentro de una media la envenena sin que se note. */
      const malo = falla({ restoredAt: h(1) });
      const r = tiempoSinServicio([falla(), malo]);
      expect(r.muestra).toBe(1);
      expect(r.horas).toBe(8);
    });
  });

  describe('Disponibilidad sobre horas reales', () => {
    it('descuenta las horas caído del periodo', () => {
      // 8 h caído en un periodo de 720 → 98,89 %
      const r = disponibilidadReal([falla()], 720);
      expect(r.horasCaido).toBe(8);
      expect(r.pct).toBeCloseTo(98.89, 1);
    });

    it('las que siguen caídas se cuentan aparte, no se inventa su final', () => {
      const r = disponibilidadReal([falla({ restoredAt: null })], 720);
      expect(r.sinCerrar).toBe(1);
      expect(r.horasCaido).toBe(0);
    });
  });

  describe('Nivel de servicio — indicador ④ del ingeniero', () => {
    it('pondera por equipo: una cámara de cien caída 8 h apenas mueve la aguja', () => {
      const r = nivelDeServicio([falla()], 100, 720);
      // 8 horas-equipo perdidas de 72.000 disponibles.
      expect(r.pct).toBeCloseTo(99.99, 1);
      expect(r.equipos).toBe(100);
    });

    it('la misma avería con UNA sola cámara en planta sí duele', () => {
      const r = nivelDeServicio([falla()], 1, 720);
      expect(r.pct).toBeCloseTo(98.89, 1);
    });

    it('sin parque no hay nivel de servicio: null, nunca 100 %', () => {
      /* Devolver 100 % con cero equipos sería la peor cifra posible: dice que
         todo va perfecto justo cuando no hay nada cargado. */
      expect(nivelDeServicio([falla()], 0, 720).pct).toBeNull();
    });
  });

  describe('Los que más fallan se cuentan por AVERÍAS, no por órdenes', () => {
    it('dos órdenes de la misma avería no lo señalan dos veces', () => {
      const r = peoresPorFallas([
        falla({ assetId: 'a' }), falla({ assetId: 'a' }),
        falla({ assetId: 'b' }),
      ]);
      expect(r[0]).toMatchObject({ assetId: 'a', fallas: 2 });
      expect(r[1]).toMatchObject({ assetId: 'b', fallas: 1 });
    });

    it('a igualdad de averías, primero el que estuvo más tiempo caído', () => {
      const r = peoresPorFallas([
        falla({ assetId: 'corto', restoredAt: h(4) }),
        falla({ assetId: 'largo', restoredAt: h(20) }),
      ]);
      expect(r[0].assetId).toBe('largo');
    });
  });
});
