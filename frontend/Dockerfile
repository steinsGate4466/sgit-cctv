# =============================================================================
#  SGIT-CCTV — frontend, imagen de producción
# =============================================================================
#  Reescrito el 13/08/2026 con la auditoría. Cuatro correcciones:
#
#   1. `npm install` -> `npm ci`. Reproducible: dos despliegues del mismo
#      commit llevan exactamente las mismas librerías.
#
#   2. Ya no corre como root.
#
#   3. `serve` se instala con versión FIJA. Antes era `npm install -g serve`
#      sin versión: cada reconstrucción podía traer una `serve` distinta, y un
#      servidor web que cambia solo entre despliegues es justo lo que no se
#      quiere delante de una aplicación de planta.
#
#   4. HEALTHCHECK. Si el proceso vive pero no sirve la página, se nota.
#
#  NOTA sobre las alertas de `npm audit` del frontend: vite, nanoid y las
#  demás son del COMPILADOR. Viven en la etapa 1 y no llegan a esta imagen —
#  el navegador recibe HTML, CSS y JavaScript ya compilado, nunca esas
#  librerías. El riesgo es de la máquina que compila, no del usuario.
# =============================================================================

# ---- Etapa 1: construir ---------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# La dirección de la API se hornea en el build: Vite la incrusta en el bundle.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Etapa 2: servir ------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Versión FIJA a propósito. Sin ella, cada reconstrucción podía traer otra.
RUN npm install -g serve@14.2.3 && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist

USER node

# Railway asigna el puerto por variable.
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
