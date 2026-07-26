# Cómo subir SGIT-CCTV a AWS — explicado simple

Aceros Arequipa · Planta Pisco

---

## 1. Primero, lo importante: ¿qué necesita tu sistema para funcionar?

Tu ERP tiene **4 piezas**. Da igual dónde lo pongas (Railway, AWS o un servidor de la
planta), siempre necesita estas 4:

| Pieza | Qué hace | Dónde está hoy (Railway) |
|---|---|---|
| **Backend** | La lógica: usuarios, OM, incidencias | Un contenedor |
| **Frontend** | Lo que ve el usuario en el navegador | Otro contenedor |
| **Base de datos** | Donde vive TODA la información | PostgreSQL |
| **Almacenamiento** | Las fotografías | MinIO |

Mudarse a AWS es, básicamente, **poner esas mismas 4 piezas en servicios de Amazon**.

---

## 2. Analogía para entender AWS

Piensa en AWS como un **centro comercial gigante de servicios de cómputo**. Tú no
compras el edificio: **alquilas los locales que necesitas**.

- ¿Necesitas una computadora encendida siempre? → alquilas **EC2** (una PC en la nube).
- ¿Necesitas una base de datos que alguien más cuide? → alquilas **RDS**.
- ¿Necesitas guardar fotos? → alquilas **S3**.

El problema de AWS es que tiene **200+ servicios** y es fácil perderse. Por eso abajo
te doy solo **dos caminos**, y te digo cuál te conviene.

---

## 3. Los dos caminos posibles

### 🟢 Camino A — "Una sola máquina" (recomendado para empezar)

Alquilas **una computadora en la nube (EC2)** y adentro corres tu `docker-compose`,
tal cual lo tienes hoy en tu proyecto. Todo junto: backend, frontend, base de datos y MinIO.

**Ventajas**
- Es lo más parecido a lo que ya tienes. Tu `docker-compose.yml` ya está hecho.
- Un solo lugar que administrar, un solo costo.
- Si mañana Aceros quiere el sistema **dentro de la planta**, es exactamente el mismo
  procedimiento sobre un servidor propio. **No pierdes el trabajo.**

**Desventajas**
- Tú eres responsable de los respaldos y de que la máquina esté sana.
- Si esa máquina se apaga, se cae todo.

**Costo aproximado:** una máquina modesta (t3.small, 2 GB RAM) ronda los **US$ 15–20 al mes**.

---

### 🔵 Camino B — "Servicios separados" (para producción seria)

Cada pieza en un servicio especializado de AWS:

| Pieza | Servicio AWS | Qué te da |
|---|---|---|
| Base de datos | **RDS PostgreSQL** | Respaldos automáticos, Amazon la cuida |
| Fotografías | **S3** | Almacenamiento infinito y barato |
| Backend y Frontend | **ECS Fargate** o **App Runner** | Corren tus contenedores sin administrar servidores |
| Dominio y HTTPS | **Route 53 + Certificate Manager** | `sgit.acerosarequipa.com` con candado de seguridad |

**Ventajas:** respaldos automáticos, escala solo, es lo que usaría una empresa grande.
**Desventajas:** más caro (**US$ 60–100/mes**), más piezas que configurar, curva de aprendizaje.

---

## 4. Mi recomendación honesta

**Quédate en Railway por ahora.** Funciona, cuesta poco y ya lo dominas.

Muévete a AWS cuando ocurra una de estas cosas:
- Aceros Arequipa exige que el sistema esté en la infraestructura corporativa.
- Necesitas conectarlo con la **red interna de la planta** (SAP, HikCentral, Active
  Directory). Eso es lo que realmente obliga a salir de Railway.
- Necesitas garantías formales de respaldo y disponibilidad.

Y ojo con esto: si la exigencia es integrarse con **SAP y las cámaras de la planta**,
probablemente el destino final **no sea AWS sino un servidor dentro de Aceros**
(on-premise), porque los NVR y SAP están en la red interna, no en internet. La buena
noticia: **el procedimiento del Camino A es idéntico** en ambos casos.

---

## 5. Camino A paso a paso (si decides hacerlo)

### Paso 1 — Crear la cuenta
1. Entra a `aws.amazon.com` → **Crear cuenta**.
2. Pide tarjeta de crédito (hay capa gratuita el primer año).
3. **Activa la autenticación en dos pasos (MFA)** en la cuenta raíz. No lo saltes.

### Paso 2 — Crear la máquina (EC2)
1. Busca **EC2** → **Launch Instance**.
2. Nombre: `sgit-cctv`.
3. Sistema: **Ubuntu Server 22.04 LTS**.
4. Tipo: **t3.small** (2 GB RAM). El t2.micro gratuito se queda corto con 4 contenedores.
5. **Key pair**: crea uno y **guarda el archivo .pem**. Es tu llave para entrar; si lo
   pierdes, no entras más.
6. **Disco**: 30 GB.
7. **Security group** (el "firewall"): abre los puertos **22** (administración),
   **80** y **443** (web). **No abras el 5432** (base de datos) a internet.

### Paso 3 — Entrar a la máquina
Desde tu PC (PowerShell):
```powershell
ssh -i "C:\ruta\sgit-key.pem" ubuntu@LA_IP_PUBLICA
```

### Paso 4 — Instalar Docker
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker ubuntu
exit
```
Vuelve a entrar con `ssh` para que tome el permiso.

### Paso 5 — Traer tu proyecto y levantarlo
```bash
git clone https://github.com/steinsGate4466/sgit-cctv.git
cd sgit-cctv
cp .env.example .env
nano .env      # cambia TODAS las contraseñas y secretos
docker compose up -d
```
Tu `docker-compose.yml` ya levanta Postgres, MinIO, la API y Nginx.

### Paso 6 — Verificar
Abre en el navegador `http://LA_IP_PUBLICA`. Debe cargar el sistema.

### Paso 7 — Dominio y HTTPS (recomendado)
1. Apunta un dominio (ej. `sgit.acerosarequipa.com`) a la IP de la máquina.
2. Instala el certificado gratuito:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sgit.acerosarequipa.com
```
Listo: `https://` con candado.

### Paso 8 — Respaldos (¡no te lo saltes!)
Respaldo diario de la base de datos:
```bash
docker exec sgit_db pg_dump -U sgit sgit_cctv > /home/ubuntu/backup-$(date +%F).sql
```
Prográmalo con `crontab -e` para que corra todas las noches, y copia esos archivos a
**S3** o a otro lugar. **Un respaldo que vive en la misma máquina no es un respaldo.**

---

## 6. Errores caros que debes evitar

1. **No dejes la base de datos abierta a internet** (puerto 5432 en el firewall). Es la
   forma más común de que roben datos.
2. **Cambia todos los secretos** del `.env` (JWT, contraseñas, clave de cifrado). Nunca
   uses los de desarrollo en producción.
3. **Configura una alerta de facturación** en AWS. Es fácil dejar algo encendido y
   llevarse una sorpresa a fin de mes.
4. **Prueba que el respaldo se puede restaurar.** Un respaldo que nunca probaste
   restaurar no sirve de nada.
5. **No pierdas el archivo .pem.** Sin él no puedes entrar a la máquina.

---

## 7. Resumen en una frase

**Railway** = alguien te alquila el departamento amoblado.
**AWS Camino A** = alquilas un terreno y armas tu casa (tú la mantienes).
**AWS Camino B** = contratas servicios profesionales para cada cosa (caro pero robusto).

Para el estado actual del proyecto, **Railway está bien**. AWS u on-premise entran cuando
el sistema deba conectarse con la red interna de la planta.
