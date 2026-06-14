import { Router, Request, Response } from 'express';
import prisma from '../db';
import { Prisma } from '../generated/prisma/client';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * Вспомогательная функция для сохранения base64-изображения на диск.
 * Возвращает имя созданного файла.
 */
async function savePhoto(photoData: string): Promise<string> {
  const matches = photoData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  let base64Data = photoData;
  let extension = 'jpg';

  if (matches && matches.length === 3) {
    base64Data = matches[2];
    extension = matches[1].split('/')[1] || 'jpg';
  }

  const filename = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
  const uploadsDir = path.join(process.cwd(), 'uploads');

  if (!fs.existsSync(uploadsDir)) {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
  }

  const safeFilename = path.basename(filename);
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  const filepath = path.join(uploadsDir, safeFilename);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.promises.writeFile(filepath, Buffer.from(base64Data, 'base64'));
  return filename;
}


/**
 * GET /api/diet?date=YYYY-MM-DD&userId=1
 * Получить записи о питании за день
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const userId = req.user!.id;

    const where: Prisma.DietEntryWhereInput = { userId: userId };
    if (date) where.date = date as string;

    const entries = await prisma.dietEntry.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    });

    res.json(entries);
  } catch (error) {
    console.error('Error fetching diet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/diet/summary?date=YYYY-MM-DD&userId=1
 * Суммарные КБЖУ за день
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const userId = req.user!.id;
    if (!date) return res.status(400).json({ error: 'date required' });

    const entries = await prisma.dietEntry.findMany({
      where: { userId: userId, date: date as string }
    });

    const totals = entries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        protein: acc.protein + e.protein,
        fat: acc.fat + e.fat,
        carbs: acc.carbs + e.carbs
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    // Получаем профиль КБЖУ для расчета "осталось"
    const profile = await prisma.nutritionProfile.findUnique({
      where: { userId: userId }
    });

    const goals = profile
      ? {
          dailyCalories: profile.dailyCalories,
          dailyProtein: profile.dailyProtein,
          dailyFat: profile.dailyFat,
          dailyCarbs: profile.dailyCarbs
        }
      : null;

    const remaining = goals
      ? {
          calories: Math.max(0, goals.dailyCalories - totals.calories),
          protein: Math.max(0, goals.dailyProtein - totals.protein),
          fat: Math.max(0, goals.dailyFat - totals.fat),
          carbs: Math.max(0, goals.dailyCarbs - totals.carbs)
        }
      : null;

    res.json({
      date,
      eaten: totals,
      goals,
      remaining,
      entries: entries.length
    });
  } catch (error) {
    console.error('Error fetching diet summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/diet/analytics?userId=1&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Аналитика КБЖУ за период (для графиков за неделю/месяц)
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user!.id;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate required' });
    }

    const entries = await prisma.dietEntry.findMany({
      where: {
        userId: userId,
        date: {
          gte: startDate as string,
          lte: endDate as string
        }
      },
      orderBy: { date: 'asc' }
    });

    // Группируем по дням
    const byDay: Record<string, { calories: number; protein: number; fat: number; carbs: number }> = {};
    for (const entry of entries) {
      if (!byDay[entry.date]) {
        byDay[entry.date] = { calories: 0, protein: 0, fat: 0, carbs: 0 };
      }
      byDay[entry.date].calories += entry.calories;
      byDay[entry.date].protein += entry.protein;
      byDay[entry.date].fat += entry.fat;
      byDay[entry.date].carbs += entry.carbs;
    }

    // Средние значения
    const days = Object.keys(byDay);
    const dayValues = Object.values(byDay);
    const avgCalories = dayValues.length > 0 ? dayValues.reduce((s, val) => s + val.calories, 0) / dayValues.length : 0;
    const avgProtein = dayValues.length > 0 ? dayValues.reduce((s, val) => s + val.protein, 0) / dayValues.length : 0;
    const avgFat = dayValues.length > 0 ? dayValues.reduce((s, val) => s + val.fat, 0) / dayValues.length : 0;
    const avgCarbs = dayValues.length > 0 ? dayValues.reduce((s, val) => s + val.carbs, 0) / dayValues.length : 0;

    res.json({
      period: { startDate, endDate },
      dailyData: byDay,
      averages: {
        calories: Math.round(avgCalories),
        protein: Math.round(avgProtein * 10) / 10,
        fat: Math.round(avgFat * 10) / 10,
        carbs: Math.round(avgCarbs * 10) / 10
      },
      totalDays: days.length
    });
  } catch (error) {
    console.error('Error fetching diet analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/diet/photo/:fileId
 * Получить изображение (локальное или из Telegram)
 */
