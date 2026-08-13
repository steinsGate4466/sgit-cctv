# Auditoría de seguridad y gobierno de la información

**SGIT-CCTV · Aceros Arequipa · Planta Pisco**
12/08/2026 · Documento preparado para revisión del área de TI

---

# PARTE I — La conversación que hay que tener primero

Antes de la auditoría técnica hay que decir algo con claridad, porque es lo
que TI va a preguntar en el primer minuto y ninguna tabla de vulnerabilidades
lo responde:

> **Hoy los datos de infraestructura de Laminación están alojados en Railway,
> un proveedor de nube de terceros, en una cuenta personal, fuera del control
> de TI de Aceros Arequipa.**

Eso no es un fallo del código. Es una **decisión de gobierno de la
información** que se tomó para poder construir, y que ahora hay que
regularizar. Presentarlo sin mencionarlo sería el peor error posible: si lo
descubren ellos, la conversación deja de ser sobre el sistema y pasa a ser
sobre por qué no se dijo.

## Qué información contiene el sistema, exactamente

Vale la pena ser preciso, porque «datos de la empresa» suena peor de lo que es
y **también mejor de lo que es** en un punto concreto:

| Tipo de dato | Sensibilidad | Está en el sistema |
|---|---|---|
| Inventario de cámaras, switches, NVR | **Media-alta** — es un mapa de la videovigilancia | Sí |
| Ubicaciones y topología de red de planta | **Alta** — dice dónde está y cómo se conecta todo | Sí |
| **Credenciales de acceso a las cámaras** | **CRÍTICA** | Sí, **cifradas** |
| Direccionamiento IP, VLAN, tableros eléctricos | **Alta** | Sí |
| Nombres y correos del personal de mantenimiento | Media (dato personal) | Sí |
| Fotos de instalaciones de planta | Media | Sí |
| Órdenes de trabajo, repuestos, costos | Media | Sí |
| Video de las cámaras | — | **NO. Nunca.** |
| Datos financieros, RRHH, producción | — | **NO** |

**El punto crítico es el segundo bloque.** Un inventario completo de la
videovigilancia con su direccionamiento IP y las credenciales de los equipos
es, para quien quisiera hacer daño, un plano. Que las credenciales estén
cifradas es necesario pero no suficiente: lo que hay que resolver es **dónde
vive todo eso y quién responde por ello**.

## Tres caminos, con sus costos reales

### Camino A — Traerlo a infraestructura de Aceros Arequipa
**Lo que TI probablemente va a querer.**

El sistema son tres contenedores (aplicación, base de datos, archivos) y se
mueve a un servidor propio o a la nube corporativa sin cambiar una línea de
código. Ya corre en Docker.

- **A favor:** los datos no salen nunca. Se acabó la conversación.
- **En contra:** TI tiene que dar un servidor, mantenerlo y respaldarlo.
- **Esfuerzo:** una tarde, si el servidor existe.

### Camino B — Quedarse en la nube, pero con cuenta corporativa
La cuenta pasa a nombre de la empresa, TI tiene las llaves, y se firma el
acuerdo de tratamiento de datos del proveedor.

- **A favor:** cero mantenimiento de servidores; respaldos y disponibilidad
  del proveedor.
- **En contra:** los datos siguen fuera. Requiere aprobación formal.
- **Esfuerzo:** una hora de migración de cuenta.

### Camino C — Híbrido
La aplicación en la nube, **la base de datos y las fotos en planta**.

- Suena a lo mejor de los dos mundos y **normalmente no lo es**: la latencia
  entre la nube y la planta hace lento todo, y hay que abrir la red hacia
  fuera, que es peor que lo que se intentaba evitar. Lo menciono para
  descartarlo con argumentos, no por omisión.

## Lo que yo llevaría a la reunión

No una propuesta cerrada: **la decisión y sus consecuencias**, para que la
tome TI. Que sean ellos quienes elijan convierte el problema en su proyecto.

Y una frase concreta que ayuda: **«hoy está aquí porque había que
construirlo; dónde vive mañana lo deciden ustedes, y el sistema se mueve sin
tocar código»**.

