# syntax=docker/dockerfile:1
# =====================================================================
# Sales CRM — backend (Express + Prisma)
#
# Bosqichlar:
#   build    — barcha bog‘liqliklar, Prisma client generatsiyasi va TypeScript kompilyatsiyasi
#   migrator — migratsiyalarni qo‘llash uchun (Prisma CLI shu yerda qoladi)
#   runtime  — yakuniy image: faqat production paketlari va `dist/`
#
# npm workspaces paketlarni ildizdagi node_modules ga yig‘adi, shuning uchun
# barcha nusxalar /app/node_modules bilan ishlaydi.
# =====================================================================

FROM node:24-alpine AS build
WORKDIR /app

# postinstall `prisma generate` ni chaqiradi — sxema va config oldindan kerak
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/
RUN npm ci --workspace @crm/backend --include-workspace-root

COPY backend ./backend
RUN npm run build --workspace @crm/backend

# ---------------------------------------------------------------------
# Migratsiyalar uchun (compose’dagi `migrate` servisi shu bosqichni ishlatadi)
# ---------------------------------------------------------------------
FROM build AS migrator
WORKDIR /app/backend
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------
# Yakuniy image
# ---------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# dumb-init — SIGTERM to‘g‘ri uzatilishi va zombi jarayonlar qolmasligi uchun
RUN apk add --no-cache dumb-init

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
# Prisma client build bosqichida generatsiya qilingan va `dist` ichiga kompilyatsiya qilingan,
# shuning uchun bu yerda `prisma generate` (postinstall) kerak emas.
RUN npm ci --omit=dev --ignore-scripts --workspace @crm/backend --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist

# Root emas, `node` foydalanuvchisi ostida ishlaydi
RUN chown -R node:node /app
USER node

WORKDIR /app/backend
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
