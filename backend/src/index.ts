/**
 * RoutineBot — Главная точка входа
 *
 * Запускает:
 * 1. Telegram-бот (Telegraf)
 * 2. Express API-сервер (для Mini App)
 * 3. Систему напоминаний (Scheduler)
 */

import dotenv from 'dotenv';
dotenv.config();

import { createBot } from './bot';
import { createApp } from './api';
import { startScheduler, stopScheduler } from './services/scheduler';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  console.log('🚀 Starting RoutineBot...');

  // 1. Запуск Express API
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`🌐 API server running on http://localhost:${PORT}`);
  });

  // 2. Запуск Telegram-бота
  const bot = createBot();
  bot.launch(() => {
    // onLaunch вызывается сразу после getMe(), до начала блокирующего цикла поллинга
    console.log('🤖 Telegram bot started');
    // 3. Запуск системы напоминаний
    startScheduler(bot);
  }).catch(err => {
    if (err && err.response && err.response.error_code === 409) {
      console.error('⚠️ Ошибка запуска бота: 409 Conflict.');
      console.error('Это означает, что бот с этим токеном уже запущен на другом сервере (например, на вашем боевом сервере/VPS) или локально в другом процессе.');
      console.error('Чтобы запустить его локально, остановите другую копию бота или укажите в backend/.env токен тестового бота.');
    } else {
      console.error('❌ Bot launch error:', err);
    }
  });

  console.log('✅ RoutineBot is initializing...');
  console.log(`📱 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n🛑 Shutting down (${signal})...`);
    stopScheduler();
    try {
      bot.stop(signal);
    } catch (e) {
      console.error('Error stopping bot:', e);
    }
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
}

main().catch(console.error);
