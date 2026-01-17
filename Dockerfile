# ===============================
# 1️⃣ Build stage
# ===============================
FROM node:16-bullseye AS builder

WORKDIR /app

# Native build deps
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Copy prisma early (postinstall needs it)
COPY prisma ./prisma
# Install deps
RUN npm install

# ✅ Copy EVERYTHING needed for build
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
COPY libs ./libs



# Build
RUN npm run build

# Debug safety
RUN ls -l dist
# ===============================
# 2️⃣ Runtime stage
# ===============================
FROM node:16-bullseye

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/src/main.js"]

