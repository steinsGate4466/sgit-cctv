# ===== SGIT-CCTV API — build multi-stage (auditado) =====

# ---- Stage 1: builder ----
FROM node:20-alpine AS builder
WORKDIR /app
# python3/make/g++  -> compilar el binding nativo de argon2
# openssl/libc6-compat -> requeridos por el motor de Prisma en Alpine (musl)
RUN apk add --no-cache python3 make g++ openssl libc6-compat
# Copia package.json y package-lock.json (glob package*.json) para build reproducible
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- Stage 2: runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# En runtime, Prisma (motor de consultas) y argon2 (binario nativo) necesitan
# openssl y libc6-compat en Alpine.
RUN apk add --no-cache openssl libc6-compat
# node_modules COMPLETO del builder: incluye prisma CLI, ts-node y el cliente ya generado
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
# F1-B: aplica las migraciones versionadas (prisma/migrations) al arrancar.
# (F0 usaba `prisma db push`; ahora el esquema se gobierna con migraciones.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
