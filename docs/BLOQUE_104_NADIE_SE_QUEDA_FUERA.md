# Bloque 104 · Nadie se queda fuera, y nadie se escuda en el bloqueo

## Los dos defectos del bloqueo por cuenta

`auth.service.ts` llevaba el bloqueo en un `Map` en memoria:

```ts
private attempts = new Map<string, { fails: number; lockedUntil: number }>();
private readonly MAX_FAILS = 5;
private readonly LOCK_MS = 15 * 60 * 1000;
```

**1 · El contador NO caducaba.** No había ventana. `fails` sólo se ponía a cero
al acertar la contraseña, así que no eran «5 fallos seguidos»: eran **5 fallos
desde la última vez que esa persona entró bien**. Un técnico que se equivoca dos
veces el lunes con el guante puesto y tres el viernes, queda bloqueado el
viernes. En campo ése no es el caso raro: es el caso normal.

**2 · Vivía en memoria.** El freno por ORIGEN ya se había llevado a la base en
el bloque 12.2 (`intentos_acceso`); el de CUENTA se quedó atrás. Con dos
réplicas en Railway cada una contaba por su lado —el límite efectivo se
duplicaba— y un despliegue lo borraba entero, **desbloqueando por accidente**.

**Y no existía desbloqueo manual.** Ni endpoint, ni pantalla. El supervisor no
podía ayudar: el técnico esperaba quince minutos.

## Lo que NO se hizo, y es decisión del usuario

Se propuso castigo **escalonado** (1 → 5 → 15 min) y se descartó:

> Un primer castigo de un minuto le da a quien prueba contraseñas desde fuera
> una ventana barata para seguir probando.

**Son 15 minutos, siempre.** Lo que resuelve el caso del técnico torpe no es
aflojar el castigo: es la **ventana** —que los fallos viejos dejen de contar— y
el **desbloqueo del supervisor**. Un castigo blando protege peor y ayuda menos.

## El desbloqueo, y por qué es también un control de gestión

Palabras del usuario:

> *«Me preocupa que estos cabrones busquen la manera de no trabajar diciendo
> "se me bloqueó".»*

Sin desbloqueo manual, esa frase no se puede ni comprobar ni resolver. Con él,
el supervisor lo levanta en dos segundos **y queda escrito quién lo levantó y
por qué**. Deja de ser una excusa.

**Dos llaves**, como en la purga:

- la AMPLIA (`user.manage`) la mira el guard en el controlador;
- la ESTRECHA se mira en el SERVICIO, **releyendo de la base y no del token**.
  Los permisos viajan dentro del token y duran hasta quince minutos: alguien a
  quien se le acaba de retirar el cargo todavía lleva un token que dice que lo
  tiene.

**Se audita también el intento DENEGADO** (`DESBLOQUEO_DENEGADO`), a petición
del usuario. Quien prueba a desbloquear cuentas sin poder hacerlo es justo lo
que hay que poder ver después.

Y el fallo de login que no bloquea **también se audita ahora con los intentos
que quedaban**: sin la serie completa no se distingue a alguien que se equivoca
con guantes de alguien que prueba contraseñas desde fuera.

## Piezas

| | |
|---|---|
| `src/common/bloqueo-de-cuenta.ts` | **NUEVO** · la regla, pura y probada aparte |
| `src/modules/auth/auth.service.ts` | el `Map` fuera; el estado vive en `intentos_acceso` |
| `src/modules/users/users.service.ts` | `desbloquearCuenta()` y `cuentasBloqueadas()` |
| `src/modules/users/users.controller.ts` | `POST /users/:id/desbloquear` · `GET /users/bloqueadas` |
| `src/modules/users/users.module.ts` | importa `AuditModule` |
| `test/bloqueo-de-cuenta.spec.ts` | **NUEVO** · 9 pruebas |
| `frontend/src/pages/Users.tsx` | se ve el bloqueo y se levanta, con motivo |

**MIGRACIONES: NINGUNA.** Se reutiliza `intentos_acceso`, la tabla del freno por
origen, con su propio prefijo de clave (`cuenta|`) para que las dos puertas no
se pisen. Hay una prueba que lo fija.

## Detalles que no son de adorno

- **`deleteMany` y no `delete`** al desbloquear: si la cuenta no estaba
  bloqueada no hay fila, y `delete` lanzaría. Desbloquear algo ya abierto tiene
  que ser inofensivo, o el supervisor no se atreve a pulsarlo.
- **Si la base no responde, se deja pasar.** Un fallo de base de datos no puede
  dejar a la planta sin poder entrar. Misma decisión que los guards del 12.3.
- **El mensaje de bloqueo dice ahora que se puede pedir el desbloqueo.** Antes
  sólo decía «inténtalo en N min», que es una puerta cerrada sin timbre.
- **`GET /users/bloqueadas` va ANTES de `@Get(':id')`** — si no, `:id` captura
  la palabra «bloqueadas». Regla del §3 del `CLAUDE.md`.

## Cadena

    typecheck backend    OK
    16 verificadores     OK
    typecheck frontend   OK
    lint                 OK · 0 avisos
    20 verificadores     OK
    pruebas tocadas      36 + 29 en verde (bloqueo, freno, corte, auth, acceso)
    build backend        NO SE PUDO CORRER — ver abajo
    build frontend       NO SE PUDO CORRER — ver abajo

**Y el motivo se dice, no se disimula.** Los dos builds fallan por el ENTORNO,
no por el código:

- **backend:** `nest build` limpia `dist/` y el puente de archivos **no permite
  borrar** en las carpetas del usuario (`EPERM: operation not permitted`).
- **frontend:** `node_modules/@rolldown/` sólo trae `binding-win32-x64-msvc`.
  Las dependencias están instaladas para Windows. **No se corrió `npm ci`** a
  propósito: cambiaría ese binario por el de Linux y rompería el build en la
  máquina del usuario.

**La tanda completa de pruebas tampoco cabe** en una llamada del agente (ya
estaba anotado en el bloque 95). Se corrieron las cinco suites que tocan este
bloque. Las 1.270 las corre el usuario.

## Verificador

**No se escribió uno nuevo**, y conviene decir por qué en vez de añadir ruido:
lo que este bloque introduce lo protegen ya las pruebas —la ventana, el castigo
fijo, el vaciado al bloquear y el prefijo de la clave están fijados en
`bloqueo-de-cuenta.spec.ts`— y `verificar:inyeccion` cubre el `AuditModule`
nuevo. *Un verificador que repite lo que ya comprueba una prueba es ruido.*
