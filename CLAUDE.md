# SGIT-CCTV — Modelo de trabajo

> **LÉEME ANTES DE ESCRIBIR UNA SOLA LÍNEA.**
> Este archivo existe porque cada punto de aquí abajo nació de un error real
> que ya costó tiempo. No son preferencias de estilo: son reglas compradas
> con horas perdidas.

---

## 0. El proyecto en una frase

ERP de infraestructura CCTV y red para **Aceros Arequipa, Planta Pisco**,
acotado a **LAMINACIÓN (Trenes 1, 2 y 3)**.

**Ruta del proyecto en el equipo del usuario:**
`C:\Users\CRISTHIAN\Desktop\sgit-cctv` — *el Escritorio, no Descargas, no
"RUTA\DE\TU\PROYECTO".* Los scripts que se entreguen deben ir solos ahí.

---

## 1. Reglas del usuario — no negociables

| Regla | Por qué |
|---|---|
| **Los commits los escribe ÉL** | Es su punto de control para revisar antes de que algo entre. Ningún script debe ejecutar `git commit` ni `git push`. Se entrega verde y él decide. |
| **Nunca inventar datos de planta** | Etapas, causas, síntomas, rutinas y capacidades salen de la planta. Si el dato no está, se avisa — no se rellena con un valor "razonable". |
| **Todo lo de planta, editable desde la interfaz** | Si hay que tocar código para cambiar una causa de falla, está mal hecho. |
| **No borrar archivos que puedan servir** | Aunque parezcan basura. |
| **Nunca `npm audit fix --force`** | Ni subidas de versión mayores a mitad de proyecto. |
| **Los scripts se descargan a `$env:USERPROFILE\Downloads`** | Nunca referenciar rutas internas del entorno de trabajo del agente. |
| **Secretos: jamás en el chat ni en capturas** | Token de Telegram, `JWT_SECRET`, cadenas de conexión. |

### Formato de entrega obligatorio

Cada entrega lleva, en este orden:

1. **Qué hace y para qué** — en castellano, sin jerga.
2. **TODOS los comandos**, completos, sin `RUTA\DE\TU\...`.
3. **Errores anticipados**, ya resueltos.
4. **Siguiente paso.**
5. **El esqueleto de bloques** con su estado.
6. **Reportar absolutamente todo**, incluidos los propios fallos.
7. **Consultar antes de actuar** cuando la decisión sea suya.

### PowerShell — dos cosas que siempre fallan

- **`npm.cmd`, nunca `npm`**: la ExecutionPolicy bloquea `npm.ps1`.
- **La ExecutionPolicy también bloquea los `.ps1` sueltos.** Por eso cada
  script se entrega con un `.bat` al lado:
  `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0<script>.ps1"`.
  Eso salta el bloqueo **sólo para ese proceso**, sin cambiar la política del
  equipo.

---

## 2. Arquitectura

```
backend/    NestJS + TypeScript + Prisma 5.22 + PostgreSQL 18.4
frontend/   React + Vite (SPA, sin framework de servidor)
             · React.lazy por ruta + un solo <Suspense>
             · ErrorBoundary en dos niveles (ver §5)
Railway     backend + Postgres + despliegue continuo desde GitHub
MinIO       fotos e informes
```

### Dos ideas que sostienen todo el sistema

**1. El árbol de planta manda.**
`Planta → LAMINACIÓN → Tren → Etapa → Zona → Gabinete → Equipo`.
El tren, la etapa, la criticidad y el intervalo preventivo de un activo **se
deducen de dónde cuelga** (`common/plant-context.ts`). No se escriben a mano.
Escribir el tren en el activo fue un error que ya hubo que deshacer.

**2. Lo que se puede calcular no se guarda.**
El grafo de red se arma en cada consulta (`network.service.ts`). El estado
efectivo de un activo se deriva (`common/asset-status.ts`). Guardar una copia
significa mantener dos verdades, y la segunda siempre se queda vieja.

