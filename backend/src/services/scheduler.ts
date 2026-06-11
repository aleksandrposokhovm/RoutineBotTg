/**
 * Система ежедневных напоминаний и крон-задач
 *
 * Расписание (по локальному времени пользователя):
 * 09:00 — "Какие планы на сегодня?"
 * 10:00 — "Не забудь заполнить рацион завтрака"
 * 15:00 — "Не забудь заполнить рацион обеда"
 * 22:30 — Саммари дня (выполнено/не выполнено)
 * 23:00 — "Не забудь заполнить рацион ужина"
 *
 * + Умные напоминания расписания: за 2.5 часа и за 1 час до события
 */

import { Telegraf } from 'telegraf';
import crypto from 'crypto';
import prisma from '../db';
import { getTodayDateInTz, getCurrentHourInTz, utcToLocalTime, addDaysToDateStr } from './timezone';

let reminderInterval: ReturnType<typeof setInterval> | null = null;
const sentReminders = new Set<string>();

/**
 * Отправить сообщение пользователю
 */
async function sendMessage(bot: Telegraf, telegramId: bigint, text: string) {
  try {
    await bot.telegram.sendMessage(telegramId.toString(), text, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(`Failed to send message to ${telegramId}:`, error);
  }
}

/**
 * Проверяет, было ли напоминание уже отправлено, и регистрирует его.
 * Также очищает старые записи за предыдущие дни.
 */
function shouldSendReminder(userId: number, hour: number, minute: number, today: string): boolean {
  for (const key of sentReminders) {
    if (!key.endsWith(today)) {
      sentReminders.delete(key);
    }
  }

  const key = `${userId}:${hour}:${minute}:${today}`;
  if (sentReminders.has(key)) {
    return false;
  }
  sentReminders.add(key);
  return true;
}

/**
 * Проверить и отправить ежедневные напоминания
 */
async function checkDailyReminders(bot: Telegraf) {
  const users = await prisma.user.findMany();

  for (const user of users) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: user.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      hourCycle: 'h23'
    }).formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);

    const today = getTodayDateInTz(user.timezone);

    // 09:00 — Запрос планов
    if (hour === 9 && minute === 0) {
      if (shouldSendReminder(user.id, 9, 0, today)) {
        const unfinished = await prisma.plan.findMany({
          where: { userId: user.id, completed: false, date: { lte: today } }
        });

        let msg = '☀️ *Доброе утро!*\n\n';

        if (unfinished.length > 0) {
          msg += `📋 У вас ${unfinished.length} невыполненных задач:\n`;
          for (const plan of unfinished) {
            const fromPast = plan.date !== today ? ` _(с ${plan.originalDate})_` : '';
            msg += `• ${plan.title}${fromPast}\n`;
          }
          msg += '\n';
        }

        msg += '🎯 Это напоминание о планах на сегодня. Напиши или надиктуй их, когда будет удобно!';

        await sendMessage(bot, user.telegramId, msg);
      }
    }

    // 10:00 — Завтрак
    if (hour === 10 && minute === 0) {
      if (shouldSendReminder(user.id, 10, 0, today)) {
        await sendMessage(bot, user.telegramId, '🥐 Напоминание: не забудь добавить свой *завтрак* в рацион!\n\nПросто отправь фото или напиши, что ел, в любое удобное время.');
      }
    }

    // 15:00 — Обед
    if (hour === 15 && minute === 0) {
      if (shouldSendReminder(user.id, 15, 0, today)) {
        await sendMessage(bot, user.telegramId, '🍲 Напоминание: не забудь добавить свой *обед* в рацион!\n\nПросто отправь фото или напиши, что ел, в любое удобное время.');
      }
    }

    // 22:30 — Вечернее саммари
    if (hour === 22 && minute === 30) {
      if (shouldSendReminder(user.id, 22, 30, today)) {
        const allPlans = await prisma.plan.findMany({
          where: { userId: user.id, date: today }
        });

        const completed = allPlans.filter(p => p.completed);
        const incomplete = allPlans.filter(p => !p.completed);

        let msg = '🌙 *Итоги дня*\n\n';
        msg += `✅ Выполнено: ${completed.length} из ${allPlans.length}\n\n`;

        if (completed.length > 0) {
          msg += '*Сделано:*\n';
          for (const p of completed) {
            msg += `  ✅ ${p.title}\n`;
          }
          msg += '\n';
        }

        if (incomplete.length > 0) {
          msg += '*Не успели:*\n';
          for (const p of incomplete) {
            msg += `  ⏳ ${p.title} _(перенесётся на завтра)_\n`;
          }
        }

        if (allPlans.length === 0) {
          msg += '📭 На сегодня задач не было.';
        }

        await sendMessage(bot, user.telegramId, msg);
      }
    }

    // 23:00 — Ужин
    if (hour === 23 && minute === 0) {
      if (shouldSendReminder(user.id, 23, 0, today)) {
        await sendMessage(bot, user.telegramId, '🥗 Напоминание: не забудь добавить свой *ужин* в рацион!\n\nПросто отправь фото или напиши, что ел, в любое удобное время.');
      }
    }

    // 23:50 — Автоматический перенос задач
    if (hour === 23 && minute === 50) {
      if (shouldSendReminder(user.id, 23, 50, today)) {
        const incomplete = await prisma.plan.findMany({
          where: { userId: user.id, date: { lte: today }, completed: false }
        });

        if (incomplete.length > 0) {
          const tomorrowFormatted = addDaysToDateStr(today, 1);

          const uniqueIncompleteMap = new Map();
          for (const p of incomplete) {
            if (p.groupId) {
              const existing = uniqueIncompleteMap.get(p.groupId);
              if (!existing || p.date > existing.date) {
                uniqueIncompleteMap.set(p.groupId, p);
              }
            } else {
              uniqueIncompleteMap.set(p.id.toString(), p);
            }
          }

          for (const plan of uniqueIncompleteMap.values()) {
            let groupId = plan.groupId;
            if (!groupId) {
              groupId = crypto.randomUUID();
              await prisma.plan.update({
                where: { id: plan.id },
                data: { groupId }
              });
            }

            const existing = await prisma.plan.findFirst({
              where: { groupId, date: tomorrowFormatted }
            });

            if (!existing) {
              await prisma.plan.create({
                data: {
                  userId: plan.userId,
                  title: plan.title,
                  description: plan.description,
                  date: tomorrowFormatted,
                  originalDate: plan.originalDate,
                  groupId: groupId,
                  completed: false
                }
              });
            }
          }
        }
      }
    }
  }
}

