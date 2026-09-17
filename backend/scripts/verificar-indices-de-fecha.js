/* eslint-disable no-console */
/**
 * VERIFICADOR 17 (backend) — LO QUE CRECE SE LEE POR FECHA.
 *
 * =============================================================================
 *  DE QUÉ FALLO REAL NACE
 * =============================================================================
 *  Bloque 105. Se midieron los índices de las tablas que crecen con los AÑOS
 *  —no con el tamaño de la planta— y salió esto:
 *
 *      WorkOrder      9 índices  ·  ninguno por fecha
 *      Incident       6 índices  ·  `occurredAt` sí, `reportedAt` NO
 *      AssetHistory   1 índice   ·  sólo assetId
 *      StockMovement  1 índice   ·  sólo assetId
 *
 *  Y las pantallas de historial piden siempre lo mismo: «lo de ESTE activo,
 *  por fecha, lo más reciente arriba». Sin el compuesto eso es recorrido
 *  secuencial más ordenación en memoria.
 *
 *  **No rompe nada y no se ve.** Con cuatrocientas filas va instantáneo; el
 *  día que haya treinta mil y cincuenta personas mirando, la pantalla tarda y
 *  nadie relaciona la lentitud con un índice que no se puso en 2026.
 *
 * =============================================================================
 *  QUÉ COMPRUEBA
 * =============================================================================
 *  Que toda tabla de la lista tenga índice por su campo de fecha, y —si tiene
 *  `assetId`— el compuesto `[assetId, <fecha>]`. La lista SÓLO PUEDE CRECER:
 *  añadir una tabla que crece con los años y olvidarse del índice es
 *  exactamente el fallo que esto cierra.
 */
const fs = require('fs');
const path = require('path');

const ESQUEMA = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const texto = fs.readFileSync(ESQUEMA, 'utf8');

/**
 * Tablas que crecen con el TIEMPO, no con el tamaño de la planta.
 *
 * `listadoGlobal` dice si alguna vez se leen SIN filtrar por activo. Cuando no
 * —porque sólo se llega a ellas desde la ficha de su equipo— un índice por
 * fecha suelto no lo usaría nadie y se pagaría en CADA escritura. Ahí se
 * declara `false` **con su motivo escrito**, igual que las exenciones de
 * `verificar:topes`: una exención no es barra libre, es una decisión firmada.
 *
 * Es la regla del bloque 101 aplicada a los índices: *un índice sobre algo que
 * nadie consulta así no hace la pantalla más rápida; sólo hace las escrituras
 * más lentas.*
 */
const QUE_CRECEN = [
  { modelo: 'WorkOrder', fecha: 'createdAt', clave: 'assetId', listadoGlobal: true },
  { modelo: 'Incident', fecha: 'reportedAt', clave: 'assetId', listadoGlobal: true },
  { modelo: 'FailureEvent', fecha: 'occurredAt', clave: 'assetId', listadoGlobal: true },
  { modelo: 'AuditLog', fecha: 'createdAt', clave: null, listadoGlobal: true },
  {
    modelo: 'AssetHistory',
    fecha: 'createdAt',
    clave: 'assetId',
    listadoGlobal: false,
    motivo: 'sólo se lee como relación del activo (asset.history); medido en el bloque 105, cero consultas sin assetId',
  },
  {
    modelo: 'StockMovement',
    fecha: 'createdAt',
    /* NO lleva `assetId`: este modelo no conoce el activo. El movimiento cuelga
       del REPUESTO. Declararlo por activo fue un error real del bloque 105 que
       la base rechazó al migrar — de ahí la comprobación de abajo. */
    clave: 'sparePartId',
    listadoGlobal: false,
    motivo: 'se llega desde el repuesto o desde la línea de material de la orden; la única consulta suelta es un count',
  },
];

function cuerpo(modelo) {
  const re = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, 'm');
  const m = re.exec(texto);
  return m ? m[1] : null;
}

const fallos = [];

for (const t of QUE_CRECEN) {
  const c = cuerpo(t.modelo);
  if (!c) {
    fallos.push(`El modelo ${t.modelo} ya no existe. Actualiza este verificador en vez de borrarlo: `
      + 'un verificador que no encuentra lo que vigila es un verificador apagado.');
    continue;
  }
  const indices = [...c.matchAll(/@@index\(\[([^\]]+)\]\)/g)]
    .map((m) => m[1].split(',').map((x) => x.trim()));

  const porFecha = indices.some((i) => i.length === 1 && i[0] === t.fecha);
  if (t.listadoGlobal && !porFecha) {
    fallos.push(`${t.modelo}: falta @@index([${t.fecha}]). Los listados y la exportación `
      + 'ordenan por esa fecha sin filtrar por activo.');
  }
  /* Una exención sin motivo es una exención que nadie decidió. */
  if (!t.listadoGlobal && !(t.motivo || '').trim()) {
    fallos.push(`${t.modelo}: está exenta del índice por fecha y NO dice por qué. `
      + 'Escribe el motivo al lado, o quítale la exención.');
  }

  if (t.clave) {
    /* PRIMERO: ¿EXISTE ESE CAMPO? En el bloque 105 se declaró un índice
       `[assetId, createdAt]` sobre `StockMovement`, que no tiene `assetId`.
       El esquema lo aceptó, los verificadores lo aceptaron, y reventó contra
       la BASE DE DATOS al migrar. Comprobar que el campo existe antes de
       exigir un índice sobre él es lo que convierte este verificador en algo
       que sirve. */
    const declarado = new RegExp(`^\\s*${t.clave}\\s+\\w`, 'm').test(c);
    if (!declarado) {
      fallos.push(`${t.modelo}: este verificador exige un índice por «${t.clave}» y ese campo `
        + 'NO existe en el modelo. Corrige la lista, no el esquema.');
    } else {
      const compuesto = indices.some((i) => i.length === 2 && i[0] === t.clave && i[1] === t.fecha);
      if (!compuesto) {
        fallos.push(`${t.modelo}: falta @@index([${t.clave}, ${t.fecha}]). El historial de UN `
          + `${t.clave === 'assetId' ? 'activo' : 'repuesto'} se pide siempre así, y sin el `
          + 'compuesto se recorre la tabla entera.');
      }
    }
  }
}

/* La lista sólo puede encoger si el modelo desaparece — nunca por comodidad.
   Es el diseño de `verificar:dto` y `verificar:topes`: una exención no puede
   ser barra libre. */
if (QUE_CRECEN.length < 6) {
  fallos.push('La lista de tablas que crecen se ha encogido. Sólo se quita una tabla si el modelo deja de existir.');
}

if (fallos.length) {
  console.error('\n[verificar:indices-fecha] FALLA\n');
  for (const f of fallos) console.error(`   · ${f}\n`);
  process.exit(1);
}
console.log(`[verificar:indices-fecha] OK — las ${QUE_CRECEN.length} tablas que crecen se leen por fecha con índice.`);
