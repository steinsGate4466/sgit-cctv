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

## Las 3 moderadas que quedan abiertas, declaradas

La puerta de la CI está en **`--audit-level=high`**, así que estas tres pasan.
No es un descuido, es una decisión:

| Cadena | Severidad | Por qué se acepta hoy |
|---|---|---|
| `minio` → `query-string` → `decode-uri-component` | MODERADA | El único parche es ESM y rompe el arranque (arriba). Es una denegación de servicio por entrada mal codificada en el porcentaje de una URL; las URL que se le pasan a MinIO las construye el propio backend, no el usuario |

**Se revisa cuando `minio` publique un mayor que ya no dependa de
`query-string@7`.** Ese día se sube la directa en un bloque propio, con sus
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

Los **7 avisos MODERADOS** que quedan siguen siendo la deuda declarada:
`qs`/`body-parser` bajo `express` y `decode-uri-component` bajo `minio`. Los
dos exigen una versión mayor de una dependencia directa. La CI corta en ALTO,
así que no la tumban — pero **no están tapados con un `|| true`**: salen en el
informe cada vez.
