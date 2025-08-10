FROM node:20-slim AS builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y openssl libssl-dev pkg-config && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# ---- Production Stage ----
FROM node:20-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl libssl3 wget && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json .

EXPOSE 3000

CMD ["node", "dist/server.js"]
