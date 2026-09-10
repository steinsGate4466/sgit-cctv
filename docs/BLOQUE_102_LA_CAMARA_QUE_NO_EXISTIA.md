# Bloque 102 · La cámara que existía en una pantalla y no en la otra

> **Lo encontró el usuario abriendo el software**, no un verificador. Dos
> pantallas decían cosas contrarias del MISMO tren, y la que mentía llevaba
> bloques mintiendo.

---

## 1 · Lo que se veía

| Pantalla | Qué decía de Tren 1 |
|---|---|
| **Por tren** | «2 cámaras · 1 antena · 6 activos · 1 sin imagen» |
| **Mis cámaras** | «Este tren todavía no tiene cámaras cargadas» |

Las dos no pueden tener razón. Y no era falta de datos: el usuario preguntó si
había que «completar el activo al 100 %». **No.** Los datos estaban; una
pantalla no sabía verlos.

---

## 2 · La causa, exacta

`camaras-caidas.service.ts` pedía las cámaras así:

```ts
select: {
  id, assetCode, status, brand, model, referencePlace,
  location: { select: { id: true, name: true } },   // ← el OBJETO ubicación
}                                                    // ← NO `locationId`
```

Y el recorrido del árbol de planta arranca justo por ahí:

```ts
let actual = activo.locationId ? porId.get(activo.locationId) : undefined;
```

**`locationId` llegaba `undefined`.** El recorrido no arrancaba, no había
`trenCode`, y el filtro por tren descartaba **todas** las cámaras:

```ts
const suyo = (ctx[c.id]?.trenCode || '').toUpperCase();   // → ''
if (!suyo.includes(trenCode.toUpperCase())) return false; // → descarta TODO
```

### `select` no es `include`, y ahí estaba la diferencia entera

> **`include:` trae TODOS los campos del modelo. `select:` trae SÓLO los que
> pides.**

«Por tren» funcionaba porque su consulta usa `include:`. «Mis cámaras» usa
`select:` y se dejó una clave foránea. **Esa es toda la explicación de por qué
una pantalla ve dos cámaras y la otra ninguna.**

---

## 3 · Por qué no lo cazó absolutamente nada

Porque el tipo decía que se podía:

```ts
interface ActivoLike {
  id: string;
  criticality?: string | null;
  locationId?: string | null;     // ← OPCIONAL
}
```

Con esa interrogación, **omitir `locationId` no era un error: era exactamente
lo que el tipo permitía.** Compilaba, pasaba el lint, pasaban las 1.263 pruebas
y pasaban los 19 verificadores.

> **El campo del que depende TODO ese cálculo estaba declarado como
> prescindible.** Eso no es un descuido de quien escribió la consulta: es que
> el tipo decía que se podía.

Y encima había una segunda capa de silencio: **19 de las 30 llamadas pasaban su
lista con `as any`**, que apaga la comprobación entera aunque el tipo fuera
correcto.

---

## 4 · El arreglo va en el TIPO, no en la consulta

Parchear `camaras-caidas` habría cerrado ESTA pantalla y dejado el mecanismo
intacto para la siguiente. Así que:

### 4.1 · `locationId` pasa a OBLIGATORIO

```ts
locationId: string | null;      // sin interrogación
```

`null` **sí** se acepta —un activo en STOCK no cuelga de ninguna ubicación y
eso es legítimo—. Lo que deja de aceptarse es **no decir nada**, que es lo que
confundía «este activo no tiene sitio» con «no se preguntó».

### 4.2 · Fuera los `as any`

**Diecinueve**, quitados. Son los que tenían al compilador callado.

### 4.3 · Y entonces el compilador dijo la verdad

```
1 error: src/modules/dashboard/camaras-caidas.service.ts
  Argument of type '{ location: {...}; id: string; ... }[]'
  is not assignable to parameter of type 'ActivoLike[]'.
```

**UNA.** Sólo una consulta estaba realmente rota.

---

## 5 · Mi barrido decía 22. El compilador dijo 1.

Antes de tocar nada hice un barrido de texto: «consultas con `select:` que
alimentan el árbol y no piden `locationId`». Dio **22 candidatas**.

Al hacer el campo obligatorio y quitar los `as any`, **el compilador encontró
UNA**. Las otras 21 eran ruido: consultas del mismo archivo que no alimentan
ese cálculo.

> **Cuando existe una herramienta exacta, escribir una aproximada al lado no
> añade seguridad: añade falsos positivos.** Y un verificador que grita cuando
> no pasa nada se ignora a la semana.

**Es la decimocuarta vez que un patrón de texto mío lee otra cosa.** La
diferencia esta vez es que en lugar de afinar el barrido, se usó la herramienta
que no se equivoca.

---

## 6 · Verificador 20 · `verificar:contexto`

Y por eso **este verificador es deliberadamente pequeño.** No vuelve a
comprobar los `select` —eso ya lo hace TypeScript, mejor—. Sólo protege **lo
único que TypeScript no puede ver: que alguien lo apague.**

Tres comprobaciones:

1. `ActivoLike.locationId` sigue **sin interrogación**. Devolvérsela reabre el
   bug entero y no rompe nada al hacerlo.