## Mientras tanto — lo que se puede hacer hoy

1. **Rotar todas las credenciales** una vez migrado, sean cuales sean.
2. **Borrar los datos de prueba** que ya no hagan falta.
3. **Activar el modo ESTRICTO** de acceso por dispositivo: sólo entran los
   equipos aprobados, aunque alguien tenga la contraseña.
4. **Dominio propio**, para que la URL no anuncie el nombre de la empresa.
5. **No cargar el mapeo completo** hasta que la decisión esté tomada. Es más
   fácil mover 50 registros que 3.000 con sus fotos.

---

# PARTE II — Auditoría técnica del código

Revisión completa del código fuente: 37 módulos de backend, 38 pantallas,
~300 endpoints, 71 modelos de datos.

## 1. Resultado en una línea

**No se encontró ninguna vulnerabilidad crítica ni alta explotable.** Tres
hallazgos medios, ya corregidos en esta entrega. El resto es deuda técnica
conocida y documentada.

## 2. Lo que se buscó y NO existe

Esto vale tanto como lo que sí apareció: son las clases de fallo que hunden un
sistema web.

| Vector | Resultado |
|---|---|
| **Inyección SQL** | **0.** Todo pasa por Prisma parametrizado. Los 4 usos de SQL crudo son estáticos y **no interpolan ni una variable** |
| **Inyección en filtros** (operadores en el `where`) | **0.** Ningún filtro se construye con el cuerpo de la petición |
| **XSS** | **0** en 38 pantallas. Sin `dangerouslySetInnerHTML`, sin `innerHTML`, sin `eval` |
| **Asignación masiva** | **0.** `ValidationPipe` global con `whitelist` **y** `forbidNonWhitelisted`: un campo de más **rechaza la petición**, no se ignora |
| **Ejecución de comandos** | **0.** No se usa `child_process` en ningún sitio |
| **SSRF** | **0.** No hay peticiones salientes a URL que venga del usuario |
| **Path traversal** | **0.** Los nombres de archivo se construyen con UUID de la base, nunca con texto del usuario |
| **Secretos en el repositorio** | **0.** Todo por variables de entorno |
| **`passwordHash` en respuestas** | **0.** Proyección segura explícita |
| **Redirección abierta** | **0** |

## 3. Hallazgos — y qué se hizo con ellos

### 🟠 M-1 · Enumeración de usuarios por tiempo de respuesta — **CORREGIDO**

**Qué era.** El mensaje de error del login ya era el mismo para «este correo
no existe» y «la contraseña está mal». Pero el **tiempo** no lo era: si el
usuario no existía, el código se saltaba la verificación de la contraseña
entera y respondía en ~2 ms en vez de ~100 ms.

**Por qué importa.** Midiendo esa diferencia se averigua qué correos
corresponden a usuarios reales **sin acertar ni una contraseña**. Con esa
lista se ataca de verdad — o se hace phishing dirigido, que en una planta
funciona mejor que la fuerza bruta.

**Arreglo.** Cuando el usuario no existe se verifica igualmente contra un hash
señuelo. Cuesta lo mismo y el reloj deja de contar nada. Con dos pruebas: que
el señuelo **no valida ninguna contraseña** y que el tiempo es comparable.

### 🟠 M-2 · El permiso exigido no era el del recurso — **CORREGIDO**

**Qué era.** El borrado genérico usa **una sola ruta** para dieciséis
recursos, así que su `@RequirePermissions` sólo podía exigir el mínimo común
(`asset.read`). Eso permitía que alguien con permiso de lectura de activos
viera la vista previa de un **repuesto** —que exige `inventory.manage`— con
los valores de sus campos.

**Arreglo.** La ruta no puede saber qué recurso es, así que la comprobación se
hace en el servicio, que sí lo sabe.

### 🟠 M-3 · Contador de intentos fallidos sólo en memoria — **DOCUMENTADO**

El bloqueo por intentos vive en un `Map` en memoria del proceso. Se reinicia
en cada despliegue y no se comparte si algún día hay más de una instancia.

