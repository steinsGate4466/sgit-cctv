import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 72 · LO QUE LA BANDEJA TIENE QUE ENSEÑAR
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   El usuario dio por hecho que su incidencia de prioridad MEDIA estaba en la
   bandeja de alguien. No lo estaba: la consulta pedía `priority: ALTA o
   CRITICA` y nada más. Una MEDIA se quedaba en la lista de Incidencias sin
   que nadie la mirara, y quien la reportó creía que estaba en cola.

   No rompe nada, no lo ve el compilador y no lo ve el lint. Sólo se ve
   preguntándose «¿y esto dónde sale?», que es justo lo que hizo él.

   -----------------------------------------------------------------------------
   POR QUÉ SE LEE EL CÓDIGO Y NO SE EJECUTA LA CONSULTA

   Ejecutarla exigiría una base con datos, y entonces esto dejaría de correr en
   la CI y se acabaría desactivando. Lo que aquí importa no es el resultado de
   la consulta: es que **las reglas sigan escritas**. El fallo típico no es
   escribir mal el filtro — es quitarlo «un momento para probar» y no volver a
   ponerlo.

   Es el mismo enfoque de `qr-en-campo.spec.ts`, y por el mismo motivo.
============================================================================= */

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'modules', 'dashboard', 'bandeja.service.ts'),
  'utf8',
);

/** El archivo sin comentarios: un ejemplo comentado no es código. */
const CODIGO = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

describe('Bloque 72 — la bandeja', () => {
  describe('Las incidencias van en DOS cubos', () => {
    it('hay un cubo para lo grave y otro para lo demás', () => {
      expect(CODIGO).toContain('incidenciasCriticas');
      expect(CODIGO).toContain('incidenciasNormales');
    });

    it('«grave» se define UNA vez y se usa en los dos cubos', () => {
      /* Si estuviera escrito dos veces, el día que se añada una prioridad
         quedaría fuera de los dos cubos y no saldría en ningún sitio — que es
         exactamente el fallo que este bloque vino a cerrar.

         La prueba mira la CONSTANTE y sus dos usos, no cómo está escrito el
         literal: si mañana se refactoriza, no debe caerse por la forma. */
      expect(CODIGO).toMatch(/const GRAVES:\s*Priority\[\]\s*=\s*\['ALTA',\s*'CRITICA'\]/);
      expect(CODIGO).toMatch(/priority:\s*\{\s*in:\s*GRAVES\s*\}/);
    });

    it('lo demás es TODO lo que no es grave, no una lista escrita a mano', () => {
      /* Con `notIn` no hay que acordarse de nada: si mañana alguien añade una
         prioridad al enum, cae sola en el cubo correcto. */
      expect(CODIGO).toMatch(/priority:\s*\{\s*notIn:\s*GRAVES\s*\}/);
    });

    it('los estados vivos van TIPADOS, no con `as any`', () => {
      /* Un `as any` apaga la comprobación que avisa cuando un valor no existe
         en el enum. Lo cazó `verificar:constructores` en este mismo bloque. */
      expect(CODIGO).toMatch(/const VIVAS:\s*IncidentStatus\[\]/);
    });

    it('las dos salen en la respuesta y en el resumen', () => {
      expect(CODIGO).toMatch(/incidenciasNormales,/);
      expect(CODIGO).toMatch(/incidenciasNormales:\s*incidenciasNormales\.length/);
    });

    it('las dos cuentan en el total: si no, la bandeja diría que está vacía', () => {
      const total = CODIGO.slice(CODIGO.indexOf('total:'));
      expect(total).toContain('incidenciasCriticas.length');
      expect(total).toContain('incidenciasNormales.length');
      expect(total).toContain('mejorasPropuestas.length');
    });
  });

  describe('Sólo lo que NO ha arrancado', () => {
    it('una incidencia que YA tiene orden no se repite aquí', () => {
      /* Con orden abierta el trabajo ya está en marcha y sale más arriba, en
         «sin detallar». Listarla otra vez haría que la bandeja pareciese el
         doble de llena, que es la forma más rápida de que se deje de mirar. */
      expect(CODIGO).toMatch(/sinOrden\s*=\s*\{\s*workOrders:\s*\{\s*none:\s*\{\}\s*\}\s*\}/);
      // Y se aplica a los DOS cubos, no sólo al primero.
      const usos = CODIGO.match(/\.\.\.sinOrden/g) || [];
      expect(usos.length).toBeGreaterThanOrEqual(2);
    });

    it('sólo las incidencias vivas', () => {
      expect(CODIGO).toContain("'ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'");
    });
  });

  describe('Se dice QUIÉN avisó y CUÁNDO', () => {
    it('viaja el nombre de quien reportó', () => {
      /* Sin el nombre, la bandeja dice que hay un problema pero no a quién
         preguntar, y el ingeniero acaba llamando por radio para averiguar
         quién puso el parte. */
      expect(CODIGO).toMatch(/reportedBy:\s*\{\s*select:\s*\{[^}]*fullName/);
    });

    it('viajan las dos fechas: cuándo se avisó y cuándo se cayó', () => {
      expect(CODIGO).toContain('reportedAt: true');
      expect(CODIGO).toContain('occurredAt: true');
    });
  });

  describe('Las mejoras de los técnicos también esperan a alguien', () => {
    it('se listan las propuestas sin decidir', () => {
      expect(CODIGO).toContain('mejoraProcedimiento.findMany');
      expect(CODIGO).toMatch(/estado:\s*'PROPUESTA'/);
    });

    it('con el nombre de quien la propuso', () => {
      /* Una propuesta sin nombre no se puede agradecer ni preguntar, y a la
         tercera sin respuesta el técnico deja de proponer. */
      expect(CODIGO).toMatch(/propuestaPor:\s*\{\s*select:\s*\{[^}]*fullName/);
    });
  });

  describe('Lo de cada uno, arriba', () => {
    it('se ORDENA por persona, no se filtra', () => {
      /* Esconderle a un técnico lo que no es suyo le quitaría de la vista la
         orden que le van a asignar en diez minutos y la que abandonó el
         compañero que se fue de turno. En una cuadrilla de cuatro, eso es
         peor que el problema que resuelve. */
      expect(CODIGO).toContain('loMioArriba');
      expect(CODIGO).toContain('esMia');
      // Si alguien lo convierte en filtro, esto se cae.
      expect(CODIGO).not.toMatch(/where:\s*\{[^}]*technicianId:\s*userId/);
    });

    it('para saber si es tuya hace falta el id del técnico', () => {
      expect(CODIGO).toMatch(/technician:\s*\{\s*select:\s*\{\s*id:\s*true/);
    });
  });
});