---

## 3. Trampas del stack — cada una ya mordió

### Prisma / PostgreSQL

- Los valores de un `enum` **sólo se pueden AÑADIR**, nunca renombrar ni quitar.
- **Una migración aplicada es INMUTABLE.** Se corrige con otra migración nueva.
- El nombre de la carpeta de migración **debe ordenar después** de la última:
  Prisma las aplica por orden alfabético.
- Prisma escribe **un solo `ALTER TABLE`** con muchos `ADD COLUMN` separados
  por comas. Un verificador que busque un `ADD COLUMN` por línea da falsos
  positivos (ya pasó: 22 de golpe).
- Prisma **siempre** emite `ON DELETE ... ON UPDATE ...` en las claves foráneas.
  Si la migración escrita a mano no lo pone, la CI detecta desfase.
- Los nombres de índice incluyen **todas** las columnas.
- Prisma **no sabe expresar índices GIN**. Si se crea uno en SQL, hay que
  documentarlo o la comprobación de desfase falla.
- **Si se crea un índice en SQL, hay que declararlo con `@@index`.** Este error
  se cometió dos veces (la segunda con `work_orders`).
- **`: any` en un filtro desactiva la comprobación** que detecta filtros
  anidados. Un `const x: any = { in: [...] }` dentro de un `notIn` produjo un
  400 en el tablero.
- **`Asset` NO tiene campo `name`.** Tiene `model`. Un `select` con un campo
  inexistente invalida el tipo del resultado ENTERO y TypeScript acaba
  señalando media docena de sitios correctos.

### TypeScript / NestJS

- `import * as X` con `esModuleInterop` da un **espacio de nombres, no una
  clase**: `new X()` compila y revienta al ejecutarse. Usar `require()`.
  (Pasó con PDFDocument y las etiquetas de gabinete.)
- **Toda clase inyectada por constructor debe estar en `providers` de su
  módulo.** Faltó `BandejaService` y tiró producción al arrancar.
- En un controlador, **las rutas literales van ANTES que los parámetros**:
  `@Get('traducir')` antes de `@Get(':id')`, o Nest lee "traducir" como un id.

### Frontend

- **Los permisos viajan dentro del token de sesión.** Cambiar un rol no surte
  efecto hasta que el usuario **cierra sesión y vuelve a entrar**. Explica el
  90 % de los "no me sale el menú".
- Cada despliegue **renombra los archivos de cada pantalla** (`Assets-a3f9.js`).
  Una pestaña abierta desde antes pide un archivo que ya no existe. Por eso
  existe `lazy-con-reintento.ts`.
- Hay **92 `catch(() => [])`** que convierten un fallo en "no hay datos". El
  aviso central de `api/client.ts` lo compensa, pero la deuda sigue ahí.

---

## 4. Verificadores — `npm run verificar`

Cada uno nació de un fallo concreto. **Corren en la CI y antes de cada push.**

| Script | Qué caza | De dónde salió |
|---|---|---|
| `verificar:inyeccion` | Clase inyectada sin declarar en su módulo | Caída de producción 01/08 |
| `verificar:filtros` | Filtros de Prisma anidados por error | Tablero en 400 |
| `verificar:campos` | Campo inexistente en un `select` | El `name` del bloque 6 |
| `verificar:migraciones` | Esquema contra migraciones, sin base de datos | Desfase repetido en la CI |
| `verificar:constructores` | `new X()` sobre un espacio de nombres | Etiquetas de gabinete |
| `verificar:bd` | La base real contra `schema.prisma` | Desfase de la base local |

### Regla de oro al escribir un verificador

**Se prueba SIEMPRE contra el código real antes de darlo por bueno, y se
comprueba que caza el error para el que se hizo** (reintroduciéndolo a
propósito). Cuatro de los verificadores dieron falsos positivos en su primera
versión. Un verificador que se equivoca es peor que no tenerlo: enseña al
equipo a ignorarlo.

