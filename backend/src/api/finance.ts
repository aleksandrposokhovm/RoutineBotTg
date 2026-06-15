import { Router, Request, Response } from 'express';
import prisma from '../db';
import { Prisma } from '../generated/prisma/client';

const router = Router();

/**
 * Вспомогательная функция для автоматического создания дефолтного счета "Кошелек",
 * если у пользователя нет ни одного счета.
 */
async function ensureDefaultAccount(userId: number) {
  const accountsCount = await prisma.financeAccount.count({
    where: { userId }
  });

  if (accountsCount === 0) {
    return await prisma.financeAccount.create({
      data: {
        userId,
        name: 'Кошелек',
        balance: 0
      }
    });
  }
  return null;
}

/**
 * GET /api/finance/accounts
 * Получить список всех счетов пользователя.
 * Если счетов нет — создает дефолтный "Кошелек".
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await ensureDefaultAccount(userId);

    const accounts = await prisma.financeAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при получении счетов' });
  }
});

/**
 * POST /api/finance/accounts
 * Создать новый счет
 */
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, balance } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Некорректное имя счета' });
    }

    const account = await prisma.financeAccount.create({
      data: {
        userId,
        name: name.trim(),
        balance: typeof balance === 'number' ? balance : 0
      }
    });

    res.status(201).json(account);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при создании счета' });
  }
});

/**
 * GET /api/finance/categories
 * Получить список всех категорий расходов с расходами за определенный месяц.
 * Query: month = YYYY-MM (например, 2026-06)
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const month = req.query.month as string;

    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Необходим параметр month в формате YYYY-MM' });
    }

    // Получаем все категории пользователя
    const categories = await prisma.expenseCategory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    // Для каждой категории считаем сумму расходов за этот месяц
    const categoriesWithSpent = await Promise.all(
      categories.map(async (category) => {
        const spentAggregation = await prisma.financeTransaction.aggregate({
          where: {
            userId,
            categoryId: category.id,
            type: 'expense',
            date: {
              startsWith: month // Начинается с YYYY-MM
            }
          },
          _sum: {
            amount: true
          }
        });

        return {
          ...category,
          spentThisMonth: spentAggregation._sum.amount || 0
        };
      })
    );

    res.json(categoriesWithSpent);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при получении категорий' });
  }
});

/**
 * POST /api/finance/categories
 * Создать новую категорию расходов
 */
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, icon, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Некорректное имя категории' });
    }
    if (!icon || typeof icon !== 'string' || icon.trim() === '') {
      return res.status(400).json({ error: 'Необходима иконка (эмодзи)' });
    }
    if (!color || typeof color !== 'string' || color.trim() === '') {
      return res.status(400).json({ error: 'Необходим цвет' });
    }

    const category = await prisma.expenseCategory.create({
      data: {
        userId,
        name: name.trim(),
        icon: icon.trim(),
        color: color.trim()
      }
    });

    res.status(201).json({ ...category, spentThisMonth: 0 });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при создании категории' });
  }
});

/**
 * PUT /api/finance/categories/:id
 * Обновить категорию расходов
 */
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const categoryId = parseInt(req.params.id as string);
    const { name, icon, color } = req.body;

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.userId !== userId) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    const updatedCategory = await prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        name: name !== undefined ? name.trim() : category.name,
        icon: icon !== undefined ? icon.trim() : category.icon,
        color: color !== undefined ? color.trim() : category.color
      }
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при обновлении категории' });
  }
});

/**
 * DELETE /api/finance/categories/:id
 * Удалить категорию расходов
 */
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const categoryId = parseInt(req.params.id as string);

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.userId !== userId) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    await prisma.expenseCategory.delete({
      where: { id: categoryId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при удалении категории' });
  }
});

/**
 * POST /api/finance/transactions
 * Добавить транзакцию (доход или расход).
 * Применяется Prisma Transaction для одновременного обновления баланса на счете.
 */
router.post('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { type, amount, comment, date, accountId, categoryId } = req.body;

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Тип транзакции должен быть income или expense' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Сумма транзакции должна быть положительным числом' });
    }
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Необходима дата в формате YYYY-MM-DD' });
    }
    if (!accountId || typeof accountId !== 'number') {
      return res.status(400).json({ error: 'Необходим ID счета' });
    }

    const account = await prisma.financeAccount.findUnique({
      where: { id: accountId }
    });

    if (!account || account.userId !== userId) {
      return res.status(404).json({ error: 'Счет не найден' });
    }

    let resolvedCategoryId: number | null = null;
    if (type === 'expense') {
      if (!categoryId || typeof categoryId !== 'number') {
        return res.status(400).json({ error: 'Для расхода необходим ID категории' });
      }
      const category = await prisma.expenseCategory.findUnique({
        where: { id: categoryId }
      });
      if (!category || category.userId !== userId) {
        return res.status(404).json({ error: 'Категория не найдена' });
      }
      resolvedCategoryId = categoryId;
    }

    // Выполняем в рамках транзакции Prisma
    const result = await prisma.$transaction(async (tx) => {
      // Создаем транзакцию
      const transaction = await tx.financeTransaction.create({
        data: {
          userId,
          type,
          amount,
          comment: comment ? comment.trim() : null,
          date,
          accountId,
          categoryId: resolvedCategoryId
        },
        include: {
          account: true,
          category: true
        }
      });

      // Корректируем баланс счета
      const balanceChange = type === 'income' ? amount : -amount;
      const updatedAccount = await tx.financeAccount.update({
        where: { id: accountId },
        data: {
          balance: {
            increment: balanceChange
          }
        }
      });

      return { transaction, updatedAccount };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при создании транзакции' });
  }
});