/**
 * Проверить умные напоминания расписания (за 2.5ч и за 1ч до события)
 */
async function checkScheduleReminders(bot: Telegraf) {
  const now = new Date();

  // Находим события, которые ещё не напомнены
  const events = await prisma.scheduleEvent.findMany({
    where: {
      OR: [
        { reminded150: false },
        { reminded60: false }
      ],
      startTimeUTC: { gt: now }
    },
    include: { user: true }
  });

  for (const event of events) {
    const msUntilEvent = event.startTimeUTC.getTime() - now.getTime();
    const minutesUntilEvent = msUntilEvent / 1000 / 60;

    const localTime = utcToLocalTime(event.startTimeUTC, event.user.timezone);

    // Напоминание за 2.5 часа (150 минут)
    if (!event.reminded150 && minutesUntilEvent <= 150 && minutesUntilEvent > 60) {
      await sendMessage(
        bot,
        event.user.telegramId,
        `⏰ *Напоминание (через ~2.5 часа)*\n\n📅 "${event.title}" в ${localTime}`
      );
      await prisma.scheduleEvent.update({
        where: { id: event.id },
        data: { reminded150: true }
      });
    }

    // Напоминание за 1 час (60 минут)
    if (!event.reminded60 && minutesUntilEvent <= 60 && minutesUntilEvent > 0) {
      await sendMessage(
        bot,
        event.user.telegramId,
        `🔔 *Напоминание (через ~1 час)*\n\n📅 "${event.title}" в ${localTime}`
      );
      await prisma.scheduleEvent.update({
        where: { id: event.id },
        data: { reminded60: true }
      });
    }
  }
}

/**
 * Запустить систему напоминаний
 */
export function startScheduler(bot: Telegraf) {
  console.log('⏰ Scheduler started');

  // Проверяем каждые 30 секунд (чтобы гарантировать попадание в нужную минуту при Event Loop lag)
  reminderInterval = setInterval(async () => {
    try {
      await checkDailyReminders(bot);
      await checkScheduleReminders(bot);
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  }, 30 * 1000); // каждые 30 секунд
}

/**
 * Остановить систему напоминаний
 */
export function stopScheduler() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('⏰ Scheduler stopped');
  }
}
