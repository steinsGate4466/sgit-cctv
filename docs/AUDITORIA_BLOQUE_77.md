# Auditoría del software — 30 de agosto de 2026

**SGIT-CCTV · Aceros Arequipa, Planta Pisco · LAMINACIÓN**

Todo lo de aquí está **medido sobre el código**, no recordado. Cada barrido
está descrito para que se pueda repetir.

---

## 1. Dónde estamos, en números

| | |
|---|---|
| Backend | **348 endpoints** · 77 modelos · 49 migraciones |
| Frontend | **54 pantallas** · 51 entradas de menú, ninguna huérfana |
| Pruebas | **1.037** en verde |
| Verificadores | 12 de backend · 15 de frontend |
| Despliegue | Railway, continuo desde GitHub |

**El software funciona y está en producción.** Lo que sigue no es «lo que falta
para que arranque».

---

## 2. Los cuatro barridos, y qué buscaba cada uno

### Barrido A — código construido que nadie puede usar

Es el error que este proyecto tiene escrito **cinco veces**: *modelo + endpoint
≠ función. Sin pantalla, no existe.* Se buscó de dos formas:

**A1. Archivos que sólo importa su propia prueba.**
Un archivo así compila, pasa el lint y pasa las pruebas — y no está enchufado a
nada. Es exactamente lo que pasó con la criticidad A/B/C: 26 pruebas en verde,
tres bloques muerto.

> **1 hallazgo:** `backend/src/common/colores-de-cable.ts`, 226 líneas, **nadie
> lo importa**, ni siquiera una prueba. Decide el color de la chaqueta del
> cable según lo que lleva dentro, y no hay pantalla que lo pinte.

**A2. Endpoints que el frontend no llama nunca.**
348 endpoints comparados contra todo el código del frontend, normalizando las
tres formas de escribir una ruta (literal, plantilla y concatenación).

*Nota de método: la primera versión dio 70 resultados y la mitad eran falsos
positivos —el frontend construye las rutas concatenando: `'/assets/' + id +
'/status'`—. Se normalizó y bajó a 43. De esos, la mayoría son legítimos
(`/health` lo llama Railway; el agente de monitoreo no es el navegador; las
exportaciones se construyen con una clave dinámica).*

**Huecos reales — endpoint escrito, sin puerta de entrada:**

| Endpoint | Qué no se puede hacer |
|---|---|
| `DELETE /ipam/reservas/:id` | **Reservar una IP y no poder soltarla.** Si te equivocas, esa IP queda ocupada para siempre |
| `PATCH /instalaciones/:id/cancelar` | Cancelar una instalación que ya no se va a hacer |
| `POST /paradas/:id/orden` | Abrir la orden desde la ventana de parada, que es donde se decide |
| `GET /cabinets/:id/qr` | Imprimir el QR de UN gabinete (la hoja de todos sí se puede) |
| `GET /electricidad/activo/:assetId`<br>`GET /electricidad/tableros/:id/impacto` | «Qué se apaga si salta esta llave» |
| `GET /gruas/historial/:assetId` | El historial de una cámara de grúa |
| `POST /inventory/cobertura` | |
| `GET /dashboard/kpis`, `/overview`, `/root-causes` | Tres endpoints del tablero |

**Y dos míos, del bloque 76 — 24 horas de vida:**
`PUT /criticidad/zona/:id` y `GET /criticidad/:id/intervalo`. **El primero es
grave**: la pantalla de Criticidad decía en su cabecera *«se declara la zona una
vez y se clasifican todas sus cámaras de golpe»* — una función que **no se podía
hacer**. Prometer en pantalla algo que no existe es peor que no tenerlo.
**Arreglado en esta entrega.**

### Barrido B — botones y formularios que se sienten rotos

**B1 · Botones apagados porque falta un dato: 5.** Los cinco están bien —
los tres de Limpieza son la fricción deliberada del bloque 15, y los otros dos
dicen en pantalla por qué (gabinete *o* tablero, no los dos).

**B2 · Escrituras que no confirman nada: 29 candidatos.** Revisados uno a uno,
**cuatro son bugs reales** y los cuatro comparten patrón: `.catch(() => {})`.

**B3 · `catch` que convierten un fallo en «no hay datos»: 115 en 38 archivos.**
Ha subido de 110. Es deuda declarada.

### Barrido C — bugs visuales

- Listas sin `key`: **0**.
- Anchos fijos que se salgan de 1366 px: **0** (los tres que salieron son
  puntos de corte de media query, correctos).
