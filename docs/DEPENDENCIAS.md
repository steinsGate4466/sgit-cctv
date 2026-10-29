# Dependencias y vulnerabilidades — decisiones tomadas

> Este archivo existe porque la CI **ahora falla** con una vulnerabilidad alta.
> Antes no fallaba nunca, y ese es el problema que cierra el bloque 85.

---

## Lo que estaba mal

```yaml
continue-on-error: true
run: npm audit --audit-level=high || true
```

**Dos formas de callarse en la misma línea**, y en dos sitios (backend y
frontend). La CI miraba las 10 vulnerabilidades y pasaba en verde **siempre**.

> Un control que nunca puede fallar no es un control. Es la misma regla que ya
> vale para los verificadores de este proyecto: *uno que no se puede poner en
> rojo se desactiva.*

---

## Por qué NO se usó `npm audit fix`

De las 10 vulnerabilidades, **la herramienta proponía BAJAR de versión en 9**:

| Paquete | Instalado | Lo que proponía npm |
|---|---|---|
| `prisma` | 7.9.1 | **6.19.3** — un mayor hacia atrás |
| `exceljs` | 4.4.0 | **3.4.0** — un mayor hacia atrás |
| `minio` | 8.x | **7.0.26** — un mayor hacia atrás |

Eso está prohibido en este proyecto por dos motivos escritos desde el principio:
no se suben (ni se bajan) versiones mayores a mitad de proyecto, y
**`npm audit fix --force` no se ejecuta nunca**.

---

## Lo que sí se hizo: `overrides`

Las 5 altas eran todas de librerías **transitivas**, y las 5 tenían una versión
parcheada disponible. `overrides` en el `package.json` fija esa versión
parcheada **sin tocar la dependencia directa**.

### Backend

| Override | De quién viene | Advertencia que cierra |
|---|---|---|
| `browserslist ^4.28.8` | `@nestjs/cli` → webpack · `ts-jest` → babel | ALTA · crecimiento de memoria sin tope |
| `deepmerge-ts ^8.0.2` | `prisma` → `@prisma/config` | ALTA · agotamiento de pila con grafos recursivos |
| `mysql2 ^3.24.2` | `prisma` | ALTA · degradación del plugin de autenticación |
| `uuid ^11.1.1` | `exceljs` | MODERADA · falta de comprobación de límites |

### Frontend

| Override | De quién viene | Advertencia |
|---|---|---|
| `browserslist ^4.28.8` | `eslint-plugin-react-hooks` → babel | ALTA |

**Resultado: 5 altas → 0, y CERO dependencias directas cambiadas.** Comprobado
comparando el `package.json` antes y después.

---

## El override que hubo que RETIRAR, y por qué importa

Se intentó también:

```json
"decode-uri-component": "^0.5.0"
```

Es la única versión que cierra la advertencia (`<=0.4.2` es vulnerable). **Y
rompe el sistema.**

`decode-uri-component@0.5.0` es **sólo ESM**. `query-string@7` —que es quien lo
usa, dentro de `minio`— es CommonJS y lo carga con `require()`. Resultado:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]
    require('minio')  ->  revienta
