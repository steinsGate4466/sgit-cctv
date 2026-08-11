# 12.3 — Ámbito por identificador

**11/08/2026** · El último agujero de seguridad real del sistema.
**OWASP A01:2025 — Broken Access Control**, el riesgo número 1.

---

## El agujero

El filtro de tren se aplicaba en los **listados**, pero no cuando se pedía un
registro **por su identificador**. Un usuario del Tren 2 escribía en la barra
de direcciones:

```
/api/v1/assets/<id-de-un-activo-del-Tren-1>
```

...y lo obtenía entero, credenciales incluidas. No hacía falta ninguna
herramienta: basta copiar un identificador de un enlace y cambiarlo.

Eran **41 consultas** `findUnique({ where: { id } })` sin comprobar nada, en
**116 rutas** con parámetro.

---

## Cómo se cerró

### Un decorador explícito, no un guard que adivine

Un guard genérico tendría que deducir a qué modelo pertenece cada ruta a
partir de la URL. Eso funciona hasta la primera ruta que no siga el patrón —
y entonces **falla abriendo**: deja pasar sin comprobar y nadie se entera. Un
fallo de seguridad silencioso es el peor tipo.

Con decorador, la ruta declara qué toca:

```ts
@AmbitoDe('asset')
@Get(':id')
```

Y lo que **no** pertenece a ningún tren lo declara también, con su motivo al
lado:

```ts
@SinAmbito()  // almacén: es uno solo para toda la planta
@Patch(':id')
```

`@SinAmbito()` no es una escapatoria: es una **decisión escrita**. Un catálogo
global o el almacén de toda la planta no tienen tren, y decirlo en voz alta
vale más que dejarlo en blanco.

**Reparto:** 66 rutas con ámbito · 50 declaradas sin él · **0 sin declarar**.

### Devuelve 404, no 403

Un **403** confirma que el registro **existe**, sólo que no es tuyo. Con eso
se pueden recorrer identificadores y dibujar el inventario del vecino sin
llegar a leer un solo campo.

El **404** no dice nada: para ese usuario, ese activo sencillamente no está.

### Cada recurso llega a su tren por su camino

| Recurso | Cómo se resuelve |
|---|---|
| `asset`, `cabinet`, `location` | Su propio `locationId` |
| `workOrder` | El suyo; si no tiene, el del activo |
| `incident`, `accessRequest`, `inspeccionGrua`, `assetCable` | Por su activo |
| `instalacion` | Su ubicación, o su tren |
| `ventanaParada` | Guarda el tren directamente |

---

## Las tres reglas que evitan romper trabajo legítimo

Cerrar de más es **peor** que cerrar de menos, porque no se nota hasta que
alguien está en planta, con casco, y no puede abrir su orden.

**1 · Ámbito vacío = todos los trenes.**
Hoy **todos** los usuarios tienen el ámbito vacío, así que este guard **no
cambia el comportamiento de nadie** hasta que el ingeniero decida restringir a
alguien. Se despliega sin riesgo. Además es el camino rápido: con ámbito
vacío ni se consulta la entidad.

**2 · Un registro sin ubicación pasa.**
Un activo en STOCK, una orden de mapeo sin equipo todavía, un permiso de
altura sin activo: no pertenecen a ningún tren. Bloquearlos dejaría el almacén
invisible para media planta.

**3 · Si la comprobación falla, pasa.**
Si la base no responde, este guard no puede ser el que tumbe el sistema. Falla
abriendo **a propósito**: es defensa en profundidad, no la única capa. El
permiso ya se comprobó antes y el usuario ya está autenticado.

---

## Verificador 10 — para que no se olvide la ruta 117

Un decorador que hay que acordarse de poner **es un agujero con fecha**: la
ruta que escriba alguien el mes que viene no lo va a llevar.

`scripts/verificar-ambito.js` recorre todos los controladores y exige que
**toda** ruta con parámetro declare una de las dos cosas. Probado quitando un
decorador a propósito: sale con código 1 y dice qué ruta y en qué línea.

El olvido pasa de ser un agujero silencioso a ser un fallo de la entrega.

---

## Pruebas: los dos casos, siempre

21 pruebas. Por cada regla hay **dos**: el propio pasa y el ajeno no. Una sola
de las dos no demuestra nada — sólo con la primera se puede tener un guard que
deja pasar todo, y sólo con la segunda uno que no deja pasar nada.

```
backend/src/common/ambito.decorator.ts     (nuevo)
backend/src/common/guards/ambito.guard.ts  (nuevo)
backend/scripts/verificar-ambito.js        (nuevo, verificador 10)
backend/test/ambito-guard.spec.ts          (nuevo, 21 pruebas)
backend/src/app.module.ts                  (registra el guard)
26 controladores                           (116 rutas declaradas)
```

**Sin migración. Sin cambios de esquema.**

---

## Orden de los guards, y por qué

```
1. RitmoGuard        límite de peticiones
2. JwtAuthGuard      ¿quién eres?
3. PermissionsGuard  ¿puedes leer activos?
4. AmbitoGuard       ¿este activo es de tu tren?
```

El de ámbito va **el último a propósito**: sólo tiene sentido preguntarse si
un activo es de tu tren cuando ya se sabe quién eres y que tienes permiso para
leer activos. Consultar la base antes sería trabajo tirado en cada petición
sin token.