- Tablas de 8+ columnas: **11**. No rompen —hay `overflow-x`— pero en la
  pantalla del púlpito hay que desplazar de lado. Riesgo, ya conocido.
- **8 campos con `aria-label="&nbsp;"`**: una etiqueta que no dice NADA, puesta
  para callar a un verificador. **Arreglado.**
- **Una etiqueta que mentía**: el desplegable de *gabinete* llevaba
  `aria-label="Elegir tablero eléctrico"`. **Arreglado.**

### Barrido D — pantallas que pueden salir vacías por permisos

Se comparó el permiso con el que se abre cada pantalla contra el que exige cada
llamada que hace al cargar: **0 hallazgos automáticos**.

Pero el que ya se conocía **sigue abierto y se ha arreglado ahora**: el **QR
imprimible** exigía sólo `asset.read`. Un Jefe de Tren no podía imprimir la
etiqueta de su propio equipo — el bloque 68 abrió la ficha y se dejó la
etiqueta, que es lo que hay que pegar para que la ficha se pueda escanear.

---

## 3. Los bugs arreglados en esta entrega

### 🔴 Tres escrituras que fallaban EN SILENCIO

Las tres tenían `.catch(() => {})`: si la operación fallaba, no pasaba nada
visible.

**1. La contraseña del equipo se podía perder.** `Assets.tsx`
Al dar de alta un activo con contraseña, si el guardado fallaba el activo se
creaba igual, la pantalla decía «guardado», y **la contraseña no estaba en
ningún sitio**. Nadie se enteraba hasta que alguien iba a conectarse a la
cámara, semanas después.
→ Ahora se avisa, y se dice que **el alta no hay que repetirla**: sólo volver a
poner la contraseña desde la ficha.

**2. Borrar una credencial que no se borraba.** `Assets.tsx`
**El peor de los tres, y no es comodidad: es seguridad.** Alguien da de baja a
un contratista, borra sus accesos, el borrado falla, y la contraseña sigue
guardada creyendo todos que no.
→ Ahora dice, en mayúsculas, **«LA CREDENCIAL SIGUE GUARDADA»**.

**3. Borrar una foto que no se borraba.** `Assets.tsx`
Se recargaba la lista y la foto seguía ahí. Se pulsa, sigue; se vuelve a
pulsar, sigue. Y se concluye —con razón— que el software no funciona.

**4. Desvincular un repuesto que no se desvinculaba.** `Inventory.tsx`
Mismo patrón. Lo llamativo: el botón de *vincular*, justo encima, **sí** avisaba.

### 🟠 La etiqueta que no dice nada

`<Campo>` ponía el `<label>` **al lado** del campo, no envolviéndolo, así que
el navegador no los asociaba. Dos consecuencias:

- Tocar la etiqueta no enfocaba el campo. **Con guantes eso es la diferencia
  entre rellenarlo y no.**
- El verificador se quejaba con razón, y en ocho campos alguien lo calló con
  `aria-label="&nbsp;"`.

> **Callar un verificador en vez de arreglar lo que señala es la peor de las
> tres opciones.**

Arreglado **en el componente**, no campo por campo: el `<label>` ahora envuelve
al control y los ocho `aria-label` postizos se han borrado. Y se le enseñó al
verificador a reconocer `<Campo>`, exigiendo que traiga su `etiqueta=`.

*El primer intento del verificador NO cazaba el fallo: miraba una ventana de
400 caracteres y se comía el `<Campo>` siguiente encontrando SU etiqueta.
Probado reintroduciendo el fallo, corregido, y vuelto a probar.*

### 🟠 El QR imprimible, cerrado para quien lo necesita

`/assets/:id/qr` y `/assets/qr/sheet` pasan a `@RequireAlguno('asset.read',
'activos.mirar')`. El ámbito por tren sigue puesto.

### 🟠 Declarar el riesgo por zona — la función que yo prometí y no existía

Ubicaciones → una zona → **«Seguridad de las personas»**. Se declara una vez y
**todas las cámaras de esa zona pasan a criticidad A**. Sin esto había que ir
cámara por cámara: cuatrocientas veces el mismo dato.

Tres estados, no dos: **sí / no / sin declarar**. Con un booleano, «sin
declarar» y «no» serían el mismo valor y un sitio peligroso sin revisar
parecería seguro.

---

## 4. Cómo probarlo — guion paso a paso

**Lo importante: esto NO lo cubren mis 1.037 pruebas.** Ellas comprueban que el
código está bien escrito. Ninguna abre el software.

