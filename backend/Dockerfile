# =============================================================================
#  SGIT-CCTV API — imagen de producción
#  Aceros Arequipa · Planta Pisco
# =============================================================================
#  Reescrito el 13/08/2026 tras la auditoría. Cinco correcciones, y la primera
#  podía costar datos de planta:
#
#   1. `prisma db push` -> `prisma migrate deploy`.
#      `db push` NO aplica migraciones: compara el esquema con la base y la
#      sincroniza directo. Prisma lo documenta como herramienta de prototipado
#      y PUEDE ELIMINAR COLUMNAS si detecta una diferencia destructiva. Con la
#      base vacía no pasó nada; con datos cargados, un despliegue podía
#      llevarse una columna por delante. El comentario del archivo decía
#      «aplica las migraciones versionadas» y el comando decía otra cosa.
#
#   2. La semilla ya NO corre en cada arranque.
#      Estaba como `node dist/seed.js || true`: se ejecutaba en cada despliegue
#      y el `|| true` se tragaba cualquier fallo sin dejar rastro. Hasta el
#      13/08 eso además revocaba permisos por un desfase de la semilla.
#      Ahora es un paso manual: `npm run prisma:seed`.
#
#   3. `npm install` -> `npm ci`.
#      `install` puede resolver versiones distintas a las del lock, así que dos
#      despliegues del mismo commit podían llevar librerías diferentes. `ci`
#      instala exactamente lo bloqueado.
#
#   4. La imagen ya no lleva las dependencias de desarrollo.
#      Antes se copiaba el node_modules COMPLETO: jest, ts-node, el CLI de Nest
#      y con ellos lodash, glob, js-yaml, tmp y picomatch — todos con avisos de
#      seguridad. No se ejecutaban, pero estaban ahí y una auditoría de
#      contenedores los lista. Se podan con `npm prune`, que NO recompila los
#      binarios nativos (argon2 y el motor de Prisma) — reinstalarlos en esta
#      etapa exigiría traer python3, make y g++ a la imagen final, que es peor.
#
#   5. Ya no corre como root, y hay HEALTHCHECK.
#      Un contenedor como root es el primer punto de cualquier revisión.
# =============================================================================

# ---- Etapa 1: construcción ------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# python3/make/g++      -> compilar el binding nativo de argon2
# openssl/libc6-compat  -> los exige el motor de Prisma en Alpine (musl)
RUN apk add --no-cache python3 make g++ openssl libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Se quitan las dependencias de desarrollo del árbol YA construido. Los
# binarios nativos siguen en su sitio: `prune` borra carpetas, no recompila.
RUN npm prune --omit=dev

# ---- Etapa 2: ejecución ---------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# En ejecución sólo hacen falta las librerías del sistema, no el compilador.
RUN apk add --no-cache openssl libc6-compat

# node_modules YA PODADO en la etapa anterior.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist          ./dist
COPY --from=builder --chown=node:node /app/prisma        ./prisma
COPY --from=builder --chown=node:node /app/package.json  ./package.json
# Los scripts de DIAGNÓSTICO. No se copiaban, y se notó el 17/08 en Pisco:
# `npm run diagnostico:roles` en la consola de Railway devolvió MODULE_NOT_FOUND
# justo cuando hacía falta mirar la base viva antes de sembrar.
#
# Es la carpeta donde vive lo único que puede comparar el CÓDIGO contra la BASE
# QUE ESTÁ CORRIENDO — y esa comprobación, por definición, sólo sirve en
# producción. Dejarla fuera de la imagen era dejarla fuera del único sitio
# donde se necesita. Son unos kilobytes de texto y ninguno se ejecuta al
# arrancar: hay que invocarlos a mano.
COPY --from=builder --chown=node:node /app/scripts        ./scripts

# `node` es un usuario sin privilegios que ya viene en la imagen oficial.
USER node

EXPOSE 3000

# Si el proceso arranca pero la aplicación no responde, el orquestador se
# entera. Sin esto, un contenedor colgado se ve «verde» indefinidamente.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `migrate deploy` sólo APLICA migraciones pendientes. Nunca borra nada, y si
# una falla el contenedor no arranca — que es lo correcto: es preferible no
# desplegar a desplegar contra un esquema a medias.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
