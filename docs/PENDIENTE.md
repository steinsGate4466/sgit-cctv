# SGIT-CCTV · Qué queda pendiente

**Aceros Arequipa — Planta Pisco · LAMINACIÓN**
Recuento del 26 de agosto de 2026, medido sobre el código, no de memoria.

---

## Dónde estamos

| | |
|---|---|
| Backend | 40 módulos · **334 endpoints** · 36 607 líneas |
| Frontend | **52 pantallas** · 27 956 líneas |
| Base de datos | 73 modelos · **44 migraciones** |
| Pruebas | **738** en verde |
| Verificadores | 11 de backend · **15** de frontend |
| Despliegue | Railway (backend + Postgres + MinIO + frontend), continuo desde GitHub |

El software **funciona y está en producción**. Lo que sigue no es «lo que falta
para que arranque», es lo que falta para que sea un CMMS completo y para que
aguante una auditoría.

---

## 🔴 URGENTE — antes que nada

### S-01 · El `JWT_SECRET` filtrado sigue sin rotar

Con ese secreto **se puede firmar un token con permisos de administrador**. No
hace falta usuario ni contraseña: se entra como Jefe de Mantenimiento y se
tiene todo.

**Es tarea del usuario**, no mía: se genera uno nuevo y se pega en la variable
de Railway. Ningún secreto pasa por el chat.

> Mientras esto siga abierto, todo lo demás de esta lista es secundario.

---

## 🟠 EL CICLO DEL INGENIERO — lo que él va a buscar

De su hoja escrita a mano. Cinco pasos, y **faltan los pasos 2, 3 y parte del 4**.

| # | Qué falta | Por qué duele |
|---|---|---|
| 1 | **Criticidad ABC con método** | Hoy la criticidad se deduce del árbol de planta. Él la quiere por matriz, y el **ABC decide la frecuencia** del preventivo (A→1, B→2, C→3). Sin esto su paso ② no existe |
| 2 | **Hojas de Ruta** | Son las *task lists* de SAP PM: los pasos, el tiempo y los repuestos de cada trabajo tipo. No hay entidad. Es su paso ③ |
| 3 | **Programación** | Casar hoja de ruta + frecuencia + ventana de parada para que las órdenes salgan solas. Hoy se crean a mano |
| 4 | **`FailureEvent` aparte de la orden** | Sin el evento de falla con sus marcas de tiempo, **MTBF y MTTR son aproximaciones**. Es lo primero que un ingeniero de mantenimiento va a picar |
| 5 | **Nivel de servicio** y **cumplimiento normativo** | Dos de sus cuatro indicadores. No están |
| 6 | **Nombres ISA-95** | Él ya rotula con ISA. El sistema usa nombres propios para los mismos niveles |

**Recomendación de orden: 4 → 1 → 2 → 3 → 5.** El `FailureEvent` primero
porque sin él los indicadores que ya se pintan siguen siendo estimaciones, y
eso es lo más fácil de rebatir en una exposición.

---

## 🟠 FUNCIONES PROMETIDAS Y NO ESCRITAS

| | Estado |
|---|---|
| **Correo: código de verificación al entrar** | Está en la presentación. **Cero líneas escritas** |
| **Correo: aviso al registrar un usuario** | Está en la presentación. **Cero líneas escritas** |
| **Módulo de documentos** | Existe el modelo, existen 3 endpoints y existen los permisos `document.read` y `document.manage`. **No hay pantalla que los use** |
| **Integración con SAP** | Hoy el código SAP se escribe a mano en la orden. No hay puente automático |

> Si el ingeniero pregunta mañana por lo del correo, **hay que decirle que está
> pendiente**. Está en el PPT y no existe.

---

## 🟡 DEUDA TÉCNICA MEDIDA

| | Cuántos | Qué significa |
|---|---|---|
| **`catch` que se tragan el fallo** | **110** | Convierten un error en «no hay datos». El aviso central de `api/client.ts` lo compensa desde el bloque 66, pero la deuda sigue |
| **`@Body() dto: any`** | **46** | Sin clase DTO no hay validación: el `ValidationPipe` no tiene metadatos que mirar. Es el hallazgo **S-05** |
| **Pantallas que pueden dar 403 al abrir** | **9** | Ver detalle abajo |
| **Acciones que guardan sin confirmar nada** | ~21 | Se pulsa y no pasa nada visible. Es lo que hace decir «el software no funciona» |

