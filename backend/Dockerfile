# Stage 1: Build TypeScript inside the container
FROM node:20-slim AS builder

WORKDIR /app

# Копіюємо конфігураційні файли workspaces та ВСІХ package.json
# Це необхідно для коректної роботи npm workspaces та встановлення hoisted залежностей
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Встановлюємо ВСІ залежності для збірки TypeScript (включаючи кореневі типи та модулі)
RUN npm ci

# Копіюємо вихідний код бекенду
COPY backend/ ./backend/

# Компілюємо TypeScript у JavaScript
WORKDIR /app/backend
RUN npx tsc && npx -y tsc-alias

# Stage 2: Runtime Environment
FROM node:20-slim

WORKDIR /app

# Встановлюємо системний FFmpeg та FFprobe
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Копіюємо конфігураційні файли для workspaces
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Встановлюємо тільки production залежності бекенду та кореня
RUN npm ci --omit=dev

# Копіюємо скомпільований код із builder stage
COPY --from=builder /app/backend/dist ./backend/dist

# Визначаємо змінні середовища для Docker-контейнера
ENV PORT=3000
ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

EXPOSE 3000

CMD ["node", "backend/dist/src/server.js"]
