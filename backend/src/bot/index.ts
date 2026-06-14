import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import crypto from 'crypto';
import prisma from '../db';
import { Plan, ScheduleEvent, DietEntry, User, Prisma } from '../generated/prisma/client';
import {
  processTextMessage,
  processVoiceMessage,
  analyzePhotoForDiet,
  AIIntent,
  transcribeYesNo,
  extractGramsFromVoice,
  generateHistoryResponse
} from '../services/gemini';
import {
  getCurrentDatetimeInTz,
  getTodayDateInTz,
  localTimeToUTC,
  isValidTimezone,
  utcToLocalDate,
  utcToLocalTime,
  addDaysToDateStr
} from '../services/timezone';
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '../services/googleCalendar';

const OWNER_TG_ID = parseInt(process.env.OWNER_TG_ID || '0', 10);

interface DeletionData {
  ids: number[];
  query: string;
}

interface PortionDietData {
  name?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  mealType?: string;
  photoFileId?: string | null;
  portionGrams?: number | null;
  needsPortionClarification?: boolean;
  date?: string;
}

interface EditNewData {
  title?: string;
  description?: string | null;
  date?: string;
  targetDate?: string;
  startTime?: string;
  endTime?: string;
  name?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  portionGrams?: number | null;
}

// Состояние ожидания подтверждения удаления
const pendingDeletions = new Map<number, {
  action: string;
  data: DeletionData;
  expiresAt: number;
}>();

// Состояние ожидания размера порции
const pendingPortions = new Map<number, {
  dietData: PortionDietData;
  expiresAt: number;
}>();

// Состояние ожидания подтверждения редактирования
const pendingEdits = new Map<number, {
  action: string;
  item: Plan | ScheduleEvent | DietEntry;
  newData: EditNewData;
  expiresAt: number;
}>();

const ALLOWED_TG_IDS = (process.env.ALLOWED_TG_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

/**
 * Middleware: проверка что пользователь разрешен
 */
function authMiddleware(ctx: Context, next: () => Promise<void>) {
  console.log('[Bot Update Received]:', ctx.updateType, ctx.from?.id);
  const userId = ctx.from?.id;
  
  if (!userId) return;

  const isOwner = userId === OWNER_TG_ID;
  const isAllowed = ALLOWED_TG_IDS.includes(userId);

  if (!isOwner && !isAllowed) {
    ctx.reply('⛔ Извините, этот бот вам недоступен. Попросите владельца добавить ваш ID в список.');
    return;
  }
  return next();
}

/**
 * Гарантируем наличие пользователя в БД
 */
async function ensureUser(telegramId: number, firstName?: string, lastName?: string) {
  return prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: { firstName, lastName },
    create: {
      telegramId: BigInt(telegramId),
      firstName,
      lastName,
      timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Yekaterinburg'
    }
  });
}

/**
 * Обработать намерение ИИ и выполнить действие
 */
