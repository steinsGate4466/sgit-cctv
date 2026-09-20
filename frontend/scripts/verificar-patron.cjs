#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 25 (frontend) · LAS PANTALLAS DE PRODUCCIÓN SE LEEN IGUAL
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 120)

   Petición del usuario: *«pule el apartado visual, que es lo que más atrae a
   Producción»*. Y no es maquillaje: **Producción no lee un esquema de base de
   datos**. Mira una pantalla y decide en tres segundos si el sistema le sirve.
   Una pantalla que se lee distinta de su vecina hace dudar de los datos que
   enseña, por buenos que sean.

   El barrido de las once pantallas que ve Producción encontró tres huecos:

     · `Avance de órdenes` — la pantalla estrella — abría con una tabla de seis
       columnas, sin una frase que resumiera.
     · `Zonas vitales` abría con tres recuadros de cifras y un párrafo.
     · `Estado por Tren` no tenía esqueleto de carga ni estado vacío.

   -----------------------------------------------------------------------------
   EL PATRÓN, Y POR QUÉ ES ÉSE

   Una pantalla de Producción se lee de arriba abajo y contesta en este orden:

     1. `<Titular>`   — LA FRASE. «3 órdenes detenidas». Se lee en tres
                        segundos y muchas veces no hace falta bajar más.
     2. `<Cifras>`    — el desglose, para quien quiere el número.
     3. la tabla      — el detalle, para quien va a actuar.
     4. `<Esqueleto>` — mientras carga. Sin él la pantalla salta y parece rota.
     5. el estado VACÍO — «no hay nada» dicho con palabras. Una tabla con
                        cabecera y cero filas no dice que no haya nada: dice
                        que la pantalla se rompió.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA, Y QUÉ NO

   Sobre la lista de abajo —las pantallas que Producción abre de verdad— exige
   el titular, el esqueleto y el estado vacío. **No exige `<Cifras>`**: hay
   pantallas cuyo contenido no son números, y obligar a poner un contador sería
   pedir adorno.

   Tampoco se aplica a las pantallas de gestión técnica o de sistema: un
   formulario de alta no necesita titular, y exigírselo llenaría el informe de
   ruido — que es como muere un verificador.

   PROBADO REINTRODUCIENDO EL FALLO: quitando el `<Titular>` de una de ellas,
   sale con código 1 señalando cuál y qué le falta.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const PAGES = path.join(SRC, 'pages');

/* LAS PANTALLAS QUE ABRE PRODUCCIÓN. La lista es explícita a propósito: sacada
   de las secciones «(lo mío)» y «Producción» del menú. Escrita a mano y no
   deducida del Layout porque una pantalla puede cambiar de sección por un
   motivo de negocio sin que su patrón de lectura tenga que cambiar. */
const DE_PRODUCCION = [
  'PorTren', 'TableroOm', 'VistaGeneral', 'TrainBoard', 'Dependencias',
  'Zonas', 'MisCamaras', 'MisActivos', 'Cobertura', 'MiTren', 'Bandeja',
];

const EXIGE = [
  {
    clave: 'titular',
    re: /<Titular\b/,
    falta: 'no abre con una frase que se lea de un vistazo (`<Titular>`)',
  },
  {
    clave: 'esqueleto',
    re: /Esqueleto/,
    falta: 'no enseña esqueleto mientras carga: la pantalla salta y parece rota',
  },
  {
    clave: 'vacio',
    re: /card vacio|className="card vacio"|nada-que-hacer|colSpan/,
    falta: 'no dice nada cuando no hay datos: una tabla vacía se lee como rota',
  },
];

const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');

const problemas = [];
for (const nombre of DE_PRODUCCION) {
  const f = path.join(PAGES, `${nombre}.tsx`);
  if (!fs.existsSync(f)) {
    problemas.push({ nombre, faltan: ['la pantalla no existe: revisa la lista de este verificador'] });
    continue;
  }
  const t = sinComentarios(fs.readFileSync(f, 'utf8'));
  const faltan = EXIGE.filter((e) => !e.re.test(t)).map((e) => e.falta);
  if (faltan.length) problemas.push({ nombre, faltan });
}

if (!problemas.length) {
  console.log(`[verificar:patron] OK — las ${DE_PRODUCCION.length} pantallas de Producción se leen igual.`);
  process.exit(0);
}

for (const p of problemas) {
  console.error(`  [ERROR] ${p.nombre}.tsx`);
  for (const f of p.faltan) console.error(`          ${f}`);
}
console.error(
  '\nProducción no lee un esquema de base de datos: mira la pantalla y decide en'
  + '\ntres segundos si el sistema le sirve. Una pantalla que se lee distinta de su'
  + '\nvecina hace dudar de los datos que enseña, por buenos que sean.'
  + '\n\nEl orden es: la FRASE, las CIFRAS, la TABLA. Y decir cuándo no hay nada.\n',
);
process.exit(1);
