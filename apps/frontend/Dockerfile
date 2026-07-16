# ─────────────────────────────────────────────
#  ETAPA 1: BUILDER
# ─────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

# ─────────────────────────────────────────────
#  ETAPA 2: RUNNER
# ─────────────────────────────────────────────
FROM node:18-alpine AS runner

WORKDIR /app

RUN chown -R node:node /app

USER node

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Puerto que expone el frontend
EXPOSE 3000

# Verifica cada 30s que la página principal responda 200 (usa healthcheck.js)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "server.js"]
