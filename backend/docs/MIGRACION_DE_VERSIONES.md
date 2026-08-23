# Manual de migración de versiones — SGIT-CCTV

> Aceros Arequipa · Planta Pisco · Laminación
> Escrito el 23/08/2026. Este documento se va tachando conforme se avanza.

---

## Por qué existe este documento

El proyecto arrastraba herramientas de una generación anterior sin que nada
avisara. El caso peor fue **ESLint 8**, que llegó a su fin de vida el
**05/10/2024** y siguió en el proyecto **22 meses** sin recibir un solo parche
de seguridad. Nadie lo supo porque no había nada que lo dijera.

El mismo patrón ya había mordido dos veces el mismo día:

1. Los tipos de las pruebas nunca se comprobaban (8 errores escondidos).
2. Node 22 llevaba diez meses en mantenimiento y el verificador no lo miraba.

**La lección no es «actualizar». Es «tener quien avise».** Por eso el último
bloque de este plan no es una actualización: es un verificador.

---

## Estado y destino

| Pieza | Antes | Destino | Estado |
| --- | --- | --- | --- |
| Node | 22 | **24 LTS** | ✅ hecho (bloque 51-N) |
| TypeScript | 5.9.3 | 5.9.x | ✅ ya al día |
| Prisma | 5.22.0 | **7.9.1** | ⬜ M1 · M2 |
| NestJS | 10.4.22 | **11.2.1** | ⬜ M4 |
| ESLint | 8.57.1 (**muerto**) | **10.x** | ⬜ M5 |
| React | 18.3.1 | **19.2.x** | ⬜ M6 |
| React Router | 6.30.4 (**con fallo**) | **6.30.6** | ⬜ M0 |
| Vite | 5.4.21 | **8.x** | ⬜ M7 |
| Recharts | 2.15.4 | **3.x** | ⬜ M8 |
| argon2 | 0.40.3 | **0.45.x** | ⬜ M8 |
| pdfkit | 0.15.2 | **0.20.x** | ⬜ M8 |
| axios · exceljs · minio · qrcode | — | — | ✅ al día |

**NO se va a Prisma 8.** Está en versión candidata. En un sistema de planta no
se pone software de pre-lanzamiento.

---

## Reglas de esta migración

1. **Una capa por vez.** Nunca dos saltos mayores en el mismo commit. Si algo
   se pone rojo, tiene que ser obvio quién lo rompió.
2. **Después de cada capa:** `typecheck` + las 926 pruebas + los verificadores
   + `build`. Si una sola cosa falla, se para ahí.
3. **Los commits los escribe Cristhian.** Se le entrega la lista completa.
4. **Nunca `npm audit fix --force`.** Sube versiones mayores solo, que es
   exactamente lo que este plan hace de forma controlada.
5. **`npm install` y `prisma generate` se corren en Windows**, no en el entorno
   de Claude: el `node_modules` es la instalación de Windows y tocarla desde
   Linux cambia los binarios de plataforma y rompe el build local.

---

## M0 — Lo gratis (riesgo cero)

### M0-a · El fallo real de React Router

`react-router` 6.30.4 tiene una **redirección abierta** que puede derivar en
XSS (avisos `GHSA-wrjc-x8rr-h8h6` y `GHSA-337j-9hxr-rhxg`). La corrección está
en **6.30.6**: es un parche, no cambia nada de la API.

Superficie real en este proyecto: baja. Todos los `to={...}` salen de datos
que arma el propio backend, no de la barra de direcciones. Pero el arreglo
cuesta un comando.

### M0-b · El servidor de desarrollo abierto a la red

`vite.config.ts` tiene `server: { host: true }`, o sea que **escucha en todas
las interfaces de red**. Con el fallo de esbuild (`GHSA-67mh-4wv8-2f99`,
«cualquier web puede mandar peticiones al servidor de desarrollo y leer la
respuesta»), cualquiera en la misma red puede leer el código y las variables
mientras se está programando.

En producción NO aplica: el contenedor sirve archivos estáticos con `serve` y
Vite no está en la imagen.

---

## M1 — Prisma 5 → 6

### Qué rompe Prisma 6, y qué de eso nos toca

Se comprobó el esquema completo (73 modelos, 54 enums, 40 migraciones):

