# Respaldo de fotos y PDF — el agujero que quedaba

**11/08/2026** · SGIT-CCTV · Aceros Arequipa, Planta Pisco

---

## El problema, en una frase

Los respaldos de Railway y el PITR cubren **la base de datos**. Las fotos de
los activos y los informes de OM firmados **no están ahí**: viven en MinIO, en
un volumen aparte que nada respalda.

Y lo peor no es perder la foto. Es que **la base sobrevive y sigue diciendo
que la foto existe**: la ficha muestra `asset/xxx/foto.jpg`, el archivo ya no
está, y el sistema afirma algo que es mentira. Los informes de OM llevan firma:
son el documento que respalda un trabajo hecho, con materiales retirados del
almacén.

---

## Tres capas, de la más barata a la más completa

### Capa 1 — Backups de volumen en Railway *(5 minutos, hazlo hoy)*

Railway hace copias del **volumen** donde vive MinIO, no solo de la base.

```
Railway → servicio MinIO → Settings → Volume → Backups
   Daily + Weekly + Monthly
```

Es lo más rápido y ya cubre el 80 % del riesgo: borrado accidental, volumen
corrupto, un despliegue que se lleva algo por delante.

**Lo que NO cubre:** que se pierda la cuenta de Railway entera, o un error de
facturación que suspenda el proyecto. Para eso hace falta la capa 2.

### Capa 2 — Copia fuera de Railway *(el workflow que va en este paquete)*

`.github/workflows/respaldo-fotos.yml` corre **cada domingo a las 2 de la
mañana** y copia el bucket completo a un almacenamiento S3 externo con
`mc mirror`. Es **incremental**: la primera vez sube todo, las siguientes solo
lo que cambió, aunque haya 20 GB.

**Dónde copiarlo — y por qué importa:**

| | Gratis | Coste de SALIDA | |
|---|---|---|---|
| **Cloudflare R2** | 10 GB | **0** | **La mejor para esto** |
| Backblaze B2 | 10 GB | barato | Buena |
| AWS S3 | — | caro | Funciona, pero recuperar cuesta |

El coste de **salida** es el que decide: el día que haya que restaurar se
descargan los 20 GB de golpe. Con R2 eso no cuesta nada.

**La decisión de diseño del workflow:** el espejo va **sin `--remove`**. Si
alguien borra una foto por error en producción, el espejo **no la borra
también**. Un espejo que replica los borrados no es un respaldo: es una copia
del desastre, hecha más rápido.

### Capa 3 — Ensayo de restauración *(el que nunca se hace)*

Hasta que restaures una copia y compruebes que las fotos se ven, el respaldo
es **una suposición**. El ensayo:

1. Crea un bucket nuevo, `sgit-prueba-restauracion`.
2. `mc mirror destino/sgit-fotos-respaldo prueba/sgit-prueba-restauracion`
3. Abre tres o cuatro archivos y comprueba que se ven.
4. Compara el número de objetos con el original: `mc du` en los dos.

Si eso funciona, tienes respaldo. Si no lo has hecho, tienes un plan.

---

## Qué configurar (una sola vez)

**Repositorio → Settings → Secrets and variables → Actions**

| Secreto | De dónde sale |
|---|---|
| `MINIO_ENDPOINT_URL` | La URL pública del servicio MinIO en Railway |
| `MINIO_ACCESS_KEY` | Railway → MinIO → Variables |
| `MINIO_SECRET_KEY` | Railway → MinIO → Variables |
| `MINIO_BUCKET` | `sgit-evidences` |
| `RESPALDO_S3_URL` | `https://<cuenta>.r2.cloudflarestorage.com` |
| `RESPALDO_S3_KEY` | La clave del bucket de respaldo |
| `RESPALDO_S3_SECRET` | El secreto |
| `RESPALDO_S3_BUCKET` | `sgit-fotos-respaldo` |

**Si falta algo, el workflow termina bien y solo avisa.** No llegan correos de
error todos los domingos hasta que lo configures — el mismo criterio que ya
usa el respaldo de la base.

**Una advertencia honesta:** esto exige que el MinIO de Railway sea alcanzable
desde internet. Si lo tienes en red privada —que sería lo correcto—, el
workflow no llega y hay que hacer el espejo desde dentro de Railway con un
servicio cron. Compruébalo antes de darlo por hecho.

---

## Orden recomendado

1. **Hoy, 5 minutos:** Backups de volumen en Railway (capa 1).
2. **Esta semana:** el bucket de R2 y los secretos (capa 2).
3. **Antes de mapear:** el ensayo de restauración (capa 3).

Y lo mismo para la base: **Backups + PITR**, que siguen pendientes. El PITR
solo protege **desde el momento en que se enciende** — activarlo después de
cargar 300 cámaras no recupera nada de antes.
