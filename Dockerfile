# ---- Builder Stage ----
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Instala dependências do sistema, incluindo OpenSSL
RUN apt-get update && apt-get install -y openssl libssl-dev && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# ✅ Gera Prisma Client com suporte ao ambiente atual
RUN npx prisma generate

# ✅ Compila projeto (caso esteja usando TypeScript)
RUN npm run build

# ---- Production Stage ----
FROM node:20-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production

# ✅ Instala runtime do OpenSSL 3.x
RUN apt-get update && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/package.json .

EXPOSE 3000

CMD ["node", "dist/server.js"]
