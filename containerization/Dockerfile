# ============================================================
# Smart Code Proxy — Imagen Docker multi-etapa para producción
# ============================================================
# Etapa 1: Compilación de TypeScript a JavaScript (builder)
# Etapa 2: Imagen de producción mínima con solo las dependencias de runtime
# ============================================================

FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY configs ./configs
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY configs ./configs
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
RUN mkdir -p /app/sessions
ENV NODE_ENV=production
EXPOSE 8787
VOLUME ["/app/sessions"]
CMD ["node", "dist/index.js"]
