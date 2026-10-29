# Recorridos que ABREN el software

> **Esto es lo que faltaba.** Está escrito tres veces en `CLAUDE.md`, y las tres
> veces después de una exposición que salió mal.

---

## Por qué existen

Las 1.152 pruebas de este proyecto comprueban que el código está **bien
escrito**. Ninguna comprueba que **funcione**.

Es el tercer escalón de una regla que ya estaba en el archivo:

```
verificar que la copia es fiel   ≠  que el original es correcto
compilar un archivo suelto       ≠  hacer el typecheck
pasar el typecheck               ≠  QUE FUNCIONE
```

Los ocho bugs de los bloques 64 y 67 —los cuatro de la exposición delante del
ingeniero y los cuatro que encontró una desarrolladora en veinte minutos— tenían
todos lo mismo en común:

- **Ninguno se ve leyendo el código con atención normal.**
- **Los ocho se ven abriendo la pantalla.**
- **Ninguno rompe nada**, así que pasan el typecheck, el lint y los 28
  verificadores.

---

## Cómo se corren

```powershell
cd C:\Users\CRISTHIAN\Desktop\sgit-cctv\frontend
```

```powershell
npm.cmd run e2e:instalar
```

*(una sola vez: descarga el navegador, unos 150 MB)*

Después, copia `.env.e2e.ejemplo` a `.env.e2e` y rellénalo. **Necesitas el
entorno local levantado**: base de datos, backend y frontend.

```powershell
npm.cmd run e2e
```

Y para verlos correr en una ventana, paso a paso:

```powershell
npm.cmd run e2e:ui
```

---

## NO corren contra producción. Nunca.

Estos recorridos **escriben**: crean incidencias y órdenes. Y esas órdenes
entran en el cálculo del nivel de servicio y del reparto
correctivo/preventivo — los números que el ingeniero lleva al comité.

> Una prueba que falsea el indicador que se usa para decidir el presupuesto es
> peor que no tener prueba.

Por eso la configuración **se niega a arrancar** si la URL no es local:

```
Estos recorridos ESCRIBEN en la base (crean incidencias y órdenes).
No se ejecutan contra https://sgit-cctv.up.railway.app
```

Probado con las tres URL: las dos de producción se bloquean, `localhost` pasa.

---

## Los nueve recorridos, y qué bug concreto caza cada uno

| # | Recorrido | El bug real que habría cazado |
|---|---|---|
| **1** | Entrar | El aviso de error que vivía **dentro** del formulario que se cerraba: la pantalla volvía atrás en silencio *(b. 64)* |
| **2** | El QR en campo | El aviso de «esta zona exige tren parado» que estaba calculado y **no se pintaba** *(b. 62-B)*. Y las fechas que se salían de su caja en iOS *(b. 70)* |
| **3** | Reportar incidencia | «Reportar avería no hace nada»: se cerraba el formulario aunque la respuesta viniera vacía *(b. 64)*. Y los botones apagados que no decían qué faltaba *(b. 67)* |
| **4** | Abrir la orden | **El peor de todos**: las OM nacían sin fecha, nunca vencían, no entraban en el backlog y el cumplimiento del preventivo mentía *(b. 64)* |
| **5** | Quién puede qué | El QR cerrado para el Jefe de Tren *(b. 68)*, el QR imprimible a medias *(b. 77)* y Producción sin poder ver sus órdenes *(b. 83)*. **Tres veces el mismo fallo** |
| **6** | Los indicadores | Los gráficos que enseñaban «value : 3» *(b. 64)*, las 21 fechas con formatos distintos y el Excel del bloque 84 |
| **7** | Guardar un rol | «property nombre should not exist»: la pantalla que reparte el poder dejó de guardar *(b. 85)* |
| **8** | Todas las pantallas | Las que revientan al dibujarse, las llamadas con 5xx y lo que empuja el celular de lado. Lee las rutas de `App.tsx`: una pantalla nueva entra sola *(b. 171)* |
| **9** | Fichas técnicas | Lo único que no se ve sin navegador: **leer el PDF del fabricante en el navegador** (pdf.js y su *worker* servidos por el build), que el asistente proponga los números, que avise del error de dedo, que el PDF se suba y se baje con su nombre, y que quien la cargó NO la pueda verificar *(b. 184)* |