Causas conocidas de falso positivo, ya resueltas:
- Buscar dentro de comentarios y de cadenas de texto.
- Suponer un `ADD COLUMN` por línea.
- Olvidar los agregados de Prisma (`_count`, `_avg`, `_sum`, `_min`, `_max`),
  que son válidos en un `select` y no son campos.

---

## 5. Decisiones tomadas — no deshacer sin motivo

| Decisión | Motivo |
|---|---|
| El impacto de red se mide como **pérdida de alcance al grabador**, no contando vecinos | Es lo que hace que un anillo de fibra bien montado dé impacto CERO, que es la respuesta correcta |
| Si un NVR **no declara** cuántos canales tiene, **no se inventa** | Diría "quedan 9 libres" sin saberlo y alguien planificaría cámaras sobre esa suposición |
| El mapa se pinta **siempre**, aunque esté vacío, explicando qué falta | Esconder el bloque hizo que la función pareciera inexistente |
| `ErrorBoundary` en **dos** niveles, con `key` por ruta | Uno alrededor del contenido (el menú sobrevive) y otro alrededor de todo. La `key` evita que el error se quede pegado al navegar |
| Al enlazar cámaras sólo se ofrecen las **del mismo tren** que el grabador | Una cámara del Tren 1 no se graba en el NVR del Tren 3 |
| Síntoma, causa y acción salen de **catálogo**, no de texto libre | Con texto libre no se puede contar después qué falla más |

---

## 6. Estado — agosto 2026

**27 módulos · 26 pantallas · 21 migraciones · 375 pruebas · 6 verificadores.**

### Pendiente, por orden

1. **Ventanas de parada (F8-F/G/H)** — *bloqueado por una decisión del
   ingeniero*: ¿de dónde salen las paradas de tren, manual, Producción o SAP?
   No existe el modelo `StopWindow`. **No implementar sin esa respuesta.**
2. **5b** — que el QR abra una OM de un toque.
3. **Bloque 9** — campañas de mapeo (repartir zonas, medir avance).
4. **Ámbito en las rutas por identificador** — hoy un usuario del Tren 2 puede
   pedir la foto de un equipo del Tren 1.
5. **3G-bis** — mapeo de columnas del Excel de SAP. Espera un export real.

### Deuda técnica conocida

- 92 `catch(() => [])`.
- 19 `@Body() dto: any`.
- NestJS 11 sin actualizar (a propósito: no se sube versión mayor a mitad).
- Restauración del respaldo **nunca probada**.

---

## 7. Cómo se entrega

1. Escribir el código en el proyecto.
2. Correr `npm run verificar`, `npm test`, `npm run build` (backend) y
   `typecheck` + `build` (frontend).
3. Empaquetar en un `.ps1` **con base64** (evita todo el infierno de comillas
   de PowerShell) + un `.bat` al lado.
4. El script: se va solo al Escritorio, escribe, verifica, compila **y PARA**.
   **Nunca toca git.**
5. Comprobar el equilibrio de paréntesis del `.ps1` **ignorando las líneas de
   comentario** — contarlas dio un falso −3.
6. Documentar el bloque en `docs/` y actualizar `docs/ESQUELETO_DE_BLOQUES.md`.

---

## 8. Lo que se ha aprendido a base de meterse la pata

- **Verificar que la copia es fiel no es verificar que el original es correcto.**
  (Se copió un módulo bien y el módulo estaba mal: cayó producción.)
- **Un mensaje de error no es un diagnóstico.** De "el esquema existe" se
  dedujo "las migraciones están aplicadas". Faltaban 21 tablas.
- **Compilar un archivo suelto no es `npm run typecheck`.** Comprobado
  reintroduciendo un error a propósito: no lo detectó.
- **Esconder algo vacío es peor que enseñarlo vacío.** Sin datos, "vacío" y
  "no existe" son indistinguibles para quien mira.
- **Cuando el usuario dice que algo no aparece, lo primero es la sesión**, no
  el despliegue.
