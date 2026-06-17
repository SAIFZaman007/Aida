# ── Stage 1: Build React/Vite web app ────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
 
# Accept build-time API URL from Coolify env vars
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
CMD ["nginx", "-g", "daemon off;"]