**29 pruebas en 9 archivos**, en escritorio (1366×768, la pantalla de los
púlpitos) y el QR además en móvil (iPhone 13, porque el técnico usa su propio
teléfono).

---

## El recorrido 5 es el más importante, y necesita un segundo usuario

Recorre **todas las entradas del menú que ese usuario ve** y comprueba que cada
una **se abre**.

Es el único que caza el fallo que ya ha aparecido **tres veces**: una entrada de
menú abierta con su endpoint cerrado. Devuelve 403, la pantalla sale vacía, y
eso es indistinguible de «no hay datos». Tarda meses en verse.

**Con el Jefe de Mantenimiento no se detecta**, porque el Jefe lo ve todo. Hace
falta un usuario de perfil estrecho en `E2E_TECNICO_EMAIL`. Sin él, el recorrido
se salta y lo dice.

---

## Decisiones de diseño de las pruebas

- **Sin paralelismo.** Los seis son una historia encadenada: se reporta una
  avería, se convierte en orden y se cierra. En paralelo, el que cierra podría
  correr antes que el que abre.
- **Un reintento, y sólo en CI.** Cero convierte un parpadeo de red en una CI
  roja que nadie se cree; tres esconden un fallo que ocurre una de cada tres
  veces, que es el peor tipo.
- **Se comprueba que la cosa APARECE, no que el formulario se cerró.** El bug
  del bloque 64 era exactamente ése: el formulario se cerraba siempre, hubiera
  ido bien o mal.
- **Se vigila la consola.** Media prueba gratis: una pantalla puede pintarse
  entera y estar reventando en cada repintado.
- **Se mide el desborde de verdad**, en píxeles, no se busca una clase CSS.
- **Las credenciales salen del entorno**, nunca del repositorio.

---

## En la CI

Hay un trabajo nuevo, `recorridos`, que levanta **la pila entera** —Postgres,
backend compilado, frontend compilado y servido— y la usa como la usaría una
persona. Es el único trabajo del CI que hace eso.

Depende de `arranque`: si el backend ni levanta, estos recorridos sólo añadirían
ruido rojo sobre un fallo ya reportado más arriba.

**Se sirve el build, no el servidor de desarrollo.** El modo desarrollo no
trocea los archivos por ruta ni ejercita `lazy-con-reintento`, así que probar
ahí dejaría fuera justo la clase de fallo que se ve tras un despliegue.

**Un almacén S3 de pruebas (bloque 184).** El recorrido 9 SUBE un PDF. Sin
almacén el backend contesta 503 («MinIO no disponible») y la prueba no prueba
nada. El trabajo levanta `s3rver@3.7.1` (un servidor S3 en Node, mismo
protocolo que MinIO, sin Docker) en el puerto 9000 y apunta `MINIO_*` a él.
Vive lo que dura el trabajo.

**UTF-8 explícito (`LANG=C.UTF-8`).** Sin él, Chromium en Linux no sabe escribir
una «é» en un nombre de archivo y descarga «download» a secas. En Windows no
pasa; en la CI sí, y el recorrido 9 comprueba ese nombre.

---

## Dónde se ejecutan

Desde el bloque 171 se ejecutan también en el entorno del agente, con una
réplica del trabajo de la CI: base nueva desde las migraciones, semilla con las
variables de la CI, backend y frontend compilados, almacén S3 de pruebas y
Chromium. **Lo que no hay ahí es WebKit**: el perfil `movil` (iPhone) se corre
con Chromium, así que un fallo que sólo se vea en Safari sólo sale en la CI.

*(Lo de abajo era cierto en el bloque 85 y ya no lo es: entonces no se podían
ejecutar aquí porque el navegador no se podía descargar.)*
