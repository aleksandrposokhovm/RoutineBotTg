import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../db';

const OWNER_TG_ID = parseInt(process.env.OWNER_TG_ID || '0', 10);
const ALLOWED_TG_IDS = (process.env.ALLOWED_TG_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

/**
 * Валидация подписи Telegram Web App (initData)
 * Извлекает telegramId, находит пользователя в БД и помещает его в req.user.
 */
export async function validateTelegramWebApp(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  console.log(`[API AUTH] Request: ${req.method} ${req.originalUrl}`);

  if (!authHeader || !authHeader.startsWith('tma ')) {
    console.log(`[API AUTH] Missing or invalid authorization header prefix. Header: ${authHeader}`);
    // В режиме локальной разработки разрешаем использовать первого пользователя в базе
    // (если приложение запущено не внутри Telegram)
    if (process.env.NODE_ENV !== 'production' && !authHeader) {
      console.log('[API AUTH] No auth header. Attempting dev bypass...');
      const devUser = await prisma.user.findFirst();
      if (devUser) {
        console.log(`[API AUTH] Dev bypass active. Using user id: ${devUser.id}, telegramId: ${devUser.telegramId}`);
        (req as any).user = devUser;
        return next();
      } else {
        console.log('[API AUTH] Dev bypass failed: No users in database.');
      }
    }
    return res.status(401).json({ error: 'Unauthorized: Missing tma token' });
  }

  const initData = authHeader.split(' ')[1];
  console.log(`[API AUTH] WebApp initData: ${initData.substring(0, 30)}...`);
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  
  if (!hash) {
    console.log('[API AUTH] Validation failed: Missing hash in initData.');
    return res.status(401).json({ error: 'Unauthorized: Missing hash' });
  }
  
  urlParams.delete('hash');

  const dataCheckString = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN || '').digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  console.log(`[API AUTH] Comparing hashes. Provided: ${hash.substring(0, 8)}..., Calculated: ${calculatedHash.substring(0, 8)}...`);

  if (calculatedHash !== hash) {
    console.log('[API AUTH] Validation failed: Hash mismatch!');
    return res.status(401).json({ error: 'Unauthorized: Invalid hash' });
  }

  const userStr = urlParams.get('user');
  if (!userStr) {
    console.log('[API AUTH] Validation failed: No user string in initData.');
    return res.status(401).json({ error: 'Unauthorized: No user in initData' });
  }

  try {
    const tgUser = JSON.parse(userStr);
    console.log(`[API AUTH] Parsed user from initData: ${JSON.stringify(tgUser)}`);
    
    // Дополнительная проверка безопасности: разрешен ли пользователь
    const tgId = parseInt(tgUser.id, 10);
    const isOwner = tgId === OWNER_TG_ID;
    const isAllowed = ALLOWED_TG_IDS.includes(tgId);
    
    console.log(`[API AUTH] User authorization checks. tgId: ${tgId}, isOwner: ${isOwner}, isAllowed: ${isAllowed}`);

    if (!isOwner && !isAllowed) {
      console.log(`[API AUTH] Validation failed: User ${tgId} is forbidden. OWNER_TG_ID=${OWNER_TG_ID}, ALLOWED_TG_IDS=${ALLOWED_TG_IDS.join(',')}`);
      return res.status(403).json({ error: 'Forbidden: You are not allowed to use this app.' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgUser.id) }
    });

    if (!dbUser) {
      console.log(`[API AUTH] Validation failed: User with telegramId ${tgUser.id} is not found in database.`);
      return res.status(401).json({ error: 'User not registered in bot. Please start the bot first.' });
    }

    console.log(`[API AUTH] Authentication successful. User: ${dbUser.firstName} (id: ${dbUser.id})`);
    (req as any).user = dbUser;
    next();
  } catch (err) {
    console.error('[API AUTH] Error parsing TG user:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid user format' });
  }
}