| Cambio de Prisma 6 | ¿Nos afecta? | Comprobación |
| --- | --- | --- |
| `NotFoundError` eliminado | **NO** | Cero usos en `src/` y `prisma/` |
| `Buffer` → `Uint8Array` en campos `Bytes` | **NO** | El esquema no tiene ni un campo `Bytes` |
| `fullTextSearch` → `fullTextSearchPostgres` | **NO** | No hay `previewFeatures` declaradas |
| `async`/`await`/`using` como nombre de modelo | **NO** | Ninguno se llama así |
| m-n implícitas: índice único → clave primaria | **NO** | **Cero relaciones implícitas.** Ninguna migración crea tablas `_Algo`; todas las relaciones declaran `fields`/`references` |
| Node mínimo 22.11 · TypeScript mínimo 5.1 | **Cumplido** | Node 24 · TypeScript 5.9.3 |

**Conclusión: M1 es un cambio de versión sin cambios de código.**

---

## M2 — Prisma 6 → 7 (el salto gordo)

### Lo que se gana

Prisma 7 **elimina el motor escrito en Rust**. Hasta ahora, cada despliegue
descargaba e instalaba un binario aparte de decenas de megas que corría al
lado de la aplicación. Ahora todo es TypeScript.

- Imagen de Docker mucho más pequeña → Railway despliega más rápido y cuesta menos
- Arranque más rápido: no hay motor que levantar en cada reinicio
- Menos memoria y CPU
- Se acaban los fallos al descargar binarios de motor (ya nos pasó: `403 Forbidden`)
- Prisma anuncia consultas hasta 3× más rápidas — **es su cifra, hay que medirla**

### LA TRAMPA: el módulo ESM

La guía oficial de actualización dice que hay que poner `"type": "module"` en
el `package.json` y pasar el proyecto a módulos ESM.

**ESO NO SE PUEDE HACER AQUÍ.** NestJS 11 no soporta ESM oficialmente
(`nestjs/nest#15331`); ESM está previsto para NestJS 12. Y el modo en que
fallaría es el peor posible: la inyección de dependencias deja de encontrar
los tipos de constructor y **el arranque revienta sin decir por qué**. Ya nos
pasó una vez con la inyección, y por eso existe `verificar-inyeccion.js`.

