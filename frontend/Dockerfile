# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# La URL de la API se inyecta en build (Vite la "hornea").
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- serve estático ----
FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
# Railway asigna el puerto por variable PORT.
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