router.get('/photo/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId as string;

    // 1. Проверяем, локальный ли это файл
    if (fileId.startsWith('upload_')) {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const safeFileId = path.basename(fileId);
      // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal, javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal
      const filepath = path.resolve(uploadsDir, safeFileId);

      if (!filepath.startsWith(uploadsDir)) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (fs.existsSync(filepath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
        return res.sendFile(filepath);
      } else {
        return res.status(404).json({ error: 'Local photo not found' });
      }
    }

    // 2. Если это Telegram file_id
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Telegram bot token is not configured' });
    }

    const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    if (!fileInfoRes.ok) {
      return res.status(404).json({ error: 'Photo not found in Telegram' });
    }
    const fileInfo = (await fileInfoRes.json()) as { result?: { file_path?: string } };
    const filePath = fileInfo.result?.file_path;
    if (!filePath) {
      return res.status(404).json({ error: 'File path not resolved by Telegram' });
    }

    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const fileStreamResponse = await fetch(fileUrl);
    if (!fileStreamResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch photo from Telegram servers' });
    }

    const contentType = fileStreamResponse.headers.get('Content-Type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'Invalid file type from Telegram' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const arrayBuffer = await fileStreamResponse.arrayBuffer();
    // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Error serving photo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/diet
 * Добавить запись о еде вручную
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, mealType, date, calories, protein, fat, carbs, portionGrams, photoData } = req.body;
    const userId = req.user!.id;

    let photoFileId = req.body.photoFileId || null;
    if (photoData) {
      photoFileId = await savePhoto(photoData);
    }

    const entry = await prisma.dietEntry.create({
      data: {
        userId: userId,
        name,
        mealType: mealType || 'snack',
        date,
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        fat: Number(fat) || 0,
        carbs: Number(carbs) || 0,
        portionGrams: portionGrams ? Number(portionGrams) : null,
        photoFileId
      }
    });

    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating diet entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/diet/:id
 * Обновить запись о еде
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, mealType, date, calories, protein, fat, carbs, portionGrams, photoData } = req.body;
    const updateData: Prisma.DietEntryUpdateInput = {};
    if (name) updateData.name = name;
    if (mealType) updateData.mealType = mealType;
    if (date) updateData.date = date;
    if (calories !== undefined) updateData.calories = Number(calories) || 0;
    if (protein !== undefined) updateData.protein = Number(protein) || 0;
    if (fat !== undefined) updateData.fat = Number(fat) || 0;
    if (carbs !== undefined) updateData.carbs = Number(carbs) || 0;
    if (portionGrams !== undefined) updateData.portionGrams = portionGrams ? Number(portionGrams) : null;

    if (photoData) {
      updateData.photoFileId = await savePhoto(photoData);
    } else if (req.body.photoFileId !== undefined) {
      updateData.photoFileId = req.body.photoFileId;
    }

    const userId = req.user!.id;
    const existing = await prisma.dietEntry.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ error: 'Diet entry not found or access denied' });

    const entry = await prisma.dietEntry.update({
      where: { id: Number(req.params.id) },
      data: updateData
    });
    res.json(entry);
  } catch (error) {
    console.error('Error updating diet entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/diet/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.dietEntry.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ error: 'Diet entry not found or access denied' });

    await prisma.dietEntry.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting diet entry:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