**La salida está en la referencia del generador, no en la guía:**

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"          // <-- ESTO es lo que salva el proyecto
  runtime      = "nodejs"
}
```

La documentación del generador `prisma-client` dice literalmente: *«Supports
ESM and CommonJS via the `moduleFormat` field»*. Con `cjs` el proyecto sigue
siendo CommonJS y NestJS ni se entera.

### Lista completa de lo que hay que tocar

1. **`schema.prisma`** — cambiar el generador (arriba). `output` es obligatorio
   en v7: ya no se genera dentro de `node_modules`.
2. **26 archivos** importan `from '@prisma/client'` → pasan a la ruta generada.
   Los enums pueden ir a `.../generated/prisma/enums`, que es más ligero.
3. **`prisma.service.ts`** — ahora hace falta un adaptador de base de datos:
   ```ts
   import { PrismaPg } from '@prisma/adapter-pg';
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   new PrismaClient({ adapter });
   ```
4. **`prisma.config.ts`** (nuevo, en la raíz del backend) — v7 mueve aquí la URL
   de la base, la ruta del esquema, la de migraciones y el script de semilla.
5. **`dotenv`** — v7 ya no carga el `.env` solo. Hay que cargarlo explícitamente.
6. **El CI se rompe en dos sitios:**
   - `prisma migrate diff --shadow-database-url` → esos parámetros se
     eliminaron. Ahora es `--from-config-datasource` y la URL va en
     `prisma.config.ts`.
   - `migrate dev` y `db push` ya no ejecutan `generate` ni la semilla solos.
     Hay que llamarlos a mano.
7. **`Prisma.validator`** no existe en el generador nuevo. Se usa `satisfies`
   de TypeScript. (Comprobar si se usa antes de migrar.)

### M3 — Los dos que tumban Railway

Ninguno de estos falla en la laptop. Los dos fallan en producción.

**a) Certificado SSL.** Prisma 5 ignoraba certificados inválidos en silencio.
Prisma 7 usa el driver `pg` de Node y ya no lo hace. Railway sirve Postgres
por SSL, así que aparece:

```
Error: P1010: User was denied access on the database <database>
```

Se resuelve con `ssl: { rejectUnauthorized: false }` en el adaptador (mismo
comportamiento que antes) o configurando el certificado con
`NODE_EXTRA_CA_CERTS`. **Hay que decidirlo y probarlo ANTES de desplegar.**

**b) Tiempo de espera de conexión.** Prisma 5 cortaba a los 5 segundos. El
driver `pg` **no tiene límite por defecto (`0`)**. Sin configurarlo, una
consulta colgada se queda colgada para siempre y va comiendo conexiones.

---

## M4 — NestJS 10 → 11

Va **después** de que Prisma esté estable, no antes. Motivo: si algo se rompe
tras mover las dos cosas, no se sabría cuál fue.

### Auditoría: qué de NestJS 11 nos toca

Se revisó el proyecto contra la lista completa de cambios que rompen. El
resultado es mejor de lo esperado: **casi ninguno aplica.**

| Cambio de NestJS 11 | ¿Nos afecta? | Comprobación hecha |
| --- | --- | --- |
| **Express 5**: los comodines de ruta necesitan nombre (`/*` → `/*splat`) | **NO** | Cero rutas con `*` en los 30 controladores |
| Express 5: `forRoutes('*')` en middleware | **NO** | No hay middleware propio: cero `implements NestModule` |
| Express 5: las consultas anidadas (`filter[where]`, `item[]`) dejan de analizarse | **NO** | Ningún sitio las usa, ni en el backend ni en el frontend |
| Fastify 5 y su CORS | **NO** | El proyecto usa Express |
| **`Reflector.getAllAndOverride` devuelve `T \| undefined`** | **NO** | Se usa en 6 guardas y **las 6 ya comprobaban el vacío**: `if (!required)`, `if (!cupo)`, `especifico \|\| RITMO_GENERAL`, `meta?.recurso`. Escritas a la defensiva desde el principio |
| Orden inverso al destruir (`OnModuleDestroy`) | **Irrelevante** | Sólo `PrismaService` lo implementa: cierra la conexión y no depende de nadie |
| El middleware de módulos globales corre primero | **NO** | No hay middleware |
| `CacheModule` migra a Keyv | **NO** | No se usa |
| `TerminusModule`: nueva API de salud | **NO** | No se usa. El `/health` es un controlador propio |
| `ConfigModule` v4: cambia la precedencia | **Mínimo** | Sólo `ConfigModule.forRoot({ isGlobal: true })`. Sin espacios de nombres, sin esquema de validación: no hay precedencia que cambiar |
| Resolución de módulos dinámicos | **Bajo** | Podría afectar a pruebas que armen módulos con `Test.createTestingModule`. Las 926 pruebas del proyecto simulan Prisma directamente |
| Node ≥ 20 obligatorio | **Cumplido** | Node 24 desde el bloque 51-N |

### Lo que sí hubo que tocar

**`@types/express` de 4 a 5.** NestJS 11 trae Express 5, y once controladores
importan el tipo `Response` de Express. Con los tipos de la versión 4 sobre la
librería 5, la compilación falla en sitios que no tienen nada que ver.

**`@types/node` de 20 a 24.** Estaba en 20 mientras el proyecto corre sobre
Node 24 desde hace un bloque. No rompía nada todavía, pero es la misma clase
de desfase silencioso: los tipos describen un Node que no es el que ejecuta.

---

## M5 · M6 · M7 · M8 — el resto

| Bloque | Qué | Cuidado |
| --- | --- | --- |
| M5 | ESLint 8 → 10 | **HECHO.** Ver abajo |
| M6 | React 18 → 19 + React Router | Se comprobó: **el código no usa ninguna API exclusiva de React 19**, así que el salto es de dependencias, no de código |
| M7 | Vite 5 → 8 | Tres versiones mayores. Cierra de paso los fallos de esbuild |
| M8 | Recharts 2 → 3, argon2, pdfkit | Recharts 3 tiene cambios reales de API en los gráficos: revisar pantalla por pantalla. **argon2 cifra las contraseñas: probar el login sí o sí** |

---

## M5 — ESLint 8 → 10 (hecho, bloque 54)

ESLint 8 llegó a su **fin de vida el 05/10/2024** y el proyecto siguió sobre él
**22 meses** sin un solo parche de seguridad. ESLint 9 también murió, el
06/08/2026. Se salta directo a la 10.

### Del formato viejo a la configuración plana

`.eslintrc.cjs` → **`eslint.config.mjs`**. No es un cambio de nombre: ESLint 9
retiró el formato antiguo y la 10 ya ni lo lee.

Tres cosas que hubo que traducir:

| Antes | Ahora | Por qué |
| --- | --- | --- |
| `env: { browser: true }` | `globals: globals.browser` | `env` se retiró. Sin esto, cada `window` y `fetch` sale como variable inexistente |
| `plugins: ['react-hooks']` | `import` + `plugins: { 'react-hooks': reactHooks }` | Ya no se adivina el paquete por el nombre: se ve de dónde sale cada regla |
| `ignorePatterns: [...]` | Un bloque `{ ignores: [...] }`, **el primero del array** | El orden importa: se aplica a lo que viene detrás |

**Se llama `.mjs` y no `.js`** porque el `package.json` del frontend no declara
`"type": "module"`. Un `eslint.config.js` se leería como CommonJS y fallaría
con «Cannot use import statement outside a module».

### El choque que costó encontrar: `brace-expansion`

Tras instalar, ESLint reventaba entero:

    TypeError: (0 , brace_expansion_1.expand) is not a function

La causa estaba en un `overrides` del `package.json` que fijaba
`brace-expansion: ^2.0.2` —puesto en su día para huir de una versión 1.x con
un fallo conocido—. El `minimatch` que trae ESLint 10 necesita la 4 o
superior, que exporta `{ expand }` en vez de la función suelta.

**Se quitó el override.** Comprobado: sin él, npm resuelve `brace-expansion@5.0.9`,
que está muy por encima de la versión vulnerable. El candado ya no protegía de
nada y sí impedía actualizar. Es el patrón de siempre: una defensa que nadie
revisa se convierte con el tiempo en un obstáculo.

### La comprobación que de verdad importa

El archivo de configuración antiguo lo dejaba escrito:

> *«Subir de versión una herramienta de seguridad y no verificar que sigue
> protegiendo es peor que dejar el aviso.»*

Así que se probó. Se creó un componente con **el fallo exacto** que dejó la
pantalla de Activos en blanco en producción —un hook después de un
`if (cargando) return`— y ESLint 10 lo cazó:

    error  React Hook "useState" is called conditionally... Did you
           accidentally call a React Hook after an early return?
           react-hooks/rules-of-hooks

Código de salida 1. La red de seguridad sigue puesta.

### De regalo: 5 supresiones muertas

ESLint 10 avisa por defecto de los `// eslint-disable-next-line` que ya no
tapan nada. Había cinco. Se quitaron con `--fix`.

No es limpieza cosmética: una supresión muerta es una mina. El día que el
código cambie y la regla vuelva a dispararse, ese comentario la silenciará sin
que nadie se entere de que estaba ahí por otro motivo.

**Resultado:** 0 errores y **los mismos 2 avisos** que con ESLint 8. Ninguna
regresión.

### Pendiente, anotado aquí para no perderlo

El **backend tiene un `.eslintrc.js` y un script `lint`, pero ESLint NO está
instalado ahí**. Ese script no puede funcionar: revienta con «eslint no se
reconoce». Lleva así desde siempre y nadie lo notó porque el CI sólo corre el
lint del frontend.

Hay que decidir: o se instala ESLint en el backend y se migra también su
configuración, o se retira el script para que nadie tropiece. No se toca en
este bloque para no mezclarlo con la subida de versión.

---

## M9 — El vigilante (lo más importante de todo el plan)

Un verificador nuevo, `verificar-dependencias.js`, que **hace fallar el CI**
cuando una dependencia directa está sin soporte, y que **avisa** cuando entra
en mantenimiento o se queda muy atrás.

Es exactamente lo que se le añadió a `verificar-node.js` en el bloque 51-N,
pero para las 30 y pico librerías del proyecto.

Sin esto, dentro de dos años estamos igual. Con esto, el CI lo dice el día que
pasa.

---

## Orden de ejecución

```
M0  react-router + servidor de desarrollo      ← gratis, ya
M1  Prisma 6                                   ← sin cambios de código
M2  Prisma 7                                   ← el salto gordo
M3  Railway: SSL + conexiones                  ← probar contra la base real
M4  NestJS 11
M5  ESLint 10
M6  React 19 + React Router
M7  Vite 8
M8  Recharts, argon2, pdfkit
M9  El vigilante de dependencias
```

## Después de CADA bloque

```
backend:   npm run typecheck
           npx jest --silent src/
           npx jest --silent test/
           npm run verificar
frontend:  npm run typecheck
           npm run lint
           npm run verificar:foco / cascada / dialogos / densidad
                             / formato / avisos / etiquetas
           npm run build
```

Todo verde → commit. Algo rojo → se para y se arregla antes de seguir.

---

## Fuentes

- Prisma — Upgrade to v6: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v6
- Prisma — Upgrade to v7: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Prisma — Generators (`moduleFormat`): https://www.prisma.io/docs/orm/prisma-schema/overview/generators
- NestJS #15331 — ESM interoperability: https://github.com/nestjs/nest/issues/15331
- ESLint — fin de vida de v8: https://eslint.org/blog/2024/09/eslint-v8-eol-version-support/
- Node — calendario de versiones: https://github.com/nodejs/Release/blob/main/schedule.json
