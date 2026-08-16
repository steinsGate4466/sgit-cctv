/* =============================================================================
   PRUEBA DE CALOR — bloque 37
   -----------------------------------------------------------------------------
   QUE HACE
   Sube la presion sobre las tres operaciones que se cruzan cuando hay dos o
   tres ordenes vivas y varias personas trabajando a la vez, y comprueba que
   nada se pierde ni se duplica.

   POR QUE NO ESTA EN JEST
   Las pruebas de Jest usan dobles. Un doble no tiene carrera: responde lo que
   se le dijo. Para que una carrera EXISTA hace falta una base de datos de
   verdad resolviendo escrituras que compiten. Aqui se usa PGlite, que es
   PostgreSQL compilado a WebAssembly: el mismo motor, sin instalar nada.

   COMO SE EJECUTA
       npm install --no-save @electric-sql/pglite
       node scripts/prueba-de-calor.js

   No va en el CI a proposito: tarda, y descargar un motor de base de datos en
   cada push para una comprobacion que no cambia todos los dias no compensa.
   Se corre a mano cuando se toca algo de concurrencia.

   LO QUE ESTA PRUEBA **NO** DEMUESTRA
   PGlite tiene UNA sola conexion y serializa. Eso modela la aislacion mas
   estricta posible, que es el caso bueno. Un PostgreSQL en red con varias
   conexiones puede entrelazar de formas que aqui no ocurren. Esta prueba
   valida LA LOGICA -- que el reintento converge, que el decremento es atomico,
   que la guarda de estado corta -- no el comportamiento exacto bajo latencia
   de red.

   DOS ERRORES QUE COMETIO ESTA MISMA PRUEBA, Y LO QUE ENSEÑARON
    1. La primera version lanzaba BEGIN/COMMIT sueltos con Promise.all sobre
       la unica conexion de PGlite. Los 30 se mezclaban en la misma sesion y
       el stock acababa en -30. No era un fallo del codigo: era del arnes.
    2. La prueba B esperaba 30 movimientos con stock 60 y retiros de 3. De 60
       solo caben 20. La ASERCION estaba mal, no el codigo.
   Las dos se documentan aqui porque una prueba que miente es peor que no
   tenerla: da luz verde a algo que nadie comprobo.
   ============================================================================= */
const { PGlite } = require('@electric-sql/pglite');
const espera = () => new Promise(r => setTimeout(r, 5 + Math.floor(Math.random()*35)));

const nuevaBase = async () => {
  const db = await PGlite.create();
  await db.exec(`
    CREATE TABLE work_orders(id serial primary key, code text unique, status text);
    CREATE TABLE spare_parts(id text primary key, "currentStock" numeric);
    CREATE TABLE stock_movements(id serial primary key, "sparePartId" text, qty numeric);
  `);
  return db;
};

async function crearOM(db, MAX = 8) {
  for (let i = 0; i < MAX; i++) {
    const r = await db.query(`SELECT code FROM work_orders WHERE code LIKE 'OM-%' ORDER BY code DESC LIMIT 1`);
    const ult = r.rows[0] ? parseInt(r.rows[0].code.slice(8), 10) : 0;
    const code = 'OM-2026-' + String(ult + 1).padStart(4, '0');
    try { await db.query(`INSERT INTO work_orders(code,status) VALUES($1,'ABIERTA')`, [code]); return { ok: true, code }; }
    catch (e) { if (e.code !== '23505') return { ok: false, e: e.code }; if (i < MAX-1) await espera(); }
  }
  return { ok: false, e: 'agotado' };
}

/* Retiro como lo hace generarRetiro: transaccion + decremento atomico.
   OJO CON EL BANCO DE PRUEBAS: PGlite tiene UNA SOLA conexion. Si se lanzan
   30 BEGIN/COMMIT sueltos con Promise.all, todos se mezclan en la misma
   sesion y el resultado no significa nada -- la primera version de esta
   prueba daba stock -30 y no era culpa del codigo, era del arnes.
   `db.transaction()` toma un cerrojo interno, que es el modelo correcto:
   equivale a la maxima aislacion posible entre peticiones. */