### Antes de empezar

1. Entrar con el usuario de **Jefe de Mantenimiento**.
2. Tener a mano un segundo usuario de **Jefe de Tren** y otro de **Operador de
   Púlpito**. Si no existen: Sistema → Usuarios.
3. **Al cambiar un permiso hay que cerrar sesión y volver a entrar.** Los
   permisos viajan dentro del token. Explica el 90 % de los «no me sale el menú».

### PRUEBA 1 · Criticidad A/B/C — lo nuevo

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 1.1 | Menú → Gestión → **Criticidad A/B/C** | Cuatro tarjetas con el reparto y una tabla |
| 1.2 | Mirar arriba | Si hay pendientes, aviso ámbar diciendo cuántos |
| 1.3 | Pulsar la tarjeta **«Sin clasificar»** | La tabla se filtra a los pendientes |
| 1.4 | Volver a pulsarla | Se quita el filtro |
| 1.5 | Escribir 3 letras de un código en el buscador | **Busca solo**, sin pulsar nada, tras medio segundo |
| 1.6 | Escribir **una** sola letra | **NO busca.** Con una letra devolvería media base |
| 1.7 | Borrarlo del todo | Sí busca: es «quítame el filtro» |
| 1.8 | **Ajustar los números** → poner corte de A **menor** que el de B → Guardar | **Error claro**, y el formulario NO se cierra |
| 1.9 | Corregirlo → Guardar | Mensaje verde y las letras se recalculan |
| 1.10 | Pulsar **Abrir equipo** en una fila | Va a la **ficha de ESE equipo**, no a una lista |

### PRUEBA 2 · La criticidad en la ficha del activo

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 2.1 | Activos → abrir cualquiera | Arriba del todo, la caja con la **letra** |
| 2.2 | Leer el «por qué» | Debe explicarlo aunque salga C |
| 2.3 | **Declarar impacto y riesgo** → marcar «Hay que parar la línea» | La letra se **recalcula sola**, sin recargar |
| 2.4 | Marcar riesgo para personas = **Sí** | Pasa a **A** y dice «es A por SEGURIDAD» |
| 2.5 | **Volver a lo que dice la zona** | Vuelve a heredar. Esto es lo que se rompe si `null` se trata mal |
| 2.6 | Abrir un **switch** con cámaras enchufadas | Dice «hereda la letra de los N equipos que dependen de él» |

### PRUEBA 3 · Declarar por zona — la vía rápida

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 3.1 | Ubicaciones → una zona → editar | Sección **«Seguridad de las personas»** |
| 3.2 | Marcar **Sí** y dejar el motivo vacío → Guardar | El botón **se puede pulsar** y dice qué falta |
| 3.3 | Escribir el motivo → Guardar | Guarda |
| 3.4 | Ir a Criticidad | **Todas las cámaras de esa zona en A** |

### PRUEBA 4 · Los tres bugs de silencio (lo más importante)

Estos hay que provocarlos. **Corta la red (modo avión / desconecta el WiFi) justo
antes de pulsar.**

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 4.1 | Ficha de un activo → borrar una credencial → cortar red → confirmar | Aviso: **«LA CREDENCIAL SIGUE GUARDADA»**. Antes: silencio |
| 4.2 | Borrar una foto con la red cortada | Aviso claro. Antes: la foto seguía ahí sin explicación |
| 4.3 | Alta de activo con contraseña, red cortada al enviar | Debe decir que el activo se registró pero **la contraseña no** |
| 4.4 | Almacén → un repuesto → quitar un equipo vinculado, red cortada | Aviso |

### PRUEBA 5 · Etiquetas y campos (con el móvil, mejor)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 5.1 | Ubicaciones → editar zona → **tocar el TEXTO** «Qué se ve desde aquí» | El cursor salta al campo. Esto antes **no pasaba** |
| 5.2 | Repetir en tres campos más | Igual |
| 5.3 | Abrir un campo de **fecha** en el móvil | Debe caber en su caja, sin desbordar ni hacer zoom |

### PRUEBA 6 · El QR (esto va a planta)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.1 | Entrar como **Jefe de Tren** | |
| 6.2 | Activos → **descargar el QR** de un equipo suyo | Descarga. **Antes daba 403** |
| 6.3 | Escanear ese QR con el móvil | Abre la ficha de campo |
| 6.4 | Mirar lo primero de la pantalla | El aviso de **cómo se interviene la zona** |
| 6.5 | **Reportar incidencia** | Formulario con el equipo ya puesto |
| 6.6 | Marcar un motivo, **irse a escribir el detalle** | **La marca NO se cae.** Es el bug del bloque 70 |
| 6.7 | Marcar varios motivos | El primero lleva el número 1: es el principal |
| 6.8 | Enviar | Confirmación. **Nunca** se cierra en silencio |
| 6.9 | Ir a Incidencias | Ahí está, con fecha legible |
| 6.10 | Ir a Mi bandeja | Ahí está también, con **quién la reportó** |