async function handleAIIntent(ctx: Context, intent: AIIntent, user: User) {
  const userId = user.id;
  const timezone = user.timezone;

  switch (intent.action) {
    // ─── ДОБАВИТЬ В РАСПИСАНИЕ ───
    case 'add_schedule': {
      const title = intent.data.title || 'Без названия';
      const description = intent.data.description;
      const date = intent.data.date;
      const startTime = intent.data.startTime || '00:00';
      const endTime = intent.data.endTime || '00:00';
      const targetDate = date || getTodayDateInTz(timezone);

      const endTimeDate = endTime < startTime ? addDaysToDateStr(targetDate, 1) : targetDate;

      const startTimeUTC = localTimeToUTC(targetDate, startTime, timezone);
      const endTimeUTC = localTimeToUTC(endTimeDate, endTime, timezone);

      const now = new Date();
      const msUntilStart = startTimeUTC.getTime() - now.getTime();
      const minutesUntilStart = msUntilStart / 1000 / 60;
      const reminded150 = minutesUntilStart <= 150;
      const reminded60 = minutesUntilStart <= 60;

      const event = await prisma.scheduleEvent.create({
        data: {
          userId,
          title,
          description: description || null,
          startTimeUTC,
          endTimeUTC,
          createdInTz: timezone,
          reminded150,
          reminded60
        }
      });

      // Синхронизация с Google Календарем
      const googleEventId = await createGoogleCalendarEvent(userId, {
        title: event.title,
        description: event.description,
        startTimeUTC: event.startTimeUTC,
        endTimeUTC: event.endTimeUTC
      });
      if (googleEventId) {
        await prisma.scheduleEvent.update({
          where: { id: event.id },
          data: { googleEventId }
        });
      }

      await ctx.reply(`✅ ${intent.confirmationMessage || `Добавлено в расписание: "${title}" на ${targetDate} с ${startTime} до ${endTime}`}`);
      break;
    }

    // ─── ДОБАВИТЬ В ПЛАН (TO-DO) ───
    case 'add_plan': {
      const { tasks, date } = intent.data;
      const targetDate = date || getTodayDateInTz(timezone);

      if (tasks && Array.isArray(tasks)) {
        for (const task of tasks) {
          const taskTitle = typeof task === 'string' ? task : (task.title || 'Без названия');
          const taskDesc = typeof task === 'string' ? null : (task.description || null);
          await prisma.plan.create({
            data: {
              userId,
              title: taskTitle,
              description: taskDesc,
              date: targetDate,
              originalDate: targetDate,
              groupId: crypto.randomUUID()
            }
          });
        }
        await ctx.reply(`✅ ${intent.confirmationMessage || `Добавлено ${tasks.length} задач(и) на ${targetDate}`}`);
      }
      break;
    }

    // ─── ДОБАВИТЬ В РАЦИОН ───
    case 'add_diet': {
      const dietData = intent.data;

      // Если нужно уточнить размер порции
      if (dietData.needsPortionClarification) {
        pendingPortions.set(ctx.from!.id, {
          dietData,
          expiresAt: Date.now() + 5 * 60 * 1000 // 5 минут
        });
        await ctx.reply(`🍽 Я определил блюдо: "${dietData.name}"\n\nПожалуйста, укажите размер порции (в граммах), чтобы я мог точно рассчитать КБЖУ.`);
        return;
      }

      const targetDate = dietData.date || getTodayDateInTz(timezone);
      await prisma.dietEntry.create({
        data: {
          userId,
          name: dietData.name || 'Неизвестное блюдо',
          mealType: dietData.mealType || 'snack',
          date: targetDate,
          calories: dietData.calories || 0,
          protein: dietData.protein || 0,
          fat: dietData.fat || 0,
          carbs: dietData.carbs || 0,
          portionGrams: dietData.portionGrams || null,
          photoFileId: dietData.photoFileId || null
        }
      });

      await ctx.reply(
        `✅ Записано в рацион!\n\n` +
        `🍽 ${dietData.name || 'Неизвестное блюдо'}\n` +
        `📊 ${Math.round(dietData.calories || 0)} ккал | Б: ${Math.round(dietData.protein || 0)}г | Ж: ${Math.round(dietData.fat || 0)}г | У: ${Math.round(dietData.carbs || 0)}г` +
        (dietData.portionGrams ? `\n⚖️ Порция: ${dietData.portionGrams}г` : '')
      );
      break;
    }

    // ─── УДАЛИТЬ ИЗ РАСПИСАНИЯ ───
    case 'delete_schedule': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название события, которое вы хотите удалить.');
        return;
      }

      const allEvents = await prisma.scheduleEvent.findMany({
        where: { userId }
      });

      const dateFilter = intent.data.date;
      const events = allEvents
        .filter(e => {
          const matchQuery = e.title.toLowerCase().includes(query);
          if (!matchQuery) return false;
          if (dateFilter) {
            return utcToLocalDate(e.startTimeUTC, timezone) === dateFilter;
          }
          return true;
        })
        .slice(0, 5);

      if (events.length === 0) {
        await ctx.reply(`❌ Не нашел событий с "${intent.data.searchQuery}" в расписании${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      pendingDeletions.set(ctx.from!.id, {
        action: 'delete_schedule',
        data: { ids: events.map(e => e.id), query: intent.data.searchQuery || '' },
        expiresAt: Date.now() + 60 * 1000
      });

      const eventsList = events.map(e => `• ${e.title}`).join('\n');
      await ctx.reply(`🗑 Вы точно хотите удалить ${events.length} событие(й)?\n\n${eventsList}\n\nОтветьте «Да» или «Нет».`);
      break;
    }

    // ─── УДАЛИТЬ ИЗ ПЛАНА ───
    case 'delete_plan': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название задачи, которую вы хотите удалить.');
        return;
      }

      const allPlans = await prisma.plan.findMany({
        where: { userId, completed: false }
      });

      const dateFilter = intent.data.date;
      const plans = allPlans
        .filter(p => {
          const matchQuery = p.title.toLowerCase().includes(query);
          if (!matchQuery) return false;
          if (dateFilter) {
            return p.date === dateFilter || p.originalDate === dateFilter;
          }
          return true;
        })
        .slice(0, 10);

      if (plans.length === 0) {
        await ctx.reply(`❌ Не нашел задач с "${intent.data.searchQuery}" в планах${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      pendingDeletions.set(ctx.from!.id, {
        action: 'delete_plan',
        data: { ids: plans.map(p => p.id), query: intent.data.searchQuery || '' },
        expiresAt: Date.now() + 60 * 1000
      });

      const plansList = plans.map(p => `• ${p.title}`).join('\n');
      await ctx.reply(`🗑 Вы точно хотите удалить ${plans.length} задач(у)?\n\n${plansList}\n\nОтветьте «Да» или «Нет».`);
      break;
    }

    // ─── УДАЛИТЬ ИЗ РАЦИОНА ───
    case 'delete_diet': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название блюда, которое вы хотите удалить из рациона.');
        return;
      }

      const allEntries = await prisma.dietEntry.findMany({
        where: { userId }
      });

      const dateFilter = intent.data.date;
      const entries = allEntries
        .filter(e => {
          const matchQuery = e.name.toLowerCase().includes(query);
          if (!matchQuery) return false;
          if (dateFilter) {
            return e.date === dateFilter;
          }
          return true;
        })
        .slice(0, 5);

      if (entries.length === 0) {
        await ctx.reply(`❌ Не нашел записей с "${intent.data.searchQuery}" в рационе${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      pendingDeletions.set(ctx.from!.id, {
        action: 'delete_diet',
        data: { ids: entries.map(e => e.id), query: intent.data.searchQuery || '' },
        expiresAt: Date.now() + 60 * 1000
      });

      const entriesList = entries.map(e => `• ${e.name}`).join('\n');
      await ctx.reply(`🗑 Вы точно хотите удалить ${entries.length} запись(ей) о питании?\n\n${entriesList}\n\nОтветьте «Да» или «Нет».`);
      break;
    }

    // ─── РЕДАКТИРОВАТЬ РАСПИСАНИЕ ───
    case 'edit_schedule': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название события, которое вы хотите изменить.');
        return;
      }

      const allEvents = await prisma.scheduleEvent.findMany({
        where: { userId }
      });

      const dateFilter = intent.data.date;
      const event = allEvents.find(e => {
        const matchQuery = e.title.toLowerCase().includes(query);
        if (!matchQuery) return false;
        if (dateFilter) {
          return utcToLocalDate(e.startTimeUTC, timezone) === dateFilter;
        }
        return true;
      });

      if (!event) {
        await ctx.reply(`❌ Не нашел событие "${intent.data.searchQuery}"${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      const newData = intent.data.newData || {};
      const targetDate = newData.date || dateFilter || utcToLocalDate(event.startTimeUTC, timezone);
      const newStartStr = newData.startTime || utcToLocalTime(event.startTimeUTC, timezone);
      let newEndStr = newData.endTime;

      if (!newEndStr && newData.startTime) {
        // Вычисляем длительность старого события
        const originalDurationMs = event.endTimeUTC.getTime() - event.startTimeUTC.getTime();
        const newStartUTC = localTimeToUTC(targetDate, newStartStr, timezone);
        const newEndUTC = new Date(newStartUTC.getTime() + originalDurationMs);
        newEndStr = utcToLocalTime(newEndUTC, timezone);
      } else if (!newEndStr) {
        newEndStr = utcToLocalTime(event.endTimeUTC, timezone);
      }

      pendingEdits.set(ctx.from!.id, {
        action: 'edit_schedule',
        item: event,
        newData: {
          title: newData.title || event.title,
          targetDate,
          startTime: newStartStr,
          endTime: newEndStr
        },
        expiresAt: Date.now() + 60 * 1000
      });

      const changes: string[] = [];
      if (newData.title) changes.push(`название на "${newData.title}"`);
      if (newData.date) changes.push(`дату на ${newData.date}`);
      if (newData.startTime || newData.endTime) changes.push(`время на ${newStartStr}-${newEndStr}`);

      const changesText = changes.length > 0 ? changes.join(', ') : 'другие параметры';

      await ctx.reply(`✏️ Вы точно хотите изменить событие "${event.title}"?\nНовые данные: ${changesText}.\n\nОтветьте «Да» или «Нет».`);
      break;
    }

    // ─── РЕДАКТИРОВАТЬ ПЛАН ───
    case 'edit_plan': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название задачи, которую вы хотите изменить.');
        return;
      }

      const allPlans = await prisma.plan.findMany({
        where: { userId, completed: false }
      });

      const dateFilter = intent.data.date;
      const plan = allPlans.find(p => {
        const matchQuery = p.title.toLowerCase().includes(query);
        if (!matchQuery) return false;
        if (dateFilter) {
          return p.date === dateFilter || p.originalDate === dateFilter;
        }
        return true;
      });

      if (!plan) {
        await ctx.reply(`❌ Не нашел невыполненную задачу "${intent.data.searchQuery}"${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      const newData = intent.data.newData || {};
      pendingEdits.set(ctx.from!.id, {
        action: 'edit_plan',
        item: plan,
        newData,
        expiresAt: Date.now() + 60 * 1000
      });

      const changes: string[] = [];
      if (newData.title) changes.push(`название на "${newData.title}"`);
      if (newData.description) changes.push(`описание`);
      if (newData.date) changes.push(`дату на ${newData.date}`);

      const changesText = changes.length > 0 ? changes.join(', ') : 'другие параметры';

      await ctx.reply(`✏️ Вы точно хотите изменить задачу "${plan.title}"?\nНовые данные: ${changesText}.\n\nОтветьте «Да» или «Нет».`);
      break;
    }

    // ─── РЕДАКТИРОВАТЬ РАЦИОН ───
    case 'edit_diet': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название блюда, которое вы хотите изменить.');
        return;
      }

      const allEntries = await prisma.dietEntry.findMany({
        where: { userId }
      });

      const dateFilter = intent.data.date;
      const entry = allEntries.find(e => {
        const matchQuery = e.name.toLowerCase().includes(query);
        if (!matchQuery) return false;
        if (dateFilter) {
          return e.date === dateFilter;
        }
        return true;
      });

      if (!entry) {
        await ctx.reply(`❌ Не нашел блюдо "${intent.data.searchQuery}"${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      const newData = intent.data.newData || {};
      pendingEdits.set(ctx.from!.id, {
        action: 'edit_diet',
        item: entry,
        newData,
        expiresAt: Date.now() + 60 * 1000
      });

      const changes: string[] = [];
      if (newData.name) changes.push(`название на "${newData.name}"`);
      if (newData.portionGrams) changes.push(`порцию на ${newData.portionGrams}г`);
      if (newData.calories) changes.push(`калории на ${newData.calories}`);
      if (newData.date) changes.push(`дату на ${newData.date}`);

      const changesText = changes.length > 0 ? changes.join(', ') : 'другие параметры';

      await ctx.reply(`✏️ Вы точно хотите изменить блюдо "${entry.name}"?\nНовые данные: ${changesText}.\n\nОтветьте «Да» или «Нет».`);
      break;
    }

    // ─── ОТМЕТИТЬ ПЛАН ВЫПОЛНЕННЫМ ───
    case 'complete_plan': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название задачи, которую вы хотите отметить выполненной.');
        return;
      }

      const allPlans = await prisma.plan.findMany({
        where: { userId, completed: false }
      });

      const dateFilter = intent.data.date;
      const plan = allPlans.find(p => {
        const matchQuery = p.title.toLowerCase().includes(query);
        if (!matchQuery) return false;
        if (dateFilter) {
          return p.date === dateFilter || p.originalDate === dateFilter;
        }
        return true;
      });

      if (!plan) {
        await ctx.reply(`❌ Не нашел невыполненную задачу "${intent.data.searchQuery}"${dateFilter ? ` на дату ${dateFilter}` : ''}.`);
        return;
      }

      const now = new Date();
      if (plan.groupId) {
        await prisma.plan.updateMany({
          where: { groupId: plan.groupId },
          data: {
            completed: true,
            completedAt: now
          }
        });
      } else {
        await prisma.plan.update({
          where: { id: plan.id },
          data: {
            completed: true,
            completedAt: now
          }
        });
      }

      await ctx.reply(`✅ Задача "${plan.title}" отмечена как выполненная! 🎉`);
      break;
    }

    // ─── ПЕРЕНЕСТИ ЗАДАЧУ ───
    case 'postpone_plan': {
      const query = (intent.data.searchQuery || '').trim().toLowerCase();
      if (!query) {
        await ctx.reply('❌ Пожалуйста, уточните название задачи, которую вы хотите перенести.');
        return;
      }

      const allPlans = await prisma.plan.findMany({
        where: { userId, completed: false }
      });

      const plan = allPlans.find(p => p.title.toLowerCase().includes(query));

      if (!plan) {
        await ctx.reply(`❌ Не нашел невыполненную задачу "${intent.data.searchQuery}".`);
        return;
      }

      let groupId = plan.groupId;
      if (!groupId) {
        groupId = crypto.randomUUID();
        await prisma.plan.update({
          where: { id: plan.id },
          data: { groupId }
        });
      }

      const targetDate = intent.data.targetDate || addDaysToDateStr(getTodayDateInTz(timezone), 1);

      const existing = await prisma.plan.findFirst({
        where: { groupId, date: targetDate }
      });

      if (!existing) {
        await prisma.plan.create({
          data: {
            userId: plan.userId,
            title: plan.title,
            description: plan.description,
            date: targetDate,
            originalDate: plan.originalDate,
            groupId: groupId,
            completed: false
          }
        });
      }

      await ctx.reply(`✅ Задача "${plan.title}" перенесена на ${targetDate}, но она также осталась в списке на сегодня как невыполненная.`);
      break;
    }

    // ─── ОБНОВИТЬ ЧАСОВОЙ ПОЯС ───
    case 'update_timezone': {
      const newTz = intent.data.timezone || '';
      if (!isValidTimezone(newTz)) {
        await ctx.reply(`❌ Не могу распознать часовой пояс "${newTz}". Попробуйте уточнить город.`);
        return;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { timezone: newTz }
      });

      await ctx.reply(`🌍 Часовой пояс обновлен! Теперь: ${intent.data.city || newTz}\n\nВсе напоминания перенастроены.`);
      break;
    }

    // ─── ПОЛУЧИТЬ ИСТОРИЮ / ТЕКУЩИЕ ДАННЫЕ ───
    case 'get_history': {
      const targetDate = intent.data.date;
      const startDate = intent.data.startDate;
      const endDate = intent.data.endDate;
      const allTime = intent.data.allTime;
      const completedFilter = intent.data.completed;
      const searchQuery = (intent.data.searchQuery || '').trim();
      const queryType = intent.data.type || 'all';

      const todayStr = getTodayDateInTz(timezone);

      // 1. Фильтр по датам для DietEntry
      let dateFilterDiet: string | Prisma.StringFilter | undefined = undefined;
      if (startDate && endDate) {
        dateFilterDiet = { gte: startDate, lte: endDate };
      } else if (startDate) {
        dateFilterDiet = { gte: startDate };
      } else if (endDate) {
        dateFilterDiet = { lte: endDate };
      } else if (targetDate) {
        dateFilterDiet = targetDate as string;
      }

      // 2. Фильтр по датам для ScheduleEvent (в UTC)
      let startTimeUTCFilter: Prisma.DateTimeFilter | undefined = undefined;
      if (startDate || endDate || targetDate) {
        startTimeUTCFilter = {};
        if (startDate) {
          startTimeUTCFilter.gte = localTimeToUTC(startDate, '00:00', timezone);
        }
        if (endDate) {
          startTimeUTCFilter.lt = localTimeToUTC(addDaysToDateStr(endDate, 1), '00:00', timezone);
        }
        if (targetDate) {
          startTimeUTCFilter.gte = localTimeToUTC(targetDate, '00:00', timezone);
          startTimeUTCFilter.lt = localTimeToUTC(addDaysToDateStr(targetDate, 1), '00:00', timezone);
        }
      } else if (!searchQuery && !allTime) {
        // Если дат нет, поиска нет, и не allTime:
        // По умолчанию загружаем события от вчерашнего дня до +30 дней вперед.
        // Это позволит ИИ отвечать на вопросы о сегодняшних, завтрашних и ближайших событиях.
        const yesterday = addDaysToDateStr(todayStr, -1);
        const farFuture = addDaysToDateStr(todayStr, 30);
        startTimeUTCFilter = {
          gte: localTimeToUTC(yesterday, '00:00', timezone),
          lt: localTimeToUTC(farFuture, '23:59', timezone)
        };
      }

      // 3. Загружаем планы с учетом бэклога невыполненных задач
      let plans: Plan[] = [];
      if (queryType === 'plans' || queryType === 'all') {
        const whereClause: Prisma.PlanWhereInput = { userId };
        
        if (startDate || endDate || targetDate || allTime || searchQuery) {
          // Если есть явный поиск, диапазон дат или запрос на всё время
          if (startDate && endDate) {
            whereClause.date = { gte: startDate, lte: endDate };
          } else if (startDate) {
            whereClause.date = { gte: startDate };
          } else if (endDate) {
            whereClause.date = { lte: endDate };
          } else if (targetDate) {
            whereClause.date = targetDate;
          }
          if (completedFilter !== undefined) {
            whereClause.completed = completedFilter;
          }
          const rawPlans = await prisma.plan.findMany({
            where: whereClause,
            orderBy: { date: 'asc' }
          });
          if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            plans = rawPlans.filter(p => 
              p.title.toLowerCase().includes(lowerQuery) || 
              (p.description && p.description.toLowerCase().includes(lowerQuery))
            );
          } else {
            plans = rawPlans;
          }
        } else {
          // Если запрос без конкретных дат (например, "какие у меня планы?", "список дел")
          // Загружаем сегодняшние планы И все невыполненные планы из прошлого/будущего
          const plansClause: Prisma.PlanWhereInput = {
            userId,
            OR: [
              { date: todayStr }, // Всё за сегодня
              { completed: false } // Все невыполненные за любое время
            ]
          };
          if (completedFilter !== undefined) {
            // Если пользователь явно спросил только про выполненные/невыполненные
            if (completedFilter === true) {
              // Только выполненные за сегодня
              plansClause.OR = undefined;
              plansClause.date = todayStr;
              plansClause.completed = true;
            } else {
              // Только невыполненные за всё время
              plansClause.OR = undefined;
              plansClause.completed = false;
            }
          }
          plans = await prisma.plan.findMany({
            where: plansClause,
            orderBy: { date: 'asc' }
          });
        }
      }

      // 4. Загружаем расписание
      interface MappedScheduleEvent {
        id: number;
        title: string;
        description: string | null;
        date: string;
        startTime: string;
        endTime: string;
      }
      let events: MappedScheduleEvent[] = [];
      if (queryType === 'schedule' || queryType === 'all') {
        const whereClause: Prisma.ScheduleEventWhereInput = { userId };
        if (startTimeUTCFilter) {
          whereClause.startTimeUTC = startTimeUTCFilter;
        }
        const rawEvents = await prisma.scheduleEvent.findMany({
          where: whereClause,
          orderBy: { startTimeUTC: 'asc' }
        });

        const mappedEvents = rawEvents.map(e => ({
          id: e.id,
          title: e.title,
          description: e.description,
          date: utcToLocalDate(e.startTimeUTC, timezone),
          startTime: utcToLocalTime(e.startTimeUTC, timezone),
          endTime: utcToLocalTime(e.endTimeUTC, timezone)
        }));

        if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase();
          events = mappedEvents.filter(e =>
            e.title.toLowerCase().includes(lowerQuery) ||
            (e.description && e.description.toLowerCase().includes(lowerQuery))
          );
        } else {
          events = mappedEvents;
        }
      }

      // 5. Загружаем рацион питания
      let dietEntries: DietEntry[] = [];
      if (queryType === 'diet' || queryType === 'all') {
        const whereClause: Prisma.DietEntryWhereInput = { userId };
        if (startDate || endDate || targetDate || allTime || searchQuery) {
          if (dateFilterDiet) {
            whereClause.date = dateFilterDiet;
          }
          const rawDiet = await prisma.dietEntry.findMany({
            where: whereClause,
            orderBy: { date: 'asc' }
          });
          if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            dietEntries = rawDiet.filter(d =>
              d.name.toLowerCase().includes(lowerQuery)
            );
          } else {
            dietEntries = rawDiet;
          }
        } else {
          // Если запрос без конкретных дат (например, "что я ел?", "покажи рацион")
          // По умолчанию загружаем за сегодня и вчера
          const yesterdayStr = addDaysToDateStr(todayStr, -1);
          dietEntries = await prisma.dietEntry.findMany({
            where: {
              userId,
              date: { in: [todayStr, yesterdayStr] }
            },
            orderBy: { date: 'asc' }
          });
        }
      }

      // 6. Загружаем профиль питания
      const nutritionProfile = await prisma.nutritionProfile.findUnique({
        where: { userId }
      });

      // Сводные данные
      const historyData = {
        plans: plans.map(p => ({
          title: p.title,
          description: p.description,
          date: p.date,
          completed: p.completed,
          completedAt: p.completedAt
        })),
        schedule: events,
        diet: dietEntries.map(d => ({
          name: d.name,
          mealType: d.mealType,
          date: d.date,
          calories: d.calories,
          protein: d.protein,
          fat: d.fat,
          carbs: d.carbs,
          portionGrams: d.portionGrams
        })),
        nutritionProfile: nutritionProfile ? {
          dailyCalories: nutritionProfile.dailyCalories,
          dailyProtein: nutritionProfile.dailyProtein,
          dailyFat: nutritionProfile.dailyFat,
          dailyCarbs: nutritionProfile.dailyCarbs,
          goal: nutritionProfile.goal
        } : null,
        meta: {
          date: targetDate,
          startDate,
          endDate,
          searchQuery,
          type: queryType
        }
      };

      await ctx.sendChatAction('typing');

      const userQuery = (ctx.message && 'text' in ctx.message)
        ? ctx.message.text
        : (intent.userQueryText || `Покажи данные за ${targetDate || (startDate && endDate ? `${startDate} — ${endDate}` : '') || 'выбранный период'}`);

      const currentDatetime = getCurrentDatetimeInTz(timezone);
      const answer = await generateHistoryResponse(userQuery, historyData, timezone, currentDatetime);

      await ctx.reply(answer, { parse_mode: 'Markdown' });
      break;
    }

    // ─── НЕИЗВЕСТНЫЙ ЗАПРОС ───
    default:
      await ctx.reply(intent.confirmationMessage || '🤔 Не совсем понял запрос. Попробуйте сформулировать иначе.');
  }
}