async function retirar(db, cant) {
  try {
    return await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO stock_movements("sparePartId",qty) VALUES('sp1',$1)`, [cant]);
      const r = await tx.query(`UPDATE spare_parts SET "currentStock"="currentStock"-$1 WHERE id='sp1' RETURNING "currentStock"`, [cant]);
      if (Number(r.rows[0].currentStock) < 0) throw new Error('SIN_STOCK');
      return { ok: true };
    });
  } catch (e) { return { ok: false, motivo: e.message }; }
}

(async () => {
  console.log('\n========== PRUEBA DE CALOR ==========\n');

  // --- A. Ordenes: hasta 100 a la vez ---
  console.log('A) CORRELATIVO DE OM — cuanta gente a la vez aguanta');
  console.log('   gente | creadas | codigos unicos | fallos | tiempo | por peticion');
  for (const N of [5, 25, 50, 100]) {
    const db = await nuevaBase();
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: N }, () => crearOM(db)));
    const ms = Date.now() - t0;
    const ok = rs.filter(r => r.ok);
    const uni = new Set(ok.map(r => r.code)).size;
    const bien = ok.length === N && uni === N;
    console.log(`   ${bien?'OK ':'MAL'} ${String(N).padStart(3)} | ${String(ok.length).padStart(7)} | ${String(uni).padStart(14)} | ${String(N-ok.length).padStart(6)} | ${String(ms).padStart(5)}ms | ${(ms/N).toFixed(1)}ms`);
  }

  // --- B. Almacen: sobregiro ---
  console.log('\nB) ALMACEN — 30 tecnicos retirando 3 de un stock de 60');
  {
    /* De 60 unidades solo caben 20 retiros de 3. Los otros 10 tienen que ser
       rechazados: 30x3 = 90 y no hay 90. La primera version de esta prueba
       esperaba 30 movimientos y era la ASERCION la que estaba mal. */
    const db = await nuevaBase();
    await db.query(`INSERT INTO spare_parts VALUES('sp1', 60)`);
    const rs = await Promise.all(Array.from({ length: 30 }, () => retirar(db, 3)));
    const aceptados = rs.filter(r=>r.ok).length;
    const s = Number((await db.query(`SELECT "currentStock" s FROM spare_parts WHERE id='sp1'`)).rows[0].s);
    const movs = Number((await db.query(`SELECT count(*) c FROM stock_movements`)).rows[0].c);
    console.log(`   retiros aceptados: ${aceptados}/30 (caben 20) · stock final: ${s} · movimientos: ${movs}`);
    console.log(`   ${aceptados === 20 && s === 0 && movs === aceptados ? 'OK    el libro y el saldo cuadran, y nadie se llevo de mas' : 'MAL   descuadre'}`);
  }

  console.log('\nC) ALMACEN — 30 pidiendo 3 de un stock de solo 30 (la mitad NO puede)');
  {
    const db = await nuevaBase();
    await db.query(`INSERT INTO spare_parts VALUES('sp1', 30)`);
    const rs = await Promise.all(Array.from({ length: 30 }, () => retirar(db, 3)));
    const s = Number((await db.query(`SELECT "currentStock" s FROM spare_parts WHERE id='sp1'`)).rows[0].s);
    const movs = Number((await db.query(`SELECT count(*) c FROM stock_movements`)).rows[0].c);
    const aceptados = rs.filter(r=>r.ok).length;
    console.log(`   retiros aceptados: ${aceptados}/30 · rechazados: ${30-aceptados} · stock final: ${s}`);
    console.log(`   movimientos en el libro: ${movs} (deben ser ${aceptados}: los rechazados NO dejan rastro)`);
    console.log(`   ${s >= 0 && movs === aceptados && aceptados === 10 ? 'OK    ni un negativo, ni un movimiento fantasma' : 'MAL   revisar'}`);
  }

  console.log('\n=====================================\n');
})();
