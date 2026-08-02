# Auditoría de seguridad y calidad · 02/08/2026

Revisión completa del backend y del frontend. Lo que sigue está ordenado por
**riesgo real en esta planta**, no por la etiqueta que le pone la herramienta.

Resumen: **5 arreglados hoy**, 6 anotados con plan, y un repaso de las 25
alertas de dependencias separando las que importan de las que no.

---

## Lo que estaba bien

Conviene decirlo, porque marca dónde NO hay que gastar esfuerzo:

- **Sin secretos en el repositorio.** `.env` está en `.gitignore` y no hay
  contraseñas ni tokens escritos en el código.
- **Sin SQL sin parametrizar.** Cero usos de `$queryRawUnsafe`. Las consultas
  crudas que hay usan plantillas etiquetadas, que Prisma parametriza.
- **Sin XSS en el frontend.** Ni un `dangerouslySetInnerHTML`.
- **Validación global activa** con `whitelist` y `forbidNonWhitelisted`: un
  campo que no esté en el DTO se descarta en vez de colarse a la base.
- **Cabeceras de seguridad** puestas a mano en `main.ts`, sin depender de otra
  librería.
- **CORS falla en cerrado** en producción si falta `CORS_ORIGIN`.
- **Los 7 endpoints sin permiso declarado son correctos**: `login` y `refresh`
  son `@Public` por necesidad, y `/auth/me` y los tres del PIN sacan la
  identidad **del token**, nunca de la URL. No hay forma de tocar el PIN de
  otra persona.

---

## ARREGLADO HOY

### 1. El PIN se podía adivinar por fuerza bruta · **ALTO**

`POST /users/pin/verify` no tenía **ningún** freno. El PIN es corto a
propósito: sirve para reanudar una orden en campo con guantes sin teclear la
contraseña entera. Cuatro cifras son 10.000 combinaciones; un programa las
prueba todas en segundos y entra como ese técnico.

**Arreglo.** Freno por origen: 10 intentos por minuto, y 15 minutos de castigo
al pasarse. Eso convierte 10.000 combinaciones en más de **dieciséis horas**, y
sigue dejando trabajar a quien se equivoca dos veces con el guante puesto.

### 2. Se podía rociar el login desde una sola IP · **ALTO**

Había bloqueo por cuenta, pero ninguno por origen. Un intento en cada una de
cincuenta cuentas no dispara ningún bloqueo de cuenta y nadie se entera.

**Arreglo.** El mismo freno, con cupo más ancho (20 cada 5 minutos), en
`login` y en `refresh`.

> **Limitación, dicha clara:** el freno vive en memoria. Con una sola
> instancia en Railway funciona; el día que haya dos, cada una llevará su
> cuenta. La versión en base de datos está anotada como pendiente. No se hizo
> hoy porque una tabla nueva es una migración, y hoy ya hubo bastante base de
> datos.

### 3. Se podía subir un HTML disfrazado de foto · **ALTO**

Las tres pantallas que suben fotos limitaban el tamaño a 12 MB y nada más:

```ts
await this.storage.put(objeto, file.buffer, file.mimetype || 'image/jpeg');
//                                          ^^^^^^^^^^^^^ lo manda el navegador
```

Se podía subir un `.html` o un `.svg` con JavaScript dentro, declararlo como
imagen, y quedaba guardado y servido con ese tipo. Al abrir la foto del
gabinete, el navegador ejecuta ese código **con la sesión de quien la abre**.
Es un XSS almacenado, y quien lo dispara es el ingeniero revisando una
evidencia.

**Arreglo.** No se cree lo que el archivo *dice* ser: se miran sus primeros
bytes. Sólo pasan JPG, PNG y WEBP de verdad. Y la extensión con la que se
guarda sale del tipo **real**, nunca del nombre recibido — `foto.jpg.html` o un
nombre con `../` dentro ya no deciden dónde se escribe.

### 4. `JWT_SECRET` tenía un valor por defecto público · **ALTO**

```ts
process.env.JWT_SECRET || 'change_me_in_prod'
```

Si la variable faltaba en Railway, la aplicación arrancaba tan tranquila y
firmaba los tokens con un secreto **que está escrito en el repositorio**.
Cualquiera que leyera el código podía fabricarse un token de administrador
válido. Y no había ninguna señal: todo parecía funcionar.

**Arreglo.** Falla al arrancar en producción, igual que ya hacía CORS, con un
mensaje que dice qué poner. Es preferible un despliegue que no arranca —y se
ve— a uno que arranca abierto —y no se ve—.

### 5. Filtro de Prisma anidado (tablero en 400) · **MEDIO**

Documentado aparte en `INCIDENTES_Y_GUARDAS.md`. Guarda añadida:
`npm run verificar:filtros`.

---

## ANOTADO, CON PLAN

| # | Hallazgo | Riesgo | Plan |
|---|---|---|---|
| 6 | **El cierre de sesión no invalida el refresh token.** Un token robado sigue valiendo hasta caducar. | Medio | Tabla de tokens revocados. Va con el freno en base de datos: misma migración. |
| 7 | **64 `findMany` sin `take`.** Una consulta puede traerse la tabla entera: lentitud y memoria. | Medio | Límite por defecto en las listas grandes (activos, cableado, mapeo, auditoría). |
| 8 | **El token vive en `localStorage`.** Hoy no hay XSS, pero cualquiera futuro se lleva la sesión. | Medio | Cookie `HttpOnly` + `SameSite`. Toca el inicio de sesión entero: bloque propio. |
| 9 | **19 `@Body() dto: any`.** Con `any`, la validación global no valida nada: se acepta cualquier campo. | Medio | Un DTO por endpoint, empezando por los que escriben en la base. |
| 10 | **92 `catch(() => [])` en el frontend.** Un fallo del servidor se ve como "no hay datos". | Medio | Distinguir "vacío" de "falló" y enseñar el error. |
| 11 | **`: any` sobre filtros de Prisma** (5 restantes). Apaga la comprobación que habría cazado el 400. | Bajo | Se tipa cada uno al tocar su archivo. El verificador los lista. |

