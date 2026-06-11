import { google } from 'googleapis';
import crypto from 'crypto';
import prisma from '../db';

const secret = process.env.BOT_TOKEN || 'fallback_secret';

export function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) are not configured in backend environment variables.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Генерирует ссылку авторизации Google OAuth2.
 * Параметр state кодирует userId и HMAC-подпись для защиты от CSRF.
 */
export function getGoogleAuthUrl(userId: number): string {
  const oauth2Client = getGoogleOAuth2Client();
  const signature = crypto.createHmac('sha256', secret).update(String(userId)).digest('hex');
  const state = JSON.stringify({ userId, signature });
  const stateBase64 = Buffer.from(state).toString('base64url');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent', // принудительно запрашиваем согласие для получения refresh_token
    state: stateBase64
  });
}

/**
 * Обрабатывает коллбэк от Google OAuth2: верифицирует state, обменивает code на токены
 * и сохраняет их в базе данных.
 */
export async function handleGoogleCallback(code: string, state: string): Promise<number> {
  try {
    const stateJson = Buffer.from(state, 'base64url').toString('utf8');
    const { userId, signature } = JSON.parse(stateJson);

    const expectedSignature = crypto.createHmac('sha256', secret).update(String(userId)).digest('hex');
    if (signature !== expectedSignature) {
      throw new Error('CSRF verification failed');
    }

    const oauth2Client = getGoogleOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    const updateData: any = {
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: expiryDate
    };

    if (tokens.refresh_token) {
      updateData.googleRefreshToken = tokens.refresh_token;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    console.log(`[Google Calendar] Successfully connected Google Calendar for user ID ${userId}`);
    return userId;
  } catch (error) {
    console.error('[Google Calendar Callback Error] Auth processing failed:', error);
    throw error;
  }
}

/**
 * Создает экземпляр Google Calendar API клиента для конкретного пользователя.
 * Настраивает автоматическое сохранение обновленных токенов.
 */
export async function getGoogleCalendarClient(user: {
  id: number;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleTokenExpiry: Date | null;
}) {
  if (!user.googleAccessToken || !user.googleRefreshToken) {
    return null;
  }

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry ? user.googleTokenExpiry.getTime() : undefined
  });

  oauth2Client.on('tokens', async (tokens) => {
    console.log(`[Google Calendar] Refreshed tokens for user ID ${user.id}`);
    const updateData: any = {};
    if (tokens.access_token) {
      updateData.googleAccessToken = tokens.access_token;
    }
    if (tokens.expiry_date) {
      updateData.googleTokenExpiry = new Date(tokens.expiry_date);
    }
    if (tokens.refresh_token) {
      updateData.googleRefreshToken = tokens.refresh_token;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
    }
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Обработчик ошибок API Google: при невалидном или отозванном токене сбрасывает связь в БД.
 */
async function handleGoogleApiError(userId: number, error: any) {
  console.error(`[Google Calendar Error] User ID ${userId}:`, error);
  const errMsg = String(error?.message || '').toLowerCase();
  
  // Признаки того, что токен больше не валиден (отозван, удален, истек без возможности обновления)
  if (
    errMsg.includes('invalid_grant') ||
    errMsg.includes('invalid credentials') ||
    error?.status === 401 ||
    error?.status === 400
  ) {
    console.log(`[Google Calendar] Revoking Google connection for user ID ${userId} due to auth failure.`);
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null
        }
      });
    } catch (dbErr) {
      console.error('[Google Calendar] Failed to auto-disconnect in DB:', dbErr);
    }
  }
}

/**
 * Создает событие в Google Календаре. Возвращает googleEventId в случае успеха.
 */
export async function createGoogleCalendarEvent(
  userId: number,
  event: { title: string; description?: string | null; startTimeUTC: Date; endTimeUTC: Date }
): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.googleAccessToken || !user.googleRefreshToken) return null;

    const calendar = await getGoogleCalendarClient(user);
    if (!calendar) return null;

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.description || undefined,
        start: {
          dateTime: event.startTimeUTC.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.endTimeUTC.toISOString(),
          timeZone: 'UTC'
        }
      }
    });

    console.log(`[Google Calendar] Created event for user ${userId}: ${res.data.id}`);
    return res.data.id || null;
  } catch (error) {
    await handleGoogleApiError(userId, error);
    return null;
  }
}

/**
 * Обновляет существующее событие в Google Календаре.
 */
export async function updateGoogleCalendarEvent(
  userId: number,
  googleEventId: string,
  event: { title: string; description?: string | null; startTimeUTC: Date; endTimeUTC: Date }
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.googleAccessToken || !user.googleRefreshToken) return false;

    const calendar = await getGoogleCalendarClient(user);
    if (!calendar) return false;

    await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: {
        summary: event.title,
        description: event.description || undefined,
        start: {
          dateTime: event.startTimeUTC.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.endTimeUTC.toISOString(),
          timeZone: 'UTC'
        }
      }
    });

    console.log(`[Google Calendar] Updated event ${googleEventId} for user ${userId}`);
    return true;
  } catch (error) {
    await handleGoogleApiError(userId, error);
    return false;
  }
}

/**
 * Удаляет событие из Google Календаря.
 */
export async function deleteGoogleCalendarEvent(
  userId: number,
  googleEventId: string
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.googleAccessToken || !user.googleRefreshToken) return false;

    const calendar = await getGoogleCalendarClient(user);
    if (!calendar) return false;

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId
    });

    console.log(`[Google Calendar] Deleted event ${googleEventId} for user ${userId}`);
    return true;
  } catch (error) {
    await handleGoogleApiError(userId, error);
    return false;
  }
}
