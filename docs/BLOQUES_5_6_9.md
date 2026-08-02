# Bloques 5, 6 y 9 — qué hay ya y qué falta de verdad

Revisado contra el código, no contra el plan. En los tres pasa lo mismo que
pasó con el 7: **hay más hecho de lo que dice el papel**, y lo que falta es
menos de lo que parece.

---

# Bloque 5 · QR

## Lo que YA funciona

- **QR del activo**: `GET /assets/:id/qr` devuelve el PNG.
- **Hoja de etiquetas**: `GET /assets/qr/sheet` para imprimir en tanda.
- **La pantalla del escaneo**: `/a/:id` — ficha rápida pensada para el
  celular, con la ruta de acceso, el estado y el botón de reportar.
- **El acceso respeta el destino**: si escaneas sin sesión, entras y te lleva
  directo a la ficha, no al tablero. Eso ya está y funciona.

## Lo que falta

### 5a · QR del gabinete
El activo tiene QR; el gabinete no. **Y el gabinete es lo que se ve al
llegar**: el técnico se planta delante de un armario cerrado, no delante de
una cámara. Lo que necesita ahí es *"qué hay dentro de esto y qué le pasa"*.

Falta:
- `GET /cabinets/:id/qr` (el mismo generador que ya existe, otra entidad).
- Pantalla `/g/:id`: qué activos cuelgan del gabinete, cuáles están caídos,
  la foto, y las órdenes abiertas de cualquiera de ellos.
- La hoja de etiquetas, con el rótulo grande — se lee a dos metros y con
  poca luz.

*Media sesión. No depende de nada.*

### 5b · Que el QR sirva para trabajar, no sólo para mirar
Hoy el QR informa. Podría **abrir una OM en dos toques** con el equipo ya
puesto, o registrar una lectura de rutina sin buscar nada.

Es lo que de verdad ahorra tiempo en campo: la diferencia entre "consulto" y
"resuelvo sin sacar el guante".

*Media sesión. Depende de 5a sólo por orden, no por técnica.*

---

# Bloque 6 · Mapa de canales del NVR

## Lo que YA existe en el modelo

    AssetNvr.channels        cuántos canales tiene el grabador
    AssetCamera.nvrId        a qué NVR va la cámara
    AssetCamera.nvrChannel   en qué canal
    AssetCamera.nvrName      nombre del NVR (dato viejo, por texto)

**Los datos están.** Y el tablero de infraestructura ya cuenta canales
ocupados y libres por tren (`contarCanales` en `infra-agregados.ts`, con sus
pruebas). Lo que no hay es dónde verlo ni dónde tocarlo.

## Lo que falta

### 6a · La rejilla del NVR
Una pantalla por grabador: **16 o 32 casillas**, cada una con su cámara o
vacía. Se ve de un vistazo qué queda libre.

Hoy, para saber si cabe una cámara más hay que abrir cámara por cámara y
anotar los canales a mano. Es exactamente el tipo de cuenta que la gente hace
mal y luego descubre en planta, con la escalera puesta.

Falta:
- `GET /assets/nvr/:id/canales` — la rejilla armada.
- Pantalla con las casillas, y **arrastrar para reasignar** (o al menos
  elegir de una lista).
- Aviso de **canal duplicado**: dos cámaras en el mismo canal es un dato
  imposible que hoy nadie detecta.

### 6b · Limpiar el vínculo por NOMBRE
`nvrName` es texto libre. Una cámara con `"NVR Tren 2"` y otra con
`"NVR-T2"` apuntan al mismo grabador y el sistema no lo sabe. El bloque 7
(topología) ya sufre esto: enlaza por nombre y avisa de que es flojo.

Falta: migración que rellene `nvrId` a partir de `nvrName` donde se pueda,
y una pantalla que enseñe **las que no se pudieron casar** para resolverlas
a mano. No se adivina ninguna: se listan.

*Una sesión los dos. **6b conviene hacerlo primero**: sin él, la rejilla
enseñaría cámaras colgando del NVR equivocado.*

---

# Bloque 9 · Campañas de mapeo

## Lo que YA existe

- **Avance del mapeo medido de verdad**: `avanceMapeo()` sabe qué activos
  están completos por tipo y por tren, y tiene su pantalla.
- **`Asset.isDraft`**: un activo empezado y sin terminar.
- **`Asset.mappedInWorkOrderId`**: qué OM lo levantó.
- **`coberturaCampana()`** en almacén: dada una lista de materiales, dice si
  hay stock para la campaña.

O sea: **ya se sabe cuánto falta y quién levantó qué.** Lo que no hay es cómo
repartirlo.

## Lo que falta — y es lo que pidió el ingeniero

Su frase fue: *"tengo estas 1000 actividades, hazlas tú, ve cómo las
registras"*. Eso es una **campaña**.

### 9a · La campaña como objeto
Una tabla `Campana`: nombre, ámbito (tren, etapa, zona), qué hay que hacer,
fechas, y a quién se le asigna — que puede ser una **empresa contratista**,
no una persona.

Y su lista de puntos: cada uno es un activo a levantar o revisar, con su
estado (pendiente / en curso / hecho / no aplica).

### 9b · Repartir y seguir
- Asignar un lote a un contratista o a un técnico.
- Que cada uno **vea sólo lo suyo** — esto se apoya en el ámbito de 4C, que
  ya existe.
- Avance en vivo: cuántos van, cuántos faltan, quién va atrasado.

### 9c · Cerrar la campaña
No se cierra hasta que **cada punto tiene un estado**. Un "no aplica" es una
respuesta válida; dejarlo en blanco, no. Es la misma regla que ya usa la
rutina preventiva (3F-2), y evita el final típico: *"quedó al 94%"* sin que
nadie sepa qué es ese 6%.

*Dos sesiones. Es el bloque más grande que queda, y el que más se parece a
cómo quiere trabajar el ingeniero.*

---

# En qué orden, y por qué

| | Bloque | Por qué ahí |
|---|---|---|
| 1 | **6b** vínculo NVR | Barato, y sin él la rejilla enseña datos falsos |
| 2 | **6a** rejilla de canales | Responde una pregunta que hoy se contesta a mano y mal |
| 3 | **5a** QR de gabinete | Media sesión, se nota el primer día en campo |
| 4 | **9a-9c** campañas | El más grande, y el modelo de trabajo que quiere el ingeniero |
| 5 | **5b** QR que abre OM | Encima de 5a, cuando el QR ya esté en uso |

**6b antes que 6a** es lo importante de esta lista. Construir la rejilla sobre
un vínculo por texto libre sería enseñar con mucha precisión algo que está
mal — y eso es peor que no enseñarlo.