---

## Dependencias: 25 alertas, y cuáles importan

El número asusta y la mayoría no aplica. Separadas por dónde viven:

**Sólo en desarrollo — no llegan al servidor.** `@nestjs/cli`,
`@angular-devkit/*`, `webpack`, `glob` (la alerta es de su *interfaz de
línea de comandos*, que no usamos), `tmp`, `picomatch`, `js-yaml`. Se arreglan
con el salto a NestJS 11, que **no se hace a mitad de proyecto**: es un cambio
mayor y hoy no compra seguridad real.

**En el servidor, y sí importan:**

- **`multer` — 4 alertas ALTAS de denegación de servicio.** Es lo que recibe
  las fotos. Un archivo con nombres de campo muy anidados puede tumbar el
  proceso. **Mitigado en parte hoy**: el límite de 12 MB y el rechazo temprano
  por tipo cortan la mayoría. La actualización viene con NestJS 11.
- **`lodash` — inyección de código vía `_.template`.** No usamos `_.template`
  en ningún sitio. Verificado.
- **`body-parser`, `qs`, `@nestjs/core`** — denegación de servicio de bajo
  impacto detrás del proxy de Railway, que ya corta peticiones deformes.

**Recomendación:** el salto a NestJS 11 se planifica como bloque propio, con
su rama y sus pruebas, cuando el ritmo de funciones baje. Hacerlo hoy, entre
entregas diarias, es como se rompen los proyectos.

---

## Revisado después: MinIO · **sin problema**

Se comprobó lo que quedaba pendiente y **el riesgo no existe**:

- Las fotos **no se sirven desde MinIO**. Pasan por el backend
  (`getObject` → memoria → respuesta), así que van por la misma puerta que
  todo lo demás.
- **No hay URLs firmadas ni bucket público.** `makeBucket` crea el bucket
  privado y no se le aplica ninguna política de lectura.
- Las cinco rutas que devuelven una foto exigen permiso (`asset.read`,
  `access.read`, …) además del token.
- `X-Content-Type-Options: nosniff` ya estaba puesto, así que el navegador
  tampoco adivina tipos.

**Queda anotado, menor:** las rutas de foto no comprueban el ámbito. Un
usuario con `asset.read` acotado al Tren 2 puede pedir la foto de un equipo
del Tren 1 si conoce su identificador. No es un agujero abierto —hace falta
sesión y permiso— pero es incoherente con 4C. Va con el repaso de ámbito en
las rutas por identificador.

---

## Pruebas de control de acceso · **añadidas**

Eran el punto que más me preocupaba: cero pruebas sobre lo único cuyo fallo
**no se nota** — nadie llama para avisar de que ve cosas de más.

**23 pruebas nuevas**, en tres frentes:

1. **El guard** (`permisos.guard.spec.ts`). Que exige *todos* los permisos y
   no basta con uno; que rechaza si no hay usuario en la petición —aunque no
   debería llegar ahí, un fallo de seguridad no puede depender del orden de
   los guards—; que un permiso parecido no vale; y que el mensaje de error
   **no dice qué permiso falta**, porque a quien ataca eso le ahorra trabajo
   y a quien trabaja no le sirve.

2. **La cobertura** (`cobertura-permisos.spec.ts`). Recorre los controladores
   y comprueba que **los 85 endpoints que escriben** declaran permiso. Hoy
   pasan todos. Existe por el fallo típico, que no es escribir mal un permiso
   sino **olvidarlo**: se añade un endpoint, funciona en las pruebas manuales
   —quien prueba es administrador y lo puede todo— y queda abierto. Las
   cuatro excepciones (login, refresh y los dos del PIN) están listadas con
   su motivo escrito, y otra prueba comprueba que ese motivo existe y que el
   endpoint sigue existiendo, para que la lista no se llene de
   justificaciones muertas.

3. **Las plantillas de rol** (`plantillas-rol.spec.ts`). Son la puerta por
   donde entra todo: si una lleva de más un permiso peligroso, el error se
   replica en cada rol creado a partir de ella y nadie lo revisa porque
   "venía puesto". Se comprueba que **ninguna reparte credenciales de cámaras
   ni administración**, y que **el jefe de línea no puede tocar nada** — si
   algún día alguien le añade `wo.update` "para que cierre las suyas", la
   prueba se cae y obliga a decidirlo a propósito.

---

## Lo que NO se ha revisado todavía

Dicho para que no se lea esto como una garantía:

- No se ha hecho prueba de intrusión real contra el despliegue.
- No se ha revisado la configuración de red de Railway ni si la base de datos
  acepta conexiones desde fuera.
- No se ha revisado el ámbito en las rutas por identificador (ver arriba).
- La contraseña de Postgres y el `JWT_SECRET` mostrado en una captura
  **siguen pendientes de rotar**.
