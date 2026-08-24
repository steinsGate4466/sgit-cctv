import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   EL QR NO PUEDE CONVERTIRSE EN UNA PUERTA TRASERA — bloque 62-A
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE ESTA PRUEBA

   El bloque 62-A pone botones de trabajo en la ficha del QR: el técnico anota
   el avance de la orden desde el poste, sin bajar a la oficina.

   El riesgo de eso es concreto y el usuario lo dijo con estas palabras:
   «no cualquiera puede editar esa informacion y debe esperar a que el jefe de
   mantenimiento le he dé visto bueno, todo debe estar auditado».

   La tentación al construirlo es bajar el listón «porque en campo hay prisa»:
   dejar que el técnico cierre la orden él mismo, o aceptar el parte sin
   guardar quién lo escribió. Eso convierte una pantalla cómoda en un agujero.

   Así que la regla queda fijada AQUÍ, en el código, y no en un comentario:

     1. ANOTAR AVANCE exige `wo.update`     → lo tiene el técnico.
     2. CERRAR exige `wo.approve`           → SOLO el Jefe de Mantenimiento.
     3. Todo avance guarda QUIÉN lo escribió y pasa por auditoría.

   Si alguien afloja cualquiera de las tres, esta prueba se cae.

   Se lee el CÓDIGO, no el comportamiento: el fallo típico no es escribir mal
   el permiso, es quitarlo «un momento para probar» y no volver a ponerlo.
============================================================================= */

const CTRL = path.join(
  __dirname, '..', 'src', 'modules', 'maintenance', 'maintenance.controller.ts',
);
const SVC = path.join(
  __dirname, '..', 'src', 'modules', 'maintenance', 'maintenance.service.ts',
);
const ASSETS = path.join(
  __dirname, '..', 'src', 'modules', 'assets', 'assets.service.ts',
);

/** Permiso declarado justo debajo de un `@Post(':id/<ruta>')`. */
function permisoDe(texto: string, ruta: string): string | null {
  const i = texto.indexOf(`@Post(':id/${ruta}')`);
  if (i === -1) return null;
  const trozo = texto.slice(i, i + 400);
  const m = trozo.match(/@RequirePermissions\('([^']+)'\)/);
  return m ? m[1] : null;
}

describe('el QR en campo no relaja el control', () => {
  const ctrl = fs.readFileSync(CTRL, 'utf8');
  const svc = fs.readFileSync(SVC, 'utf8');

  it('ANOTAR AVANCE lo puede hacer el técnico (wo.update)', () => {
    /* Si esto pidiera `wo.approve`, el botón del QR daría 403 a todo el mundo
       menos al Jefe — o sea, sería un botón inútil pintado para el técnico. */
    expect(permisoDe(ctrl, 'progress')).toBe('wo.update');
  });

  it('CERRAR LA ORDEN sigue siendo SOLO del Jefe de Mantenimiento (wo.approve)', () => {
    /* La regla que el usuario repitió: el técnico hace el trabajo y lo anota;
       quien da el visto bueno es el Jefe. El cierre lleva firma y consumo de
       materiales detrás, así que no se delega por comodidad de campo. */
    expect(permisoDe(ctrl, 'close')).toBe('wo.approve');
    expect(permisoDe(ctrl, 'close')).not.toBe('wo.update');
  });

  it('ABRIR la orden tampoco es libre', () => {
    expect(permisoDe(ctrl, 'open')).toBe('wo.update');
  });

  it('las tres rutas van con ámbito de tren', () => {
    /* Sin `@AmbitoDe`, un técnico del Tren 2 podría anotar avance sobre una
       orden del Tren 1 sabiendo el identificador (bloque 12.3). */
    for (const ruta of ['open', 'progress', 'close']) {
      const i = ctrl.indexOf(`@Post(':id/${ruta}')`);
      expect(i).toBeGreaterThan(-1);
      // El decorador de ámbito va inmediatamente encima del verbo HTTP.
      expect(ctrl.slice(Math.max(0, i - 200), i)).toContain("@AmbitoDe('workOrder')");
    }
  });

  it('TODO avance guarda quién lo escribió y pasa por auditoría', () => {
    /* Un parte anónimo no vale de nada: cuando dentro de tres meses haya que
       saber quién dijo que la cámara quedó limpia, el nombre tiene que estar. */
    const i = svc.indexOf('async addProgress');
    expect(i).toBeGreaterThan(-1);
    /* La ventana es generosa a propósito: `addProgress` lleva bastante
       comentario explicando la guarda de estado del bloque 37-B, y una
       ventana corta hacía fallar la prueba por no llegar al final del
       método — un falso positivo, que es como muere una prueba útil. */
    const cuerpo = svc.slice(i, i + 8000);
    expect(cuerpo).toContain('reportedById');
    expect(cuerpo).toContain('this.audit.record');
  });

  it('no se puede anotar avance sobre una orden ya cerrada', () => {
    /* Si se pudiera, se podría «reabrir» por la puerta de atrás una orden que
       el Jefe ya firmó, y el informe firmado dejaría de coincidir con el
       historial. */
    const i = svc.indexOf('async addProgress');
    const cuerpo = svc.slice(i, i + 1200);
    expect(cuerpo).toContain("wo.status === 'CERRADA'");
  });

  it('cada oficio tiene SU formulario, y el reparto es por capacidad', () => {
    /* Decisión del usuario: «lo más probable es que el incidente lo hagan en
       púlpito, así que el formulario para ellos es distinto: se autocompleta.
       Si es un técnico, ahí sí tiene que ser más complejo».

       Producción ve un cuadro en negro y sabe UNA cosa: que no está viendo.
       Pedirle la categoría de la falla es pedirle que adivine, y una
       categoría adivinada ensucia para siempre la estadística de qué falla
       más. El técnico, con la tapa abierta, sí distingue.

       Lo que esta prueba impide es que los DOS formularios salgan a la vez en
       la misma pantalla: `ReportarAveria` (el detallado) exige además
       `wo.update`, que Producción no tiene. Y el reparto se hace por
       CAPACIDAD, nunca por nombre de rol — la lección del bloque 62-A. */
    const f = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'ReportarAveria.tsx'),
      'utf8',
    );
    expect(f).toContain("can('incident.create')");
    expect(f).toContain("can('wo.update')");
    // Ni un nombre de rol escrito a mano en el reparto.
    expect(f).not.toMatch(/can\(\s*'Jefe|rol\s*===\s*'/);
  });

  it('la ficha del activo entrega el id de la orden, o los botones no existen', () => {
    /* El QR llama a `POST /work-orders/:id/progress`. Antes del bloque 62-A el
       `select` de `workOrders` no traía `id`, así que la ficha listaba órdenes
       sobre las que era imposible actuar. */
    const a = fs.readFileSync(ASSETS, 'utf8');
    const i = a.indexOf('workOrders: {');
    expect(i).toBeGreaterThan(-1);
    expect(a.slice(i, i + 900)).toMatch(/\bid:\s*true\b/);
  });
});
