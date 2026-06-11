# Шаг 1: Сборка фронтенда
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Шаг 2: Сборка бэкенда
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# Шаг 3: Запуск приложения в продакшене
FROM node:20-alpine AS runner
WORKDIR /app

# Копируем скомпилированный бэкенд и зависимости
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/prisma ./backend/prisma

# Копируем собранный фронтенд для раздачи статикой
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Порт бэкенда по умолчанию
EXPOSE 3001

# Переменные окружения для работы в режиме продакшена
ENV NODE_ENV=production
ENV PORT=3001
ENV SERVE_STATIC=true
ENV STATIC_FILES_PATH=/app/frontend/dist

# Указываем рабочую папку бэкенда для корректных относительных путей (например, к базе данных)
WORKDIR /app/backend

# Точка входа для запуска
CMD ["npm", "run", "start"]
