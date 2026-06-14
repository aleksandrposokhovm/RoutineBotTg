import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import scheduleRoutes from './schedule';
import plansRoutes from './plans';
import dietRoutes from './diet';
import profileRoutes from './profile';
import { publicGoogleAuthRouter, protectedGoogleAuthRouter } from './googleAuth';
import { validateTelegramWebApp } from './auth';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));

  // Healthcheck (без авторизации)
  app.get('/api/health', (_, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Публичный роут для коллбэка Google OAuth (без проверки Telegram Web App)
  app.use('/api/auth/google', publicGoogleAuthRouter);

  // Защита всех остальных API роутов
  app.use('/api', validateTelegramWebApp);

  // Роуты API
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/plans', plansRoutes);
  app.use('/api/diet', dietRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/google', protectedGoogleAuthRouter);

  // Автоматическая раздача статических файлов фронтенда в продакшене
  const staticPath = process.env.STATIC_FILES_PATH || path.resolve(__dirname, '../../../frontend/dist');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (fs.existsSync(staticPath)) {
    console.log(`🌐 [Static] Serving frontend static files from: ${staticPath}`);
    app.use(express.static(staticPath));
    
    // Поддержка SPA-роутинга для React (совместимо с Express 5)
    app.get(/(.*)/, (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(staticPath, 'index.html'), (err) => {
        if (err) {
          next();
        }
      });
    });
  } else {
    console.log(`⚠️ [Static] Frontend static directory not found at: ${staticPath}. Running in API-only mode.`);
  }

  return app;
}

