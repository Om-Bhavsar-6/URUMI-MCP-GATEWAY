# Multi-stage Dockerfile for Mock Upstream MCP Servers (Weather & Notes)
# Security: Minimal attack surface, runs as non-root

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Run as built-in non-root node user (uid 1000)
USER node

# Copy built artifacts and production dependencies
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV SERVICE_TYPE=all
ENV WEATHER_PORT=3001
ENV NOTES_PORT=3002

EXPOSE 3001 3002

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/healthz || exit 1

CMD ["node", "dist/index.js"]