### Las 9 pantallas con lecturas que pueden dar 403

| Pantalla | La llamada que falla | Exige |
|---|---|---|
| Ubicaciones | `GET /locations/stages/trenes` | `location.read` |
| Equipos conocidos | `GET /acceso-dispositivos/resumen` | `user.manage` |
| Electricidad | `GET /assets` | `asset.read` |
| Dashboard | `GET /troubleshooting/metrics` · `GET /network/criticos` | `troubleshooting.read` · `red.read` |
| Limpieza | `GET /purga/resumen-om` · `GET /purga/operativos` | `wo.approve` · `asset.read` |

**Y una más, que descubrí y no está arreglada:** el **QR imprimible**
(`/assets/:id/qr` y `/assets/qr/sheet`) sigue exigiendo `asset.read`. Un Jefe
de Tren o un Jefe de línea **no puede imprimir la etiqueta de su propio
equipo**. Es el mismo agujero del bloque 68, que cerré para la ficha y no para
el QR.

### Seguridad, el resto

| | Riesgo | Estado |
|---|---|---|
| **S-03** | Sin límite de peticiones fuera de login/usuarios/monitoreo. `/exportacion/todo` y `/assets/qr/sheet` **construyen el archivo entero en memoria** | 🟠 Abierto |
| **S-05** | 46 `@Body() dto: any` | 🟡 Abierto |
| **S-06** | La CI no revisa dependencias | 🟡 Abierto |
| **S-07** | Falta cabecera CSP | 🟡 Abierto |
| **S-04** | Al desactivar un usuario, su token vive hasta 15 min | 🟡 Conocido y aceptado |

---

## 🟡 CÓMO SE PRUEBA — el hueco de método

**Las 738 pruebas NO ABREN EL SOFTWARE.** Comprueban que el código está bien
escrito; ninguna comprueba que funcione. Eso ya costó una exposición con
cuatro fallos de bulto, y lo de la semana pasada con el desmarcado de los
motivos es lo mismo.

**Falta Playwright**: recorridos que abran el navegador de verdad y hagan el
camino completo — entrar, escanear un QR, reportar, convertir en orden,
cerrarla. Sin esto, esta lista se vuelve a llenar sola.

**Y la restauración del respaldo NUNCA se ha probado.** Hay copia; no hay
prueba de que se pueda volver de ella.

---

## 🟢 LO QUE SÍ ESTÁ CERRADO

Para que no se busque dos veces:

- Árbol de planta, activos, gabinetes, zonas y su criticidad
- Incidencias con catálogo, varios motivos y las dos fechas (cuándo se avisó y
  cuándo se cayó)
- Órdenes: apertura, avance, materiales, cierre firmado, informe en PDF
- Preventivo, correctivo, predictivo y mejoras
- Almacén con retiro contra orden y carga desde el Excel de SAP
- Ventanas de parada, con hora prevista y real por separado
- Mapa de red, direccionamiento IP, electricidad, cableado, grabadores
- QR de campo: aviso de intervención, avance, reportar, abrir orden
- Bandeja por persona, con quién reportó y las mejoras de los técnicos
- Roles y permisos por capacidad, ámbito por tren, auditoría y purga
- Menú agrupado por oficio, con verificador que impide que se caiga una entrada

---

## Lo primero que yo haría, en orden

1. **Rotar el `JWT_SECRET`** (tuyo, 5 minutos, y es lo único rojo).
2. **Abrir el QR imprimible** a `activos.mirar` — es un `@RequireAlguno` y
   cierra el último resto del bug del bloque 68.
3. **`FailureEvent`** — desbloquea MTBF y MTTR de verdad.
4. **Criticidad ABC** — es lo que se ve en la hoja del ingeniero.
5. **Playwright** — o todo lo anterior se repite.

Lo de **correo** lo pondría después de la próxima exposición, salvo que el
ingeniero lo pregunte: es visible en la presentación pero no bloquea a nadie
para trabajar.