```

**Habría tumbado el arranque del backend en producción**, porque MinIO es lo
que guarda las fotos y los informes. No lo cazó el typecheck: lo cazó una
prueba, `test/maintenance.service.spec.ts`, al fallar al cargar el módulo.

> **Regla que queda: un `override` es un cambio de dependencia como otro
> cualquiera y se prueba como tal.** Correr las pruebas y el `require()` real
> antes de darlo por bueno. Cerrar una advertencia rompiendo el arranque no es
> un arreglo.

---

## Lo que queda abierto, declarado (medido el 29/10/2026)

La puerta de la CI está en **`--audit-level=high`**, así que esto pasa. No es
un descuido, es una decisión. `npm audit` da **13 avisos —4 moderados y 9
bajos—, ninguno alto ni crítico**, y lo único que propone para cerrarlos es
BAJAR una directa de mayor: `minio` a la 7, `@nestjs/cli` a la 7, `jest` a la 25.

| Cadena | Severidad | Por qué se acepta hoy |
|---|---|---|
| `minio` → `query-string` → `decode-uri-component` | MODERADA | El único parche es ESM y rompe el arranque (arriba). Es una denegación de servicio por entrada mal codificada en el porcentaje de una URL; las URL que se le pasan a MinIO las construye el propio backend, no el usuario |
| `minio` → `stream-json` | MODERADA | No hay parche dentro de la 1.x que pide `minio`. Sólo lo usa su escucha de notificaciones del almacén, que este backend no llama |
| `@nestjs/cli` y `jest` → `deepmerge` | BAJA · los 9 avisos son esta cadena | Herramientas de compilación y de pruebas: no viajan a producción |

**Se revisa cuando `minio` publique un mayor que ya no dependa de
`query-string@7` ni de `stream-json@1`.** Ese día se sube la directa en un bloque propio, con sus
pruebas, no de rebote en un `audit fix`.

---

## Si algún día entra una ALTA que no se puede cerrar

En este orden:

1. **Buscar un `override` a la transitiva parcheada.** Es lo que se hizo aquí y
   funciona en la mayoría de los casos.
2. **Comprobar que no rompe:** `npm test`, `npm run build` y un `require()` del
   paquete afectado. Lo del `decode-uri-component` pasó por saltarse esto.
3. **Si no hay forma**, se escribe la excepción AQUÍ con su motivo y se sube el
   umbral de esa línea del CI a propósito.

**Lo que NO se hace es volver a poner un `|| true`.** Eso esconde el problema
sin que nadie haya decidido nada, y a los seis meses ya no queda ni el
recuerdo de que había uno.

---

## `fast-uri` — el aviso ALTO que tumbó la CI (bloque 92)

    fast-uri  3.0.0 - 3.1.5   ALTA
      · host confusion por canonicalización IDN saltada
      · SSRF por normalización de IPv6 malformada
      · SSRF por porcentaje-decodificado repetido del nombre de host

Viene de `@nestjs/cli → @angular-devkit/core → ajv`. **`ajv` pide
`fast-uri@^3.0.1`**, así que la 4.x se sale de su rango y rompería la
resolución: se fija la **3.1.7**, que es la primera parcheada dentro de `^3`.

**Ni un `npm audit fix --force`, ni una versión mayor de una dependencia
directa** — la herramienta proponía bajar `minio` y `@nestjs/platform-express`,
que es exactamente lo que este proyecto no hace a mitad de camino.

**Probado, no supuesto** (la lección del `decode-uri-component`, más abajo):
instalación real, `require()` de `ajv`, `minio` y `express`, typecheck y las
797 pruebas. `npm audit --audit-level=high` sale en **verde**.

En el bloque 92 quedaban **7 avisos MODERADOS** como deuda declarada:
`qs`/`body-parser` bajo `express` y `decode-uri-component` bajo `minio`. Los
dos exigen una versión mayor de una dependencia directa. La CI corta en ALTO,
así que no la tumban — pero **no están tapados con un `|| true`**: salen en el
informe cada vez. `qs` y `body-parser` se cerraron en el bloque 184 (abajo); lo
vigente está en «Lo que queda abierto».

---

## Bloque 184 — la CI en rojo otra vez: avisos nuevos, dos críticos (28/10/2026)

Publicados después del bloque 92. Medido con `npm audit` antes de tocar nada:
**backend 5 ALTAS y 2 CRÍTICAS, frontend 6 ALTAS.**

### Backend — `overrides` a la versión parcheada

| Paquete | Antes → ahora | Aviso |
|---|---|---|
| `handlebars` | 4.7.9 → 4.7.10 | CRÍTICA · inyección de JavaScript al incrustar plantillas precompiladas |
| `proxy-addr` | 2.0.7 → 2.0.8 | CRÍTICA · suplantación de IP con una IPv4 mapeada en IPv6 |
| `multer` | 2.2.0 → 2.5.0 | ALTA · denegación de servicio con nombres de campo multipart (por él salía también `@nestjs/platform-express`) |
| `body-parser` | 1.20.6 → 2.4.0 | ALTA · denegación de servicio con bytes detrás de un cuerpo comprimido |
| `brace-expansion` | 2.1.4 → 2.1.7 | ALTA · expansión de tiempo cuadrático |
| `js-yaml` | 4.3.1 → 4.3.2 | ALTA · `maxTotalMergeKeys` no limita la CPU |
| `qs` · `fast-uri` | 6.15.3 → 6.17.0 · 3.1.7 → 3.1.9 | de paso, a su parche |

**`body-parser` es el que enseña algo.** `express` 5 pide `^2.2.1`, y un
override anterior —`"body-parser": "^1.20.6"`, que no estaba escrito aquí— le
OBLIGABA a usar la 1.x. El aviso alto lo traía nuestro propio override. Ahora
pide lo mismo que pide `express`.

> **Un override que fija un MAYOR distinto del que pide quien lo usa no cierra
> nada: cambia un aviso por otro**, y desde el `package.json` de la directa no
> se ve. Antes de escribir uno: `npm ls <paquete>` y mirar qué rango pide el
> padre.

### Frontend — sin overrides nuevos

| Paquete | Antes → ahora | Cómo |
|---|---|---|
| `axios` | 1.18.1 → 1.21.0 | directa, dentro de la 1 |
| `vite` | 8.2.2 → 8.3.5 | directa, dentro de la 8 (el aviso venía de `launch-editor`, en Windows) |
| `follow-redirects` · `brace-expansion` · `source-map-js` · `zod` | al día | dentro del rango que ya pedía quien los usa: sólo cambia el lock |

Dependencia NUEVA del bloque: **`pdfjs-dist`** (`^6.4.299`), que lee en el
navegador el PDF de la ficha técnica. Se descarga sólo cuando alguien elige un
PDF en esa pantalla.

**Resultado:** backend sin altas ni críticas (lo que queda, arriba); frontend
0 avisos. Ni un mayor directo, ni un `--force`. Comprobado como manda este
archivo: instalación limpia sin rangos inválidos (`npm ls --all`), `require()`
real de los ocho paquetes tocados, 1.849 pruebas, build, y los recorridos
contra el servidor arrancado —el 9 sube un PDF, así que pasa de verdad por
`multer` y `body-parser`—.
