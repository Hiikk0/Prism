# Stage 1: Build Vue 3 static files
FROM node:20-slim AS builder

WORKDIR /app

# Копіюємо конфігураційні файли workspaces та ВСІХ package.json
# Це необхідно для коректної роботи npm workspaces та встановлення залежностей
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Встановлюємо ВСІ залежності для збірки Vue
RUN npm ci

# Копіюємо код фронтенду
COPY frontend/ ./frontend/

# Збираємо проект
WORKDIR /app/frontend
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM nginx:alpine

# Копіюємо конфігурацію Nginx
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Копіюємо збілджену статику з builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
