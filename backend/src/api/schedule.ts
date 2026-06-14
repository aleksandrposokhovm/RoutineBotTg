import { Router, Request, Response } from 'express';
import prisma from '../db';
import { Prisma } from '../generated/prisma/client';
import { utcToLocalTime, utcToLocalDate, localTimeToUTC, addDaysToDateStr } from '../services/timezone';
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '../services/googleCalendar';

const router = Router();

/**
 * GET /api/schedule?date=YYYY-MM-DD
 * Получить все события расписания за конкретный день (в локальном времени пользователя)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const user = req.user!;

    // Получаем все события
    const events = await prisma.scheduleEvent.findMany({
      where: { userId: user.id },
      orderBy: { startTimeUTC: 'asc' }
    });

    // Фильтруем по локальной дате, если передана
    const filteredEvents = date
      ? events.filter(e => utcToLocalDate(e.startTimeUTC, user.timezone) === date)
      : events;

    // Конвертируем UTC -> локальное время
    const localEvents = filteredEvents.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      date: utcToLocalDate(e.startTimeUTC, user.timezone),
      startTime: utcToLocalTime(e.startTimeUTC, user.timezone),
      endTime: utcToLocalTime(e.endTimeUTC, user.timezone),
      startTimeUTC: e.startTimeUTC,
      endTimeUTC: e.endTimeUTC
    }));

    res.json(localEvents);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/schedule
 * Создать новое событие
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, date, startTime, endTime } = req.body;
    const user = req.user!;

    const endTimeDate = endTime < startTime ? addDaysToDateStr(date, 1) : date;
    const startTimeUTC = localTimeToUTC(date, startTime, user.timezone);
    const endTimeUTC = localTimeToUTC(endTimeDate, endTime, user.timezone);

    const now = new Date();
    const msUntilStart = startTimeUTC.getTime() - now.getTime();
    const minutesUntilStart = msUntilStart / 1000 / 60;
    const reminded150 = msUntilStart > 0 ? minutesUntilStart <= 150 : true;
    const reminded60 = msUntilStart > 0 ? minutesUntilStart <= 60 : true;

    const event = await prisma.scheduleEvent.create({
      data: {
        userId: user.id,
        title,
        description: description || null,
        startTimeUTC,
        endTimeUTC,
        createdInTz: user.timezone,
        reminded150,
        reminded60
      }
    });

    // Синхронизация с Google Календарем
    const googleEventId = await createGoogleCalendarEvent(user.id, {
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

    res.status(201).json({
      id: event.id,
      title: event.title,
      description: event.description,
      date,
      startTime,
      endTime
    });
  } catch (error) {
    console.error('Error creating schedule event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/schedule/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, date, startTime, endTime } = req.body;
    const user = req.user!;

    const existing = await prisma.scheduleEvent.findFirst({ where: { id: Number(id), userId: user.id } });
    if (!existing) return res.status(404).json({ error: 'Event not found or access denied' });

    const targetDate = date || utcToLocalDate(existing.startTimeUTC, user.timezone);
    const newStartTime = startTime || utcToLocalTime(existing.startTimeUTC, user.timezone);
    const newEndTime = endTime || utcToLocalTime(existing.endTimeUTC, user.timezone);

    const updateData: Prisma.ScheduleEventUpdateInput = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    if (startTime || date || endTime) {
      const endTimeDate = newEndTime < newStartTime ? addDaysToDateStr(targetDate, 1) : targetDate;
      const startTimeUTC = localTimeToUTC(targetDate, newStartTime, user.timezone);
      const endTimeUTC = localTimeToUTC(endTimeDate, newEndTime, user.timezone);

      updateData.startTimeUTC = startTimeUTC;
      updateData.endTimeUTC = endTimeUTC;

      const now = new Date();
      const msUntilStart = startTimeUTC.getTime() - now.getTime();
      const minutesUntilStart = msUntilStart / 1000 / 60;
      updateData.reminded150 = msUntilStart > 0 ? minutesUntilStart <= 150 : true;
      updateData.reminded60 = msUntilStart > 0 ? minutesUntilStart <= 60 : true;
    }

    const event = await prisma.scheduleEvent.update({
      where: { id: Number(id) },
      data: updateData
    });

    // Синхронизация с Google Календарем
    if (event.googleEventId) {
      await updateGoogleCalendarEvent(user.id, event.googleEventId, {
        title: event.title,
        description: event.description,
        startTimeUTC: event.startTimeUTC,
        endTimeUTC: event.endTimeUTC
      });
    } else {
      const googleEventId = await createGoogleCalendarEvent(user.id, {
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
    }

    res.json(event);
  } catch (error) {
    console.error('Error updating schedule event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/schedule/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const existing = await prisma.scheduleEvent.findFirst({ where: { id: Number(req.params.id), userId: user.id } });
    if (!existing) return res.status(404).json({ error: 'Event not found or access denied' });

    if (existing.googleEventId) {
      await deleteGoogleCalendarEvent(user.id, existing.googleEventId);
    }

    await prisma.scheduleEvent.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting schedule event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
