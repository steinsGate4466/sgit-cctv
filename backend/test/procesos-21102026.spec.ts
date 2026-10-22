import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   AUDITORÍA DE PROCESOS 21/10/2026 · MENOS PASOS, LOS MISMOS CONTROLES
   -----------------------------------------------------------------------------
   Se recorrió el ciclo de una avería de punta a punta (reportar → orden →
   abrir → avanzar → cerrar) buscando pasos repetidos y datos que se pedían
   dos veces. Cuatro arreglos, y ninguno quita una firma, un requisito de
   seguridad ni una línea de auditoría:

   1. ABRIR ES DETALLAR. Lo obligatorio del detalle es saber sobre qué se
      trabaja y qué hay que hacer; quien firma la apertura delante del equipo
      lo está confirmando. Antes eran dos pasos y la orden seguía «sin
      detallar» en la bandeja con el trabajo empezado.
   2. «TERMINÉ» LLEVA LA PROPUESTA DEL TÉCNICO. Síntoma, causa y acción los
      marca quien estuvo delante, al 100 %. El Jefe los encuentra marcados y
      firma. Antes los elegía él, a ciegas.
   3. «MI TREN» PIDE LAS ÓRDENES VIVAS DE SU TREN. Pedía sólo ABIERTA y
      filtraba por un campo que la lista no trae: «nada pendiente» siempre.
   4. (en incidencia-sigue-a-la-om.spec) la incidencia resuelta por su orden
      cierra el evento de falla, el MTTR y avisa a quien la reportó.

   Las pruebas leen el CÓDIGO: el fallo típico aquí es que alguien «limpie»
   la línea porque parece redundante.
============================================================================= */

const raiz = path.join(__dirname, '..', 'src', 'modules', 'maintenance');
const leer = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
const svc = leer('maintenance.service.ts');

/** Cuerpo de un método, del ancla al siguiente `async` del mismo nivel. */
function metodo(ancla: string): string {
  const i = svc.indexOf(ancla);
  expect(i).toBeGreaterThan(-1);
  const fin = svc.indexOf('\n  async ', i + ancla.length);
  return svc.slice(i, fin > i ? fin : undefined);
}

describe('1 · abrir la orden la deja detallada', () => {
  const abrir = metodo('async openSigned(');

  it('marca detailedAt sólo si no lo estaba y el detalle está completo', () => {
    expect(abrir).toContain('!wo.detailedAt && estadoDetalle(wo).faltan.length === 0');
    expect(abrir).toContain('detailedAt: new Date(), detailedById: signer!.id');
  });

  it('no afloja la seguridad: siguen los requisitos y el acompañante', () => {
    expect(abrir).toContain('requisitosSinMarcar(');
    expect(abrir).toContain('nunca se trabaja solo');
  });
});

describe('2 · «terminé» con la propuesta del técnico', () => {
  const avance = metodo('async addProgress(');

  it('sólo al 100 %', () => {
    expect(avance).toContain('if (pct === 100) {');
  });

  it('cada código tiene que existir y estar activo en su catálogo', () => {
    expect(avance).toContain("['SINTOMA', 'symptomCode'], ['CAUSA', 'rootCauseCode'], ['ACCION', 'actionCode']");
    expect(avance).toContain('catalogItem.count({ where: { kind, code: codigo, active: true } })');
  });

  it('queda en la orden y en la auditoría, sin cerrarla', () => {
    expect(avance).toContain('...propuesta,');
    expect(avance).toContain('propuestaDeCierre: propuesta');
    expect(avance).not.toContain("status: 'CERRADA'");
  });

  it('cerrar sigue siendo del Jefe, con firma', () => {
    const ctrl = fs.readFileSync(path.join(raiz, 'maintenance.controller.ts'), 'utf8');
    expect(ctrl).toMatch(/@Post\(':id\/close'\)\s*@RequirePermissions\('wo\.approve'\)/);
    expect(metodo('async closeSigned(')).toContain("exigirFirmanteConPermiso(this.prisma, signer!.id, 'wo.approve'");
  });
});

describe('2b · una causa NUEVA del catálogo no tumba el cierre', () => {
  it('el enum viejo sólo se rellena si el código coincide con él', () => {
    expect(metodo('async closeSigned(')).toContain(
      '(Object.values(RootCause) as string[]).includes(dto.rootCauseCode)');
  });
  it('el cumplimiento normativo cuenta la causa del CATÁLOGO', () => {
    const ind = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'indicadores', 'indicadores.service.ts'), 'utf8');
    expect(ind).toContain('rootCause: o.rootCauseCode ?? o.rootCause');
  });
});

describe('4 · el PATCH no es una puerta de atrás del cierre firmado', () => {
  /* Probado contra la API el 21/10: un técnico con `wo.update` cerraba y
     cancelaba órdenes con `PATCH { status }` — 200 las dos veces. */
  const upd = metodo('async update(id: string, dto: UpdateWorkOrderDto');

  it('una orden cerrada o cancelada no se edita', () => {
    expect(upd).toContain("if (cur.status === 'CERRADA' || cur.status === 'CANCELADA') {");
  });
  it('CERRADA sólo por el cierre firmado', () => {
    expect(upd).toContain("if (dto.status === 'CERRADA') {");
  });
  it('CANCELADA sólo con wo.approve', () => {
    expect(upd).toContain("if (dto.status === 'CANCELADA' && !puedeMoverFecha) {");
    const ctrl = fs.readFileSync(path.join(raiz, 'maintenance.controller.ts'), 'utf8');
    expect(ctrl).toContain("const puedeMoverFecha = (user?.permissions || []).includes('wo.approve');");
  });
});

describe('3 · las órdenes vivas', () => {
  it('`vivas` excluye cerradas y canceladas si no se pide un estado', () => {
    expect(svc).toContain("if (q.vivas && !q.status) where.status = { notIn: ['CERRADA', 'CANCELADA'] };");
    const dto = fs.readFileSync(path.join(raiz, 'dto', 'query-work-order.dto.ts'), 'utf8');
    expect(dto).toContain('vivas?: boolean');
  });
});
