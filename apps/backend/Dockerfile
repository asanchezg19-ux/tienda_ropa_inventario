# ─────────────────────────────────────────────
#  ETAPA 1: BUILDER
#  Instala todas las dependencias (incluyendo dev)
#  para que npm ci tenga el lockfile disponible
# ─────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar solo los archivos de dependencias primero
# (Docker cachea esta capa: si no cambia package.json,
#  no vuelve a hacer npm ci en rebuilds → más rápido)
COPY package.json package-lock.json* ./

# Instalar TODAS las dependencias (incluye devDependencies)
RUN npm install

# Copiar el resto del código
COPY . .

# ─────────────────────────────────────────────
#  ETAPA 2: RUNNER (imagen final de producción)
# ─────────────────────────────────────────────
FROM node:18-alpine AS runner

WORKDIR /app

# Crear carpeta de datos ANTES de cambiar de usuario
# Aquí se guardan los JSON de inventario y ventas
# (mapeado al volumen backend-data en docker-compose.yml)
RUN mkdir -p /app/data && chown -R node:node /app

# Cambiar a usuario no-root por seguridad
USER node

# Copiar dependencias de producción desde el builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Copiar el código de la aplicación
COPY --chown=node:node . .

# Puerto que expone el backend
EXPOSE 4000

# Verifica cada 30s que /api/health responda 200 (usa healthcheck.js)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node healthcheck.js

# Comando de inicio
CMD ["node", "server.js"]
