# syntax=docker/dockerfile:1
# =====================================================================
# Sales CRM — frontend (React + Vite → Nginx)
# Vite muhit o‘zgaruvchilarini build paytida "pishiradi", shuning uchun
# VITE_API_URL build argument sifatida beriladi.
# =====================================================================

FROM node:24-alpine AS build
WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_APP_NAME="Sales CRM"
# Ixtiyoriy: brauzer xatolarini Sentry'ga yuborish (bo'sh — o'chiq)
ARG VITE_SENTRY_DSN=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --workspace @crm/frontend --include-workspace-root

COPY frontend ./frontend
RUN npm run build --workspace @crm/frontend

FROM nginx:1.27-alpine AS runtime
# SPA marshrutlari va statik fayllar keshi uchun sozlama
COPY frontend/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
