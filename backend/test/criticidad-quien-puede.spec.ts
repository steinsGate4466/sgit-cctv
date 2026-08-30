import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 76 · QUIÉN PUEDE QUÉ EN LA CRITICIDAD
   -----------------------------------------------------------------------------
   POR QUÉ SE LEE EL CÓDIGO Y NO SE LLAMA AL ENDPOINT

   Levantar Nest con una base y cuatro sesiones falsas convertiría esto en una
   prueba lenta que acaba desactivada. Y lo que importa aquí no es el resultado
   de la llamada: es que **las decisiones sigan escritas**. El fallo típico no
   es escribir mal un permiso — es quitarlo «un momento para probar» y no
   volver a ponerlo.

   Es el mismo enfoque de `qr-en-campo.spec.ts` y por el mismo motivo.
============================================================================= */

const raiz = path.join(__dirname, '..', 'src');
const leer = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8');

const CTRL = leer(path.join('modules', 'criticidad', 'criticidad.controller.ts'));
const SERV = leer(path.join('modules', 'criticidad', 'criticidad.service.ts'));
const DATOS = leer(path.join('common', 'criticidad-datos.ts'));

/** Sin comentarios: un ejemplo comentado no es código. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

const C = sinComentarios(CTRL);
const S = sinComentarios(SERV);

describe('Bloque 76 — criticidad A/B/C', () => {
  describe('Quién puede mirarla', () => {
    it('vale `asset.read` O `activos.mirar`, no sólo el fuerte', () => {
      /* La lección del bloque 68: cerrarlo sólo con `asset.read` dejaría al
         Jefe de Tren y al Jefe de línea sin poder ver cada cuánto se revisa su
         propio equipo. Ya pasó exactamente eso con el QR, y el módulo entero
         quedó muerto para las tres personas de planta. */
      const lecturas = C.match(/@RequireAlguno\('asset\.read', 'activos\.mirar'\)/g) || [];
      // El resumen, los parámetros, el intervalo y la ficha de un equipo.
      expect(lecturas.length).toBeGreaterThanOrEqual(4);
    });

    it('ninguna lectura se cierra sólo con `asset.read`', () => {
      const solo = C.match(/@RequirePermissions\('asset\.read'\)/g) || [];
      expect(solo).toEqual([]);
    });
  });

  describe('Quién puede declarar y quién puede mover los números', () => {
    it('declarar un equipo pide `asset.update` — lo dice quien está delante', () => {
      expect(C).toMatch(/@RequirePermissions\('asset\.update'\)/);
    });

    it('mover los cortes o los días pide `wo.approve`', () => {
      /* Mover un corte reordena el trabajo de la planta ENTERA. Eso no es una
         edición: es una decisión de mantenimiento, y la firma quien responde
         por él. Si esto se aflojara a `wo.update`, un técnico podría cambiar
         la frecuencia de las cuatrocientas cámaras. */
      const bloque = C.slice(C.indexOf("@Put('parametros')"));
      expect(bloque.slice(0, 200)).toContain("@RequirePermissions('wo.approve')");
    });

    it('todas las rutas `:id` declaran su ámbito de tren', () => {
      /* Sin `@AmbitoDe`, un usuario del Tren 2 podría leer la criticidad de un
         equipo del Tren 1 pasando su identificador. Es el agujero del bloque
         12.3 y no se vuelve a abrir. */
      const conId = (C.match(/@(Get|Post|Put)\('[^']*:id[^']*'\)/g) || []).length;
      const conAmbito = (C.match(/@AmbitoDe\(/g) || []).length;
      expect(conAmbito).toBe(conId);
    });
  });

  describe('Las reglas que no se aflojan', () => {
    it('no hay ni un nombre de rol escrito a mano', () => {
      /* El reparto va por CAPACIDAD. Un nombre de rol se edita desde la
         interfaz: es un dato de usuario. Cuando no coincide, el código no
         falla — no hace nada, y falla ABRIENDO. Es el bloque 62-A. */
      expect(C).not.toMatch(/Jefe de |Operador de |Supervisor de /);
      expect(S).not.toMatch(/Jefe de |Operador de |Supervisor de /);
    });

    it('la letra NO se guarda en ninguna tabla', () => {
      /* Regla del proyecto: lo que se puede calcular, no se guarda. Guardar la
         letra sería mantener dos verdades, y la segunda se queda vieja el día
         que alguien añada una cámara a la zona. */
      expect(S).not.toMatch(/data:\s*\{[^}]*letra/);
      expect(S).not.toMatch(/letraAbc|criticidadLetra/);
    });

    it('sólo se guardan los DOS datos que declara una persona', () => {
      expect(S).toContain('impactoOperacional');
      expect(S).toContain('riesgoPersonas');
    });

    it('`null` es un valor válido: se puede deshacer una anulación', () => {
      /* Si «no vino» y «vino como null» se trataran igual, un impacto puesto
         por error se quedaría para siempre y no habría forma de devolver el
         equipo a lo que dice su zona. Es el mismo cuidado del bloque 16 con
         las instalaciones: `false` es una respuesta, `''` no. */
      expect(S).toMatch(/'impactoOperacional' in \(dto \?\? \{\}\)/);
      expect(S).toMatch(/'riesgoPersonas' in \(dto \?\? \{\}\)/);
    });

    it('los cortes se validan: un corte de A por debajo del de B deja B vacío', () => {
      /* Sin esto el sistema seguiría funcionando y las cifras serían basura:
         la planta entera repartida entre A y C sin que nada avisara. */
      expect(S).toMatch(/corteA <= corteB/);
      expect(S).toMatch(/diasA <= diasB && diasB <= diasC/);
    });

    it('los de BAJA y los de almacén no entran en el plan', () => {
      /* Contarlos llenaría la lista de pendientes de equipos que nadie va a
         revisar, y a la tercera vez que se mira una lista así se deja de
         mirar. */
      expect(S).toMatch(/status:\s*\{\s*notIn:\s*\['BAJA',\s*'STOCK'\]\s*\}/);
    });

    it('el alimentado por PoE no se cuenta dos veces en el tablero', () => {
      /* Esa cámara cuelga del switch, y el switch ya cuelga del tablero.
         Contarla otra vez no cambiaría la letra —se toma la peor— pero
         inflaría el «de él dependen 40 equipos» de la pantalla, y una cifra
         inflada es una cifra en la que se deja de confiar. */
      expect(S).toMatch(/if \(al\.viaPoe\) continue/);
    });
  });

  describe('El cálculo se puede probar sin base de datos', () => {
    it('`criticidad-datos.ts` no importa Prisma', () => {
      /* Si importara Prisma habría que montar media planta en una base para
         probar la cascada, y una prueba así acaba desactivada. */
      expect(DATOS).not.toMatch(/from '.*prisma/i);
      expect(DATOS).not.toMatch(/PrismaService/);
    });
  });
});
