import {
  clasificar,
  faltaDeRespaldo,
  intervaloFinal,
  nivelDeFrecuencia,
  peorLetra,
  PARAMETROS_PROPUESTOS,
  EntradaCriticidad,
  LetraABC,
} from './criticidad-abc';

/* =============================================================================
   BLOQUE 73 · LAS REGLAS DE LA CRITICIDAD, FIJADAS
   -----------------------------------------------------------------------------
   Cada prueba de aquí corresponde a una DECISIÓN, no a una línea de código.
   Si una se cae, es que alguien cambió una regla de negocio — y entonces hay
   que actualizarla escribiendo la decisión nueva, nunca aflojando la
   comprobación.
============================================================================= */

/** Una cámara corriente: sirve de base y cada prueba cambia lo suyo. */
const camara = (cambios: Partial<EntradaCriticidad> = {}): EntradaCriticidad => ({
  codigo: 'AA-CAM-T1-001',
  impactoOperacional: 2,
  riesgoPersonas: false,
  equiposQueCubrenLoMismo: 1,
  dificultadAcceso: 2,
  fallasUltimoAnio: 1,
  ...cambios,
});

describe('Criticidad A/B/C por dispositivo', () => {
  /* ====================================================== SIN DATOS, NUNCA C */
  describe('Sin declarar NO es C', () => {
    it('sin impacto operacional queda SIN_CLASIFICAR, no C', () => {
      const r = clasificar(camara({ impactoOperacional: null }));
      expect(r.letra).toBe('SIN_CLASIFICAR');
      expect(r.letra).not.toBe('C');
      expect(r.faltaDeclarar.length).toBeGreaterThan(0);
    });

    it('sin declarar el riesgo para personas, tampoco', () => {
      const r = clasificar(camara({ riesgoPersonas: null }));
      expect(r.letra).toBe('SIN_CLASIFICAR');
    });

    it('y dice EXACTAMENTE qué falta, no un «faltan datos»', () => {
      const r = clasificar(camara({ impactoOperacional: null, riesgoPersonas: null }));
      expect(r.faltaDeclarar).toHaveLength(2);
      expect(r.faltaDeclarar.join(' ')).toContain('impacto en producción');
      expect(r.faltaDeclarar.join(' ')).toContain('riesgo para personas');
    });

    it('sin letra no hay intervalo: no se inventa uno', () => {
      const r = clasificar(camara({ impactoOperacional: null }));
      expect(r.diasEntreRevisiones).toBeNull();
      expect(r.puntaje).toBeNull();
    });
  });

  /* ============================================ LA SEGURIDAD NO SE PROMEDIA */
  describe('La seguridad de personas no se negocia', () => {
    it('si vigila un riesgo para personas es A, aunque todo lo demás sea lo más bajo', () => {
      const r = clasificar(camara({
        riesgoPersonas: true,
        impactoOperacional: 1,        // no afecta a producción
        equiposQueCubrenLoMismo: 9,   // hay respaldo de sobra
        dificultadAcceso: 1,          // se llega a pie
        fallasUltimoAnio: 0,          // nunca ha fallado
      }));
      expect(r.letra).toBe('A');
      expect(r.porSeguridad).toBe(true);
    });

    it('el puntaje se sigue enseñando, para que se vea que la regla se saltó', () => {
      /* Esconder el número haría creer que el sistema no calculó nada. El
         ingeniero tiene que poder ver que SÍ se calculó y que la regla de
         seguridad pasó por encima a propósito. */
      const r = clasificar(camara({ riesgoPersonas: true, impactoOperacional: 1 }));
      expect(r.puntaje).not.toBeNull();
      expect(r.porque.join(' ')).toContain('no se promedia');
    });

    it('la letra por seguridad NO depende de los cortes: subirlos no la cambia', () => {
      const imposible = { ...PARAMETROS_PROPUESTOS, corteA: 9999, corteB: 9998 };
      const r = clasificar(camara({ riesgoPersonas: true, impactoOperacional: 1 }), imposible);
      expect(r.letra).toBe('A');
    });
  });

  /* ================================================== EL RESPALDO SÍ CUENTA */
  describe('Una zona cubierta por varias cámaras reparte la exigencia', () => {
    it('sola pesa más que acompañada', () => {
      const sola = clasificar(camara({ impactoOperacional: 4, equiposQueCubrenLoMismo: 0 }));
      const acompanada = clasificar(camara({ impactoOperacional: 4, equiposQueCubrenLoMismo: 3 }));
      expect(sola.puntaje!).toBeGreaterThan(acompanada.puntaje!);
    });

    it('la escala de respaldo baja al aumentar los compañeros', () => {
      expect(faltaDeRespaldo(0)).toBe(4);
      expect(faltaDeRespaldo(1)).toBe(3);
      expect(faltaDeRespaldo(2)).toBe(2);
      expect(faltaDeRespaldo(3)).toBe(1);
      expect(faltaDeRespaldo(10)).toBe(1);
    });

    it('el porqué dice si está sola: es lo primero que se discute', () => {
      const r = clasificar(camara({ equiposQueCubrenLoMismo: 0 }));
      expect(r.porque.join(' ')).toContain('Está solo');
    });
  });

  /* ================================================= FRECUENCIA × CONSECUENCIA */
  describe('Es una MULTIPLICACIÓN, no una suma', () => {
    it('lo que no falla nunca no puede ser A por muy importante que sea la zona', () => {
      /* Ésta es la razón de multiplicar. Si se sumara, una zona muy importante
         daría A aunque el equipo lleve cinco años sin fallar — y entonces se
         estaría subiendo a revisar algo que no lo necesita, que es
         exactamente el desperdicio que el método viene a evitar. */
      const r = clasificar(camara({
        impactoOperacional: 4, equiposQueCubrenLoMismo: 0,
        dificultadAcceso: 4, fallasUltimoAnio: 0,
      }));
      expect(r.letra).not.toBe('A');
    });

    it('lo mismo, pero fallando cada trimestre, sí es A', () => {
      const r = clasificar(camara({
        impactoOperacional: 4, equiposQueCubrenLoMismo: 0,
        dificultadAcceso: 4, fallasUltimoAnio: 4,
      }));
      expect(r.letra).toBe('A');
    });

    it('la escala de frecuencia: 0 y 1 fallas al año es lo normal', () => {
      expect(nivelDeFrecuencia(0)).toBe(1);
      expect(nivelDeFrecuencia(1)).toBe(1);
      expect(nivelDeFrecuencia(2)).toBe(2);
      expect(nivelDeFrecuencia(3)).toBe(3);
      expect(nivelDeFrecuencia(4)).toBe(4);
      expect(nivelDeFrecuencia(12)).toBe(4);
    });
  });

  /* ================================================ EQUIPOS QUE NO VIGILAN */
  describe('Un grabador o un switch heredan de lo que sostienen', () => {
    it('hereda la PEOR letra de los que dependen de él', () => {
      const r = clasificar(camara({
        codigo: 'AA-NVR-T1-R01',
        letrasQueDependenDeEl: ['C', 'C', 'A', 'B'],
      }));
      expect(r.letra).toBe('A');
      expect(r.porSoporte).toBe(true);
    });

    it('con dieciséis cámaras C sigue siendo C: la cantidad no sube la letra', () => {
      /* Tentación clásica: «si sostiene a muchas, es más crítico». No. Lo que
         importa es qué se pierde, y perder dieciséis cosas que no importaban
         sigue sin importar. La cantidad se dice en el porqué, no en la letra. */
      const r = clasificar(camara({
        codigo: 'AA-SW-T1-01',
        letrasQueDependenDeEl: Array(16).fill('C') as LetraABC[],
      }));
      expect(r.letra).toBe('C');
      expect(r.porque.join(' ')).toContain('16 equipo(s)');
    });

    it('si lo que depende de él no está clasificado, él tampoco', () => {
      const r = clasificar(camara({ letrasQueDependenDeEl: ['SIN_CLASIFICAR', 'SIN_CLASIFICAR'] }));
      expect(r.letra).toBe('SIN_CLASIFICAR');
      expect(r.faltaDeclarar.join(' ')).toContain('Clasificar primero');
    });

    it('NO se le pregunta el impacto operacional: un switch no ve nada', () => {
      /* Aunque venga sin declarar, la regla del soporte se resuelve primero y
         devuelve letra igual. Si se resolviera después, habría que declararle
         a un switch «qué pasa si dejas de ver», que no tiene respuesta. */
      const r = clasificar(camara({
        impactoOperacional: null, riesgoPersonas: null,
        letrasQueDependenDeEl: ['A'],
      }));
      expect(r.letra).toBe('A');
      expect(r.faltaDeclarar).toHaveLength(0);
    });

    it('peorLetra ignora las sin clasificar', () => {
      expect(peorLetra(['SIN_CLASIFICAR', 'C'])).toBe('C');
      expect(peorLetra(['B', 'A', 'C'])).toBe('A');
      expect(peorLetra([])).toBe('SIN_CLASIFICAR');
    });
  });

  /* ========================================= LOS NÚMEROS SON DE LA PLANTA */
  describe('Los cortes vienen de fuera, no están escritos en el cálculo', () => {
    it('cambiar los cortes cambia la letra sin tocar código', () => {
      const e = camara({ impactoOperacional: 3, equiposQueCubrenLoMismo: 1, fallasUltimoAnio: 2 });
      const exigente = clasificar(e, { ...PARAMETROS_PROPUESTOS, corteA: 1, corteB: 1 });
      const laxo = clasificar(e, { ...PARAMETROS_PROPUESTOS, corteA: 999, corteB: 998 });
      expect(exigente.letra).toBe('A');
      expect(laxo.letra).toBe('C');
    });

    it('los días de revisión salen de los parámetros, no de una constante', () => {
      const otros = { ...PARAMETROS_PROPUESTOS, diasA: 7, diasB: 14, diasC: 21 };
      const r = clasificar(camara({ riesgoPersonas: true }), otros);
      expect(r.diasEntreRevisiones).toBe(7);
    });
  });

  /* ================================================ SE JUNTA CON EL AMBIENTE */
  describe('Manda el que más exige', () => {
    it('cámara A en púlpito climatizado: gana la letra', () => {
      expect(intervaloFinal(30, 90)).toEqual({ dias: 30, manda: 'LETRA' });
    });

    it('cámara C en calor radiante: gana el ambiente', () => {
      expect(intervaloFinal(90, 30)).toEqual({ dias: 30, manda: 'AMBIENTE' });
    });

    it('si coinciden, se dice que empatan y no se elige uno al azar', () => {
      expect(intervaloFinal(30, 30)).toEqual({ dias: 30, manda: 'EMPATE' });
    });

    it('sin clasificar todavía, manda el ambiente y NO se rompe nada', () => {
      /* Esto es lo que permite encender el módulo sin haber clasificado ni un
         equipo: el sistema sigue funcionando exactamente como antes. */
      expect(intervaloFinal(null, 45)).toEqual({ dias: 45, manda: 'AMBIENTE' });
    });
  });

  /* ================================================== SE EXPLICA SIEMPRE */
  describe('Toda letra viene con su porqué', () => {
    it('también las C: bajar de categoría es lo que más se discute', () => {
      const r = clasificar(camara({ impactoOperacional: 1, equiposQueCubrenLoMismo: 5 }));
      expect(r.letra).toBe('C');
      expect(r.porque.length).toBeGreaterThanOrEqual(4);
    });

    it('el porqué menciona el puntaje y la letra', () => {
      const r = clasificar(camara());
      expect(r.porque[0]).toContain('Puntaje');
      expect(r.porque[0]).toContain(r.letra);
    });
  });
});
