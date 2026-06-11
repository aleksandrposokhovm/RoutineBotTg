import { Router, Request, Response } from 'express';
import prisma from '../db';
import { calculateNutritionGoals } from '../services/gemini';

const router = Router();

/**
 * GET /api/profile/me
 * Получить профиль текущего пользователя
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { nutritionProfile: true }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      telegramId: user.telegramId.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      timezone: user.timezone,
      nutritionProfile: user.nutritionProfile,
      isGoogleCalendarConnected: !!(user.googleAccessToken && user.googleRefreshToken)
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/profile/me/timezone
 * Обновить часовой пояс
 */
router.put('/me/timezone', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { timezone } = req.body;

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: 'Invalid timezone' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { timezone }
    });

    res.json({ timezone: user.timezone });
  } catch (error) {
    console.error('Error updating timezone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/profile/me/nutrition
 * Рассчитать и сохранить КБЖУ-профиль через ИИ
 */
router.post('/me/nutrition', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { height, weight, age, gender, activityLevel, goal } = req.body;

    // Расчет через Gemini
    const calculation = await calculateNutritionGoals({
      height, weight, age, gender, activityLevel, goal
    });

    // Сохранение / обновление профиля
    const profile = await prisma.nutritionProfile.upsert({
      where: { userId },
      update: {
        height, weight, age, gender, activityLevel, goal,
        dailyCalories: calculation.dailyCalories,
        dailyProtein: calculation.dailyProtein,
        dailyFat: calculation.dailyFat,
        dailyCarbs: calculation.dailyCarbs
      },
      create: {
        userId,
        height, weight, age, gender, activityLevel, goal,
        dailyCalories: calculation.dailyCalories,
        dailyProtein: calculation.dailyProtein,
        dailyFat: calculation.dailyFat,
        dailyCarbs: calculation.dailyCarbs
      }
    });

    res.json({
      profile,
      explanation: calculation.explanation
    });
  } catch (error) {
    console.error('Error calculating nutrition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
