/**
 * LA REJILLA DE CANALES DEL GRABADOR (bloque 6a).
 *
 * QUÉ PROBLEMA RESUELVE
 * El operador del púlpito no dice "AA-CAM-T2-045". Dice "el canal 7 está
 * negro" o "la de la grúa 2 no se ve". Hoy traducir eso a un activo del
 * sistema es un ejercicio de memoria de quien esté de turno.
 *
 * Esta rejilla es la tabla de traducción: canal ↔ cámara ↔ nombre que se ve
 * en la pantalla del púlpito. Con ella, un aviso por radio se convierte en
 * una orden de mantenimiento sin preguntarle a nadie.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO DENTRO DEL SERVICIO
 * Porque todo esto es cálculo puro sobre datos que ya vienen leídos, y así
 * se puede probar sin base de datos. Los tres fallos que detecta abajo son
 * fallos de CARGA DE DATOS, no de red: los comete quien registra, y hay que
 * enseñárselos donde los pueda arreglar.
 */

export interface CamaraDelGrabador {
  assetId: string;
  code: string;
  /** Nombre tal como aparece en el grabador y en la pantalla del púlpito. */
  nombreEnGrabador: string | null;
  canal: number | null;
  estado: string;
  lugar: string | null;
}

export type TipoProblema =
  | 'SIN_CANAL'
  | 'CANAL_DUPLICADO'
  | 'FUERA_DE_RANGO'
  | 'SIN_NOMBRE';

export interface Problema {
  tipo: TipoProblema;
  /** Explicado para que quien lo lea sepa qué hacer, no sólo qué pasa. */
  texto: string;
  camaras: { assetId: string; code: string }[];
  canal?: number;
}

export interface Celda {
  canal: number;
  camara: CamaraDelGrabador | null;
  /** Más de una cámara declarada en el mismo canal. Sólo una puede ser cierta. */
  duplicado: boolean;
}

export interface Rejilla {
  /** Capacidad declarada del grabador. null = nadie la ha registrado. */
  capacidad: number | null;
  /** Cuántas casillas se dibujan de verdad. */
  total: number;
  ocupados: number;
  libres: number;
  celdas: Celda[];
  /** Cámaras que dicen entrar a este grabador pero sin canal: no caben en la rejilla. */
  sinCanal: CamaraDelGrabador[];
  problemas: Problema[];
}

/**
 * Cuántas casillas dibujar cuando el grabador no declara capacidad.
 * No se inventa un número de canales del equipo: se dibuja lo que hay
 * ocupado y se avisa de que falta el dato. Inventar una capacidad haría que
 * la pantalla dijera "quedan 9 canales libres" sin saberlo, y alguien
 * planificaría cámaras nuevas sobre esa mentira.
 */
export function construirRejilla(
  camaras: CamaraDelGrabador[],
  capacidad: number | null,
): Rejilla {
  const problemas: Problema[] = [];

  const conCanal = camaras.filter((c) => c.canal != null && c.canal > 0);
  const sinCanal = camaras.filter((c) => c.canal == null || c.canal <= 0);

  if (sinCanal.length > 0) {
    problemas.push({
      tipo: 'SIN_CANAL',
      texto:
        sinCanal.length === 1
          ? 'Una cámara entra a este grabador pero no tiene canal registrado: no se puede saber en qué recuadro del púlpito sale.'
          : `${sinCanal.length} cámaras entran a este grabador sin canal registrado: no se puede saber en qué recuadro del púlpito salen.`,
      camaras: sinCanal.map((c) => ({ assetId: c.assetId, code: c.code })),
    });
  }

  // Agrupar por canal para detectar duplicados.
  const porCanal = new Map<number, CamaraDelGrabador[]>();
  for (const c of conCanal) {
    const n = c.canal as number;
    if (!porCanal.has(n)) porCanal.set(n, []);
    (porCanal.get(n) as CamaraDelGrabador[]).push(c);
  }

  for (const [canal, lista] of [...porCanal.entries()].sort((a, b) => a[0] - b[0])) {
    if (lista.length > 1) {
      problemas.push({
        tipo: 'CANAL_DUPLICADO',
        canal,
        texto: `El canal ${canal} tiene ${lista.length} cámaras declaradas. Sólo una puede ser la correcta: hay que corregir las demás.`,
        camaras: lista.map((c) => ({ assetId: c.assetId, code: c.code })),
      });
    }
  }

  // Canal mayor que la capacidad del equipo: o la capacidad está mal, o el
  // canal está mal. En cualquier caso el dato no puede ser cierto.
  if (capacidad != null && capacidad > 0) {
    const fuera = conCanal.filter((c) => (c.canal as number) > capacidad);
    if (fuera.length > 0) {
      problemas.push({
        tipo: 'FUERA_DE_RANGO',
        texto: `Hay ${fuera.length} cámara(s) en canales por encima de ${capacidad}, que es la capacidad registrada del grabador. O la capacidad está mal registrada, o el canal lo está.`,
        camaras: fuera.map((c) => ({ assetId: c.assetId, code: c.code })),
      });
    }
  }

  // Sin nombre en el grabador no hay traducción posible desde el púlpito.
  const anonimas = camaras.filter((c) => !c.nombreEnGrabador || !c.nombreEnGrabador.trim());
  if (anonimas.length > 0) {
    problemas.push({
      tipo: 'SIN_NOMBRE',
      texto: `${anonimas.length} cámara(s) sin el nombre que se ve en el púlpito. Sin ese nombre, cuando avisen por radio hay que adivinar de cuál hablan.`,
      camaras: anonimas.map((c) => ({ assetId: c.assetId, code: c.code })),
    });
  }

  const canalMaximo = conCanal.reduce((m, c) => Math.max(m, c.canal as number), 0);
  const total = capacidad != null && capacidad > 0 ? Math.max(capacidad, canalMaximo) : canalMaximo;

  const celdas: Celda[] = [];
  for (let n = 1; n <= total; n++) {
    const lista = porCanal.get(n) || [];
    celdas.push({
      canal: n,
      // Con duplicados se enseña la primera y se marca la casilla: esconder
      // el conflicto sería peor que enseñarlo mal.
      camara: lista[0] || null,
      duplicado: lista.length > 1,
    });
  }

  const ocupados = celdas.filter((c) => c.camara).length;

  return {
    capacidad,
    total,
    ocupados,
    libres: Math.max(0, total - ocupados),
    celdas,
    sinCanal,
    problemas,
  };
}

/**
 * Busca una cámara a partir de lo que dice el púlpito por radio.
 * Acepta un número de canal ("el 7"), o un trozo del nombre ("grúa 2"), o
 * el código del activo. Es la razón de ser de todo este bloque.
 */
export function buscarPorLoQueDiceElPulpito(
  camaras: CamaraDelGrabador[],
  texto: string,
): CamaraDelGrabador[] {
  const t = (texto || '').trim().toLowerCase();
  if (!t) return [];

  // "canal 7", "c7", "7" → número suelto.
  const soloNumero = t.match(/^(?:canal\s*|c)?(\d{1,3})$/);
  if (soloNumero) {
    const n = Number(soloNumero[1]);
    const porCanal = camaras.filter((c) => c.canal === n);
    if (porCanal.length > 0) return porCanal;
  }

  return camaras.filter(
    (c) =>
      (c.nombreEnGrabador || '').toLowerCase().includes(t) ||
      c.code.toLowerCase().includes(t) ||
      (c.lugar || '').toLowerCase().includes(t),
  );
}
