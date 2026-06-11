import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

/**
 * GET /api/plans?date=YYYY-MM-DD&userId=1
 * Получить задачи на конкретный день (включая перенесённые)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { date, includeCompleted } = req.query;
    const userId = (req as any).user.id;

    const plans = await prisma.plan.findMany({
      where: {
        userId: userId,
        OR: date
          ? [
              { date: date as string },
              {
                date: { lt: date as string },
                completed: false
              }
            ]
          : undefined
      },
      orderBy: [
        { completed: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    const uniquePlansMap = new Map();
    for (const p of plans) {
      if (p.groupId) {
        const existing = uniquePlansMap.get(p.groupId);
        if (!existing || p.date > existing.date) {
          uniquePlansMap.set(p.groupId, p);
        }
      } else {
        uniquePlansMap.set(p.id.toString(), p);
      }
    }

    const uniquePlans = Array.from(uniquePlansMap.values()).sort((a: any, b: any) => {
      if (a.completed === b.completed) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      return a.completed ? 1 : -1;
    });

    const result = uniquePlans.map((p: any) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      date: p.date,
      completed: p.completed,
      completedAt: p.completedAt,
      originalDate: p.originalDate,
      isCarriedOver: p.date !== p.originalDate || (date !== undefined && p.date !== date)
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/plans
 * Создать новую задачу
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, date } = req.body;
    const userId = (req as any).user.id;

    const plan = await prisma.plan.create({
      data: {
        userId: userId,
        title,
        description: description || null,
        date,
        originalDate: date
      }
    });

    res.status(201).json(plan);
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/plans/:id/complete
 * Отметить задачу как выполненную
 */
router.put('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { date } = req.body;
    const userId = (req as any).user.id;
    const existing = await prisma.plan.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found or access denied' });

    let plan;
    if (existing.groupId) {
      // Маркируем всю группу как выполненную, но НЕ меняем даты у прошлых записей
      await prisma.plan.updateMany({
        where: { groupId: existing.groupId },
        data: {
          completed: true,
          completedAt: new Date()
        }
      });

      // Обновляем дату ТОЛЬКО у конкретной записи, которую закрыли на текущем дне
      if (date) {
        await prisma.plan.update({
          where: { id: existing.id },
          data: { date }
        });
      }
      plan = await prisma.plan.findFirst({ where: { id: Number(req.params.id) } });
    } else {
      const updateData: any = {
        completed: true,
        completedAt: new Date()
      };
      if (date) {
        updateData.date = date;
      }
      plan = await prisma.plan.update({
        where: { id: Number(req.params.id) },
        data: updateData
      });
    }
    res.json(plan);
  } catch (error) {
    console.error('Error completing plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/plans/:id/uncomplete
 * Снять галочку выполнения
 */
router.put('/:id/uncomplete', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const existing = await prisma.plan.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found or access denied' });

    let plan;
    if (existing.groupId) {
      await prisma.plan.updateMany({
        where: { groupId: existing.groupId },
        data: {
          completed: false,
          completedAt: null
        }
      });
      plan = await prisma.plan.findFirst({ where: { id: Number(req.params.id) } });
    } else {
      plan = await prisma.plan.update({
        where: { id: Number(req.params.id) },
        data: {
          completed: false,
          completedAt: null
        }
      });
    }
    res.json(plan);
  } catch (error) {
    console.error('Error uncompleting plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/plans/:id
 * Обновить задачу
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, description, date } = req.body;
    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (date) updateData.date = date;

    const userId = (req as any).user.id;
    const existing = await prisma.plan.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found or access denied' });

    const plan = await prisma.plan.update({
      where: { id: Number(req.params.id) },
      data: updateData
    });
    res.json(plan);
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/plans/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const existing = await prisma.plan.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found or access denied' });

    if (existing.groupId) {
      // Удаляем всю цепочку задачи по ее groupId
      await prisma.plan.deleteMany({ where: { groupId: existing.groupId } });
    } else {
      await prisma.plan.delete({ where: { id: Number(req.params.id) } });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