**Mitigación existente:** hay además un freno **persistido en base de datos**
(`IntentoAcceso`) que sí sobrevive. El impacto real es bajo.

### 🟡 B-1 · 28 endpoints sin clase de validación

Reciben el cuerpo sin DTO, así que el `ValidationPipe` no tiene metadatos que
validar. **Ninguno de ellos vuelca el cuerpo directamente a la base** —se
revisó uno a uno—, así que hoy no es explotable. Pero es la puerta por donde
entraría el próximo fallo.

### 🟡 B-2 · El token vive en `localStorage`

Si algún día hubiera un XSS, el token sería robable. **Hoy no hay ninguna vía
de XSS** (cero `innerHTML`, React escapa por defecto, CSP activa), así que el
riesgo es condicional. La alternativa —cookie `httpOnly`— obliga a rehacer la
autenticación completa, y ése es el único módulo cuyo fallo no degrada el
sistema: lo apaga. No se toca antes del estreno.

### 🟡 B-3 · La auditoría guarda la respuesta completa

El interceptor registra el cuerpo de respuesta de cada escritura. **El
endpoint que revela una credencial es `GET`**, y el interceptor sólo registra
escrituras, así que no hay secretos en claro en la tabla. Aun así, conviene
una lista de campos a excluir si mañana se añade un `POST` que devuelva algo
sensible.

## 4. Lo que está bien hecho, y conviene que TI lo vea

- **CORS falla en cerrado.** En producción, sin lista blanca declarada, el
  servidor **no arranca**. Un servidor que no levanta se arregla en dos
  minutos; uno que levanta abierto no se nota nunca.
- **Freno por usuario y no por IP.** En planta todos salen por la misma IP:
  frenar por IP habría bloqueado a la planta entera por un solo abusador.
- **Archivos validados por *magic bytes***, no por extensión.
- **Credenciales de cámaras cifradas**, y revelarlas queda auditado.
- **Sesiones revocables de verdad**: cerrar sesión invalida el token en la
  base, no sólo lo borra del navegador.
- **Ámbito por tren aplicado también en rutas por identificador**, y con **404
  en vez de 403** — un 403 confirmaría que el registro existe y permitiría
  enumerar el inventario ajeno.
- **Auditoría con IP, navegador y PC de origen.**
- **10 verificadores propios** que corren antes de cada entrega. Cada uno
  nació de un error real cometido en este proyecto.
- **~520 pruebas automáticas.**

## 5. Cómo verificarlo por su cuenta

Para que TI no tenga que creerse este documento:

```bash
# Los 10 verificadores
cd backend && npm run verificar

# Las pruebas
npm test

# Dependencias con fallos publicados
npm audit --omit=dev

# Buscar SQL crudo
grep -rn "queryRawUnsafe\|executeRawUnsafe" src/

# Buscar HTML sin escapar en el frontend
grep -rn "dangerouslySetInnerHTML\|innerHTML" ../frontend/src/
```

El código completo está en GitHub. **No hace falta confiar en el informe:
se puede comprobar.**

---

# PARTE III — Qué pedirle a TI

1. **Decidir dónde viven los datos** (Camino A, B o C). Es la decisión que
   desbloquea todo lo demás.
2. **Revisar este informe** y añadir lo que su política exija.
3. **Filtrado por MAC en la electrónica de red** (802.1X o port-security), si
   se quiere ese nivel. No se puede hacer desde una aplicación web: la MAC es
   de capa 2 y no llega al servidor.
4. **Confirmar RPO y RTO** aceptables para este sistema.
5. **Un dominio corporativo**, si se quiere que la URL no anuncie la empresa.

---

## Una nota sobre este documento

Está escrito reconociendo tres hallazgos y seis puntos de deuda, y abriendo
con el problema más incómodo del proyecto. Eso es deliberado.

Un informe que dice que todo está perfecto obliga al auditor a buscar qué se
le ocultó. Uno que enseña sus propios huecos, con su gravedad y su plan,
convierte la revisión en una conversación técnica entre pares.
