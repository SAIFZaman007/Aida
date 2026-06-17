# ── AIDA Frontend — Production Dockerfile ────────────────────────────
# Stage 1: Build React/Vite web bundle
FROM node:20-alpine AS builder
WORKDIR /app

# VITE_API_URL is passed as a build arg from Coolify Environment Variables.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# ── Health check ──────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]