2. **Ninguna llamada pasa su lista con `as any`.** Había diecinueve.
3. El recorrido **sigue arrancando en `activo.locationId`**. Si alguien lo
   cambia, este verificador deja de tener sentido y avisa en vez de dar verde
   sobre algo que ya no existe (bloque 74).

Los `.catch(() => ({} as any))` que quedan **no son falsos positivos**: la
comprobación mira el ARGUMENTO, no lo que va después del paréntesis. Tres de
ésos siguen ahí y son legítimos.

**Probado reintroduciendo el fallo en las tres direcciones**, y con `diff -r`
para comprobar que `src/` vuelve idéntico.

---

## 7 · Las pruebas reproducen el bug del usuario

Siete. Las cuatro primeras son de comportamiento y **reproducen la cadena
entera**:

- con `locationId` → encuentra el tren
- si la cámara cuelga **directamente del tren** → también (es el caso real de
  la planta: en la captura los activos salen bajo un nodo con el nombre del
  tren)
- **sin `locationId` → no hay tren** ← el bug
- **y con el tren a `null`, el filtro descarta la cámara** ← la consecuencia
  exacta, con el filtro copiado tal cual del servicio

Las tres últimas leen el código: el tipo sin interrogación, la consulta con
`locationId: true`, y cero `as any`.

**Probado reintroduciendo el bug exacto del usuario** —quitando el
`locationId: true`—: la prueba se cae señalándolo.

---

## 8 · Dos tropiezos míos en este bloque

### 8.1 · Restauré el respaldo equivocado y deshice mi propio arreglo

Guardé la copia de `src/` **antes** de arreglar, y al probar el verificador
restauré esa copia — que borró el arreglo. Lo vi porque la comprobación «con
todo puesto» salió en rojo.

**Regla: el respaldo para probar un verificador se hace DESPUÉS del arreglo, no
antes.** Si no, cada prueba deshace el trabajo.

### 8.2 · Mi propia prueba se ancló en un texto que no era único

```ts
svc.slice(svc.indexOf('asset.findMany'), svc.indexOf('computeEffectiveStatuses'))
```

Devolvía **cadena vacía**: `computeEffectiveStatuses` aparece antes, en la
línea del `import`. La prueba se caía señalando un import.

Es literalmente la regla del bloque 77 —*«antes de anclar, comprobar que el
ancla es ÚNICA»*— aplicada a una prueba en vez de a una edición. Corregido a
buscar **desde** la consulta hacia adelante.

### Y un `as any` que mi expresión no cazó

`[asset as any]` —con corchetes— se escapó de la sustitución automática. Lo
cazó el propio verificador en su primera ejecución. **El verificador se probó a
sí mismo antes de que yo terminara de arreglar.**

---

## 9 · Lo del Jefe de Tren: NO es un bug

El usuario preguntó también por qué, siendo admin, ve los tres trenes.

**El ámbito no viene del rol: va por USUARIO**, en la pantalla de Usuarios. Un
«Jefe de Tren» recién creado **no tiene tren asignado**, y el ámbito vacío
significa toda la planta.

Y el código está bien: el filtro se aplica **en el servidor**, no en la
pantalla —

```ts
if (noVeNada(ambito)) return this.vacio(trenCode, ambito.motivo);
if (!alcanza(ambito, trenCode)) return this.vacio(trenCode, 'Ese tren no está en tu ámbito.');
```

— así que un jefe del Tren 2 que escriba `T1` en la barra de direcciones no ve
el Tren 1. Está probado desde el bloque 42.

**Lo que falta es entrar a Usuarios y asignarle su tren.** Que como admin veas
los tres es correcto.

**Lo que sí es un defecto, y queda anotado:** la pantalla de Usuarios **no
avisa** de que un usuario sin tren asignado ve la planta entera. No se cierra
aquí porque toca el frontend y este bloque es de backend; se declara.

---

## 10 · Cadena de verificación

| | Resultado |
|---|---|
| `typecheck` | verde |
| Los **20** verificadores del backend | verde |
| Pruebas | **1.270 en verde** (1.263 + 7 nuevas) |
| `build` | verde |
| Migraciones | **ninguna** |
| Frontend | **sin tocar** |

---

## 11 · Lo que este bloque demuestra

Este bug sobrevivió a **1.263 pruebas, 19 verificadores, cinco auditorías y
siete recorridos de Playwright**. Ninguna herramienta que lee código podía
verlo: la consulta era válida, el servicio correcto, el tipo lo permitía.

**Sólo se ve abriendo las dos pantallas y comparando lo que dicen.**

Es la cuarta vez que un fallo real sale así —la OM sin fecha (b88), el desborde
del teléfono (b89), la pantalla de Roles que no guardaba (b90) y ahora ésta— y
las cuatro veces la regla es la misma, escrita en este proyecto desde el bloque
64:

> **Pasar el typecheck no es que funcione.**

Con una vuelta de tuerca nueva, que es lo que aporta este bloque:

> **Y un tipo que declara opcional lo que es imprescindible convierte el
> typecheck en una firma en blanco.**