/**
 * Создание и настройка бота
 */
export function createBot(): Telegraf {
  const bot = new Telegraf(process.env.BOT_TOKEN || '');

  // Устанавливаем кнопку меню слева от поля ввода
  bot.telegram.setChatMenuButton({
    menuButton: {
      type: 'web_app',
      text: 'RoutineBot',
      web_app: { url: process.env.FRONTEND_URL || 'https://routinebot.local' }
    }
  }).catch(console.error);

  // Применяем авторизацию ко всем сообщениям
  bot.use(authMiddleware);

  // Глобальный обработчик ошибок
  bot.catch((err, ctx) => {
    console.error('Error for %s', ctx.updateType, err);
    try {
      ctx.reply('❌ Произошла непредвиденная ошибка. Попробуйте позже.');
    } catch (e) {
      console.error('Error sending fallback message:', e);
    }
  });

  bot.start(async (ctx) => {
    await ensureUser(ctx.from.id, ctx.from.first_name, ctx.from.last_name);
    await ctx.reply(
      `👋 Привет, ${ctx.from.first_name}!\n\n` +
      `Я — твой персональный RoutineBot 🤖\n\n` +
      `📅 **Расписание** — события с привязкой ко времени\n` +
      `📋 **План** — задачи на день (To-Do)\n` +
      `🍽 **Рацион** — дневник питания с КБЖУ\n\n` +
      `Просто отправь мне голосовое или текстовое сообщение, и я всё запишу!\n\n` +
      `Примеры:\n` +
      `🎤 "Поставь совещание завтра в 15:00"\n` +
      `🎤 "Мои планы на сегодня: сходить в магазин, позвонить маме"\n` +
      `📸 Отправь фото еды — я посчитаю КБЖУ`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.webApp('📱 Открыть приложение', process.env.FRONTEND_URL || 'https://routinebot.local')
        ])
      }
    );
  });

  // ─── Обработка текстовых сообщений ───
  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text;
    const tgId = ctx.from.id;

    // Проверяем, не ожидаем ли подтверждения удаления
    const pending = pendingDeletions.get(tgId);
    if (pending) {
      if (Date.now() >= pending.expiresAt) {
        pendingDeletions.delete(tgId);
      } else {
        const answer = text.toLowerCase().trim();

        if (answer === 'да' || answer === 'yes') {
          pendingDeletions.delete(tgId);

          // Выполняем удаление
          if (pending.action === 'delete_schedule') {
            const dbUser = await ensureUser(tgId);
            const eventsToDelete = await prisma.scheduleEvent.findMany({
              where: { id: { in: pending.data.ids } }
            });
            for (const ev of eventsToDelete) {
              if (ev.googleEventId) {
                await deleteGoogleCalendarEvent(dbUser.id, ev.googleEventId);
              }
            }
            await prisma.scheduleEvent.deleteMany({ where: { id: { in: pending.data.ids } } });
            await ctx.reply(`✅ Удалено ${pending.data.ids.length} событие(й) из расписания.`);
          } else if (pending.action === 'delete_plan') {
            await prisma.plan.deleteMany({ where: { id: { in: pending.data.ids } } });
            await ctx.reply(`✅ Удалено ${pending.data.ids.length} задач(а) из плана.`);
          } else if (pending.action === 'delete_diet') {
            await prisma.dietEntry.deleteMany({ where: { id: { in: pending.data.ids } } });
            await ctx.reply(`✅ Удалено ${pending.data.ids.length} записей о питании.`);
          }
          return;
        } else if (answer === 'нет' || answer === 'no') {
          pendingDeletions.delete(tgId);
          await ctx.reply('👌 Хорошо, ничего не удаляю.');
          return;
        } else {
          pendingDeletions.delete(tgId);
        }
      }
    }

    // Проверяем, не ожидаем ли подтверждения редактирования
    const pendingEdit = pendingEdits.get(tgId);
    if (pendingEdit) {
      if (Date.now() >= pendingEdit.expiresAt) {
        pendingEdits.delete(tgId);
      } else {
        const answer = text.toLowerCase().trim();

        if (answer === 'да' || answer === 'yes') {
          pendingEdits.delete(tgId);
          const user = await ensureUser(tgId);

          if (pendingEdit.action === 'edit_schedule') {
            const title = pendingEdit.newData.title || '';
            const targetDate = pendingEdit.newData.targetDate || getTodayDateInTz(user.timezone);
            const startTime = pendingEdit.newData.startTime || '00:00';
            const endTime = pendingEdit.newData.endTime || '00:00';
            const endTimeDate = endTime < startTime ? addDaysToDateStr(targetDate, 1) : targetDate;
            const startTimeUTC = localTimeToUTC(targetDate, startTime, user.timezone);
            const endTimeUTC = localTimeToUTC(endTimeDate, endTime, user.timezone);

            const now = new Date();
            const msUntilStart = startTimeUTC.getTime() - now.getTime();
            const minutesUntilStart = msUntilStart / 1000 / 60;
            const reminded150 = minutesUntilStart <= 150;
            const reminded60 = minutesUntilStart <= 60;

            const updatedEvent = await prisma.scheduleEvent.update({
              where: { id: pendingEdit.item.id },
              data: { 
                title, 
                startTimeUTC, 
                endTimeUTC,
                reminded150,
                reminded60
              }
            });

            // Синхронизация с Google Календарем
            if (updatedEvent.googleEventId) {
              await updateGoogleCalendarEvent(user.id, updatedEvent.googleEventId, {
                title: updatedEvent.title,
                description: updatedEvent.description,
                startTimeUTC: updatedEvent.startTimeUTC,
                endTimeUTC: updatedEvent.endTimeUTC
              });
            } else {
              const googleEventId = await createGoogleCalendarEvent(user.id, {
                title: updatedEvent.title,
                description: updatedEvent.description,
                startTimeUTC: updatedEvent.startTimeUTC,
                endTimeUTC: updatedEvent.endTimeUTC
              });
              if (googleEventId) {
                await prisma.scheduleEvent.update({
                  where: { id: updatedEvent.id },
                  data: { googleEventId }
                });
              }
            }

            await ctx.reply(`✅ Событие успешно изменено.`);
          } else if (pendingEdit.action === 'edit_plan') {
            await prisma.plan.update({
              where: { id: pendingEdit.item.id },
              data: {
                title: pendingEdit.newData.title || undefined,
                description: pendingEdit.newData.description !== undefined ? pendingEdit.newData.description : undefined,
                date: pendingEdit.newData.date || undefined
              }
            });
            await ctx.reply(`✅ Задача успешно изменена.`);
          } else if (pendingEdit.action === 'edit_diet') {
            await prisma.dietEntry.update({
              where: { id: pendingEdit.item.id },
              data: {
                name: pendingEdit.newData.name || undefined,
                calories: pendingEdit.newData.calories !== undefined ? pendingEdit.newData.calories : undefined,
                protein: pendingEdit.newData.protein !== undefined ? pendingEdit.newData.protein : undefined,
                fat: pendingEdit.newData.fat !== undefined ? pendingEdit.newData.fat : undefined,
                carbs: pendingEdit.newData.carbs !== undefined ? pendingEdit.newData.carbs : undefined,
                portionGrams: pendingEdit.newData.portionGrams !== undefined ? pendingEdit.newData.portionGrams : undefined,
                date: pendingEdit.newData.date || undefined
              }
            });
            await ctx.reply(`✅ Запись о питании успешно изменена.`);
          }
          return;
        } else if (answer === 'нет' || answer === 'no') {
          pendingEdits.delete(tgId);
          await ctx.reply('👌 Хорошо, отменяю изменения.');
          return;
        } else {
          pendingEdits.delete(tgId);
        }
      }
    }

    // Проверяем, не ожидаем ли размера порции
    const pendingPortion = pendingPortions.get(tgId);
    if (pendingPortion) {
      if (Date.now() >= pendingPortion.expiresAt) {
        pendingPortions.delete(tgId);
      } else {
        // eslint-disable-next-line security/detect-unsafe-regex
        const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(?:г|грамм|g|gram)?$/i);
        if (match) {
          const grams = parseFloat(match[1]);
          if (grams > 0) {
            pendingPortions.delete(tgId);

            const user = await ensureUser(tgId);
            const targetDate = getTodayDateInTz(user.timezone);

            // Пересчитываем КБЖУ пропорционально порции
            const dietData = pendingPortion.dietData;
            const calories = dietData.calories || 0;
            const protein = dietData.protein || 0;
            const fat = dietData.fat || 0;
            const carbs = dietData.carbs || 0;
            const scaleFactor = grams / (dietData.portionGrams || 100);

            await prisma.dietEntry.create({
              data: {
                userId: user.id,
                name: dietData.name || 'Неизвестное блюдо',
                mealType: dietData.mealType || 'snack',
                date: targetDate,
                calories: Math.round(calories * scaleFactor),
                protein: Math.round(protein * scaleFactor * 10) / 10,
                fat: Math.round(fat * scaleFactor * 10) / 10,
                carbs: Math.round(carbs * scaleFactor * 10) / 10,
                portionGrams: grams,
                photoFileId: dietData.photoFileId || null
              }
            });

            await ctx.reply(
              `✅ Записано в рацион!\n\n` +
              `🍽 ${dietData.name || 'Неизвестное блюдо'}\n` +
              `⚖️ Порция: ${grams}г\n` +
              `📊 ${Math.round(calories * scaleFactor)} ккал | Б: ${Math.round(protein * scaleFactor)}г | Ж: ${Math.round(fat * scaleFactor)}г | У: ${Math.round(carbs * scaleFactor)}г`
            );
            return;
          }
        }
        pendingPortions.delete(tgId);
      }
    }

    // Обычная обработка текста через ИИ
    const user = await ensureUser(tgId, ctx.from.first_name, ctx.from.last_name);
    const currentDatetime = getCurrentDatetimeInTz(user.timezone);

    await ctx.sendChatAction('typing');

    try {
      const intent = await processTextMessage(text, user.timezone, currentDatetime);
      await handleAIIntent(ctx, intent, user);
    } catch (error) {
      console.error('Error processing text:', error);
      await ctx.reply('❌ Произошла ошибка при обработке сообщения. Попробуйте ещё раз.');
    }
  });

  // ─── Обработка голосовых сообщений ───
  bot.on(message('voice'), async (ctx) => {
    const tgId = ctx.from.id;
    const user = await ensureUser(tgId, ctx.from.first_name, ctx.from.last_name);
    const currentDatetime = getCurrentDatetimeInTz(user.timezone);

    await ctx.sendChatAction('typing');

    try {
      // Скачиваем аудиофайл
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const response = await fetch(fileLink.toString());
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      // 1. Проверяем, не ожидаем ли подтверждения удаления
      const pending = pendingDeletions.get(tgId);
      if (pending) {
        if (Date.now() >= pending.expiresAt) {
          pendingDeletions.delete(tgId);
        } else {
          const answer = await transcribeYesNo(audioBuffer);
          if (answer === 'yes') {
            pendingDeletions.delete(tgId);
            if (pending.action === 'delete_schedule') {
              const dbUser = await ensureUser(tgId);
              const eventsToDelete = await prisma.scheduleEvent.findMany({
                where: { id: { in: pending.data.ids } }
              });
              for (const ev of eventsToDelete) {
                if (ev.googleEventId) {
                  await deleteGoogleCalendarEvent(dbUser.id, ev.googleEventId);
                }
              }
              await prisma.scheduleEvent.deleteMany({ where: { id: { in: pending.data.ids } } });
              await ctx.reply(`✅ Удалено ${pending.data.ids.length} событие(й) из расписания.`);
            } else if (pending.action === 'delete_plan') {
              await prisma.plan.deleteMany({ where: { id: { in: pending.data.ids } } });
              await ctx.reply(`✅ Удалено ${pending.data.ids.length} задач(а) из плана.`);
            } else if (pending.action === 'delete_diet') {
              await prisma.dietEntry.deleteMany({ where: { id: { in: pending.data.ids } } });
              await ctx.reply(`✅ Удалено ${pending.data.ids.length} записей о питании.`);
            }
            return;
          } else if (answer === 'no') {
            pendingDeletions.delete(tgId);
            await ctx.reply('👌 Хорошо, ничего не удаляю.');
            return;
          } else {
            pendingDeletions.delete(tgId);
          }
        }
      }

      // 2. Проверяем, не ожидаем ли подтверждения редактирования
      const pendingEdit = pendingEdits.get(tgId);
      if (pendingEdit) {
        if (Date.now() >= pendingEdit.expiresAt) {
          pendingEdits.delete(tgId);
        } else {
          const answer = await transcribeYesNo(audioBuffer);
          if (answer === 'yes') {
            pendingEdits.delete(tgId);
            const user = await ensureUser(tgId);

            if (pendingEdit.action === 'edit_schedule') {
              const title = pendingEdit.newData.title || '';
              const targetDate = pendingEdit.newData.targetDate || getTodayDateInTz(user.timezone);
              const startTime = pendingEdit.newData.startTime || '00:00';
              const endTime = pendingEdit.newData.endTime || '00:00';
              const startTimeUTC = localTimeToUTC(targetDate, startTime, user.timezone);
              const endTimeUTC = localTimeToUTC(targetDate, endTime, user.timezone);

              const now = new Date();
              const msUntilStart = startTimeUTC.getTime() - now.getTime();
              const minutesUntilStart = msUntilStart / 1000 / 60;
              const reminded150 = minutesUntilStart <= 150;
              const reminded60 = minutesUntilStart <= 60;

              const updatedEvent = await prisma.scheduleEvent.update({
                where: { id: pendingEdit.item.id },
                data: { 
                  title, 
                  startTimeUTC, 
                  endTimeUTC,
                  reminded150,
                  reminded60
                }
              });

              // Синхронизация с Google Календарем
              if (updatedEvent.googleEventId) {
                await updateGoogleCalendarEvent(user.id, updatedEvent.googleEventId, {
                  title: updatedEvent.title,
                  description: updatedEvent.description,
                  startTimeUTC: updatedEvent.startTimeUTC,
                  endTimeUTC: updatedEvent.endTimeUTC
                });
              } else {
                const googleEventId = await createGoogleCalendarEvent(user.id, {
                  title: updatedEvent.title,
                  description: updatedEvent.description,
                  startTimeUTC: updatedEvent.startTimeUTC,
                  endTimeUTC: updatedEvent.endTimeUTC
                });
                if (googleEventId) {
                  await prisma.scheduleEvent.update({
                    where: { id: updatedEvent.id },
                    data: { googleEventId }
                  });
                }
              }

              await ctx.reply(`✅ Событие успешно изменено.`);
            } else if (pendingEdit.action === 'edit_plan') {
              await prisma.plan.update({
                where: { id: pendingEdit.item.id },
                data: {
                  title: pendingEdit.newData.title || undefined,
                  description: pendingEdit.newData.description !== undefined ? pendingEdit.newData.description : undefined,
                  date: pendingEdit.newData.date || undefined
                }
              });
              await ctx.reply(`✅ Задача успешно изменена.`);
            } else if (pendingEdit.action === 'edit_diet') {
              await prisma.dietEntry.update({
                where: { id: pendingEdit.item.id },
                data: {
                  name: pendingEdit.newData.name || undefined,
                  calories: pendingEdit.newData.calories !== undefined ? pendingEdit.newData.calories : undefined,
                  protein: pendingEdit.newData.protein !== undefined ? pendingEdit.newData.protein : undefined,
                  fat: pendingEdit.newData.fat !== undefined ? pendingEdit.newData.fat : undefined,
                  carbs: pendingEdit.newData.carbs !== undefined ? pendingEdit.newData.carbs : undefined,
                  portionGrams: pendingEdit.newData.portionGrams !== undefined ? pendingEdit.newData.portionGrams : undefined,
                  date: pendingEdit.newData.date || undefined
                }
              });
              await ctx.reply(`✅ Запись о питании успешно изменена.`);
            }
            return;
          } else if (answer === 'no') {
            pendingEdits.delete(tgId);
            await ctx.reply('👌 Хорошо, отменяю изменения.');
            return;
          } else {
            pendingEdits.delete(tgId);
          }
        }
      }

      // 2. Проверяем, не ожидаем ли размера порции
      const pendingPortion = pendingPortions.get(tgId);
      if (pendingPortion) {
        if (Date.now() >= pendingPortion.expiresAt) {
          pendingPortions.delete(tgId);
        } else {
          const grams = await extractGramsFromVoice(audioBuffer);
          if (grams && grams > 0) {
            pendingPortions.delete(tgId);
            const targetDate = getTodayDateInTz(user.timezone);
            const dietData = pendingPortion.dietData;
            const calories = dietData.calories || 0;
            const protein = dietData.protein || 0;
            const fat = dietData.fat || 0;
            const carbs = dietData.carbs || 0;
            const scaleFactor = grams / (dietData.portionGrams || 100);

            await prisma.dietEntry.create({
              data: {
                userId: user.id,
                name: dietData.name || 'Неизвестное блюдо',
                mealType: dietData.mealType || 'snack',
                date: targetDate,
                calories: Math.round(calories * scaleFactor),
                protein: Math.round(protein * scaleFactor * 10) / 10,
                fat: Math.round(fat * scaleFactor * 10) / 10,
                carbs: Math.round(carbs * scaleFactor * 10) / 10,
                portionGrams: grams,
                photoFileId: dietData.photoFileId || null
              }
            });

            await ctx.reply(
              `✅ Записано в рацион!\n\n` +
              `🍽 ${dietData.name || 'Неизвестное блюдо'}\n` +
              `⚖️ Порция: ${grams}г\n` +
              `📊 ${Math.round(calories * scaleFactor)} ккал | Б: ${Math.round(protein * scaleFactor)}г | Ж: ${Math.round(fat * scaleFactor)}г | У: ${Math.round(carbs * scaleFactor)}г`
            );
            return;
          } else {
            pendingPortions.delete(tgId);
          }
        }
      }

      const intent = await processVoiceMessage(audioBuffer, user.timezone, currentDatetime);
      await handleAIIntent(ctx, intent, user);
    } catch (error) {
      console.error('Error processing voice:', error);
      await ctx.reply('❌ Произошла ошибка при обработке голосового сообщения. Попробуйте ещё раз.');
    }
  });

  // ─── Обработка фото (рацион) ───
  bot.on(message('photo'), async (ctx) => {
    const user = await ensureUser(ctx.from.id, ctx.from.first_name, ctx.from.last_name);
    const currentDatetime = getCurrentDatetimeInTz(user.timezone);

    await ctx.sendChatAction('typing');

    try {
      // Берем фото максимального разрешения
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(fileLink.toString());
      const photoBuffer = Buffer.from(await response.arrayBuffer());

      const caption = ctx.message.caption;
      const dietAnalysis = await analyzePhotoForDiet(photoBuffer, caption, user.timezone, currentDatetime);

      // Если ИИ уверен в порции (фото), записываем сразу
      if (!dietAnalysis.needsPortionClarification) {
        const targetDate = getTodayDateInTz(user.timezone);
        await prisma.dietEntry.create({
          data: {
            userId: user.id,
            name: dietAnalysis.name,
            mealType: dietAnalysis.mealType,
            date: targetDate,
            calories: dietAnalysis.calories,
            protein: dietAnalysis.protein,
            fat: dietAnalysis.fat,
            carbs: dietAnalysis.carbs,
            portionGrams: dietAnalysis.portionGrams,
            photoFileId: photo.file_id
          }
        });

        await ctx.reply(
          `✅ Записано в рацион!\n\n` +
          `🍽 ${dietAnalysis.name}\n` +
          `📊 ${Math.round(dietAnalysis.calories)} ккал | Б: ${Math.round(dietAnalysis.protein)}г | Ж: ${Math.round(dietAnalysis.fat)}г | У: ${Math.round(dietAnalysis.carbs)}г` +
          (dietAnalysis.portionGrams ? `\n⚖️ Порция: ~${dietAnalysis.portionGrams}г` : '')
        );
      } else {
        pendingPortions.set(ctx.from.id, {
          dietData: { ...dietAnalysis, photoFileId: photo.file_id },
          expiresAt: Date.now() + 5 * 60 * 1000
        });

        await ctx.reply(`🍽 Я определил блюдо: "${dietAnalysis.name}"\n\nПожалуйста, укажите размер порции (в граммах), чтобы я мог точно рассчитать КБЖУ.`);
      }
    } catch (error) {
      console.error('Error processing photo:', error);
      await ctx.reply('❌ Произошла ошибка при обработке фотографии. Попробуйте ещё раз.');
    }
  });

  return bot;
}