/**
 * GET /api/finance/transactions
 * Получить транзакции за конкретный месяц.
 * Query: month = YYYY-MM
 */
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const month = req.query.month as string;

    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Необходим параметр month в формате YYYY-MM' });
    }

    const transactions = await prisma.financeTransaction.findMany({
      where: {
        userId,
        date: {
          startsWith: month
        }
      },
      include: {
        account: true,
        category: true
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при получении транзакций' });
  }
});

/**
 * DELETE /api/finance/transactions/:id
 * Удалить транзакцию с восстановлением баланса счета.
 */
router.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const transactionId = parseInt(req.params.id as string);

    if (isNaN(transactionId)) {
      return res.status(400).json({ error: 'Некорректный ID транзакции' });
    }

    const transaction = await prisma.financeTransaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction || transaction.userId !== userId) {
      return res.status(404).json({ error: 'Транзакция не найдена' });
    }

    // Выполняем отмену транзакции и корректировку баланса
    const result = await prisma.$transaction(async (tx) => {
      // Удаляем транзакцию
      await tx.financeTransaction.delete({
        where: { id: transactionId }
      });

      // Восстанавливаем баланс (если был доход — уменьшаем, если расход — увеличиваем)
      if (transaction.accountId) {
        const balanceChange = transaction.type === 'income' ? -transaction.amount : transaction.amount;
        await tx.financeAccount.update({
          where: { id: transaction.accountId },
          data: {
            balance: {
              increment: balanceChange
            }
          }
        });
      }

      return { success: true };
    });

    res.json(result);
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при удалении транзакции' });
  }
});

/**
 * GET /api/finance/stats
 * Получить общую сумму доходов и расходов за указанный месяц.
 * Query: month = YYYY-MM
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const month = req.query.month as string;

    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Необходим параметр month в формате YYYY-MM' });
    }

    const incomeAgg = await prisma.financeTransaction.aggregate({
      where: {
        userId,
        type: 'income',
        date: {
          startsWith: month
        }
      },
      _sum: {
        amount: true
      }
    });

    const expenseAgg = await prisma.financeTransaction.aggregate({
      where: {
        userId,
        type: 'expense',
        date: {
          startsWith: month
        }
      },
      _sum: {
        amount: true
      }
    });

    res.json({
      income: incomeAgg._sum.amount || 0,
      expense: expenseAgg._sum.amount || 0
    });
  } catch (error) {
    console.error('Error fetching general stats:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при расчете статистики' });
  }
});

/**
 * GET /api/finance/categories/:id/stats
 * Получить детализацию категории: информацию, транзакции за месяц и историю за последние 4 месяца.
 * Query: month = YYYY-MM
 */
router.get('/categories/:id/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const categoryId = parseInt(req.params.id as string);
    const month = req.query.month as string;

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }
    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Необходим параметр month в формате YYYY-MM' });
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category || category.userId !== userId) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Транзакции по этой категории за месяц
    const transactions = await prisma.financeTransaction.findMany({
      where: {
        userId,
        categoryId,
        type: 'expense',
        date: {
          startsWith: month
        }
      },
      include: {
        account: true
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Суммарный расход за выбранный месяц
    const totalSpentThisMonth = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    // История за последние 4 месяца (включая переданный)
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const monthIdx = parseInt(monthStr) - 1; // 0-11

    const monthsList: { key: string; label: string }[] = [];
    for (let i = 3; i >= 0; i--) {
      // Создаем дату с учетом смещения часового пояса, чтобы избежать смещения на предыдущий месяц при некоторых таймзонах
      const d = new Date(year, monthIdx - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      
      // Название месяца в кратком формате на русском
      const label = d.toLocaleString('ru-RU', { month: 'short' });
      monthsList.push({ key, label });
    }

    const statsHistory = await Promise.all(
      monthsList.map(async ({ key, label }) => {
        const sumResult = await prisma.financeTransaction.aggregate({
          where: {
            userId,
            categoryId,
            type: 'expense',
            date: {
              startsWith: key
            }
          },
          _sum: {
            amount: true
          }
        });
        
        // Убираем точки из названий месяцев, например "июн." -> "июн", "марта" -> "марта"
        let cleanLabel = label.replace('.', '');
        // Сделаем с заглавной буквы
        cleanLabel = cleanLabel.charAt(0).toUpperCase() + cleanLabel.slice(1);

        return {
          month: key,
          label: cleanLabel,
          amount: sumResult._sum.amount || 0
        };
      })
    );

    res.json({
      category: {
        ...category,
        spentThisMonth: totalSpentThisMonth
      },
      transactions,
      history: statsHistory
    });
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при расчете детальной статистики по категории' });
  }
});

export default router;
