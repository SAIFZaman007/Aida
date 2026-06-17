# ── AIDA Frontend — Production Dockerfile ────────────────────────────

# ── Stage 1: Build Vite/React bundle ─────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .

# ── CRITICAL: Remove the committed .env file before building ──────────
RUN rm -f .env .env.local .env.production

RUN npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# ── Health check (30s start grace period) ─────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]