### PRUEBA 7 · El ciclo completo (el que hay que enseñar al ingeniero)

1. Púlpito reporta una cámara caída (un botón, sin preguntas).
2. Jefe de Tren la ve en su bandeja **con nombre y hora**.
3. Abre una OM desde ahí → **con fecha, nunca vacía**.
4. El técnico anota avance desde el QR.
5. **Sólo el Jefe de Mantenimiento la cierra.**
6. La OM aparece en Órdenes y cuenta en los indicadores.

*Si algún paso se rompe, ése es el que hay que arreglar antes que nada: es el
ciclo que justifica el software entero.*

### PRUEBA 8 · Por rol — que nadie vea de más

| Entrar como | Tiene que ver | NO tiene que ver |
|---|---|---|
| Operador de Púlpito | Sus cámaras y el botón de reportar | Nada de infraestructura |
| Jefe de línea | Producción y su tren | Cableado, Electricidad, IP |
| Jefe de Tren | Lo suyo + criticidad de sus equipos | Otros trenes |
| Técnico | Sus órdenes, campo, QR | Cerrar órdenes |

**Y probar lo contrario:** que un Jefe del Tren 2 NO pueda abrir un equipo del
Tren 1 pegando su enlace. Debe salir **«no existe»** (404), no «no tienes
permiso» — un 403 confirmaría que el registro existe.

---

## 5. Lo que sigue faltando

### 🔴 Urgente — es tuyo, no mío

1. **Rotar el `JWT_SECRET`.** Con el filtrado se puede firmar un token de
   administrador **sin usuario ni contraseña**. Mientras siga abierto, todo lo
   demás es secundario.
2. **Rotar la contraseña de Postgres** en Railway (se pegó en el chat).
3. **Borrar el «Custom Start Command»** de Railway o el próximo despliegue falla.

### 🟠 El ciclo del ingeniero

| | Estado |
|---|---|
| ① Criticidad ABC | ✅ **Hecho** (bloques 76 y 77) |
| ② Hojas de ruta | ✅ **Hecho** (bloque 75) |
| ③ Programación automática | ❌ Casar hoja + frecuencia + ventana de parada |
| ④ Evento de falla aparte de la orden | ❌ **Sin esto, MTBF y MTTR son estimaciones** |
| ⑤ Nivel de servicio y cumplimiento normativo | ❌ Dos de sus cuatro indicadores |

### 🟠 Prometido en la presentación y no escrito

- Correo con código al entrar — **cero líneas**
- Correo al registrar usuario — **cero líneas**
- Módulo de documentos — modelo y permisos sí, pantalla no
- Puente con SAP — el código se escribe a mano

### 🟡 Deuda medida

- **115 `catch`** que convierten un fallo en «no hay datos», en 38 archivos
- **46 `@Body() dto: any`** — sin clase DTO no hay validación
- **11 tablas de 8+ columnas** — se desplazan de lado en la pantalla del púlpito
- `colores-de-cable.ts` — 226 líneas que nadie usa
- Restauración del respaldo **nunca probada**

### 🟡 El hueco de método, que es el que más caro sale

> **Mis 1.037 pruebas NO ABREN EL SOFTWARE.**

Es la cuarta vez que esto se escribe aquí, y las cuatro han costado algo: la
exposición con cuatro fallos, lo que encontró la desarrolladora en veinte
minutos, el desmarcado de los motivos, y la criticidad que llevaba tres bloques
muerta.

**Falta Playwright.** Un recorrido que abra el navegador de verdad y haga la
PRUEBA 7 de arriba sola, en cada entrega. Sin eso, esta lista se vuelve a
llenar.

---

## 6. Qué se verificó en esta entrega

- typecheck de los dos lados
- lint (0 errores, 2 avisos conocidos)
- **1.037 pruebas** en verde
- 12 verificadores de backend + 15 de frontend
- build del backend

**El build del frontend no se puede correr en el entorno del agente**:
`rolldown` necesita un binario nativo que no está ahí. Se dice tal cual y no se
escribe «build verde».
