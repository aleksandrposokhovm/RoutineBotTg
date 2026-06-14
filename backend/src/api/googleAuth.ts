import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getGoogleAuthUrl, handleGoogleCallback } from '../services/googleCalendar';

export const publicGoogleAuthRouter = Router();
export const protectedGoogleAuthRouter = Router();

// GET /api/auth/google/callback (Публичный эндпоинт для редиректа от Google)
publicGoogleAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ошибка подключения</title>
      </head>
      <body style="background-color: #121214; color: #ff5252; font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>Ошибка подключения</h1>
        <p>Отсутствуют параметры code или state от Google OAuth.</p>
      </body>
      </html>
    `);
  }

  try {
    await handleGoogleCallback(code as string, state as string);
    res.send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Google Календарь подключен</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #121214;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background-color: #1a1a1e;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
            text-align: center;
            max-width: 400px;
          }
          h1 {
            color: #4caf50;
            font-size: 24px;
            margin-top: 0;
          }
          p {
            color: #a0a0ab;
            line-height: 1.5;
            margin-bottom: 25px;
          }
          .btn {
            display: inline-block;
            background-color: #4caf50;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            border: none;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
          }
          .btn:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Успешно подключено!</h1>
          <p>Google Календарь успешно привязан к вашей учетной записи RoutineBot. Вы можете закрыть это окно и вернуться в приложение.</p>
          <button onclick="window.close()" class="btn">Закрыть окно</button>
        </div>
        <script>
          setTimeout(() => {
            window.close();
          }, 5000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('[Google Callback API Error]:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <title>Ошибка подключения</title>
      </head>
      <body style="background-color: #121214; color: #ff5252; font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>Ошибка авторизации</h1>
        <p>Не удалось подключить Google Календарь. Возможно, ссылка авторизации устарела или недействительна.</p>
        <p style="color: #888;">${error instanceof Error ? error.message : String(error)}</p>
      </body>
      </html>
    `);
  }
});

// GET /api/google/auth-url (Защищен TMA)
protectedGoogleAuthRouter.get('/auth-url', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const url = getGoogleAuthUrl(userId);
    res.json({ url });
  } catch (error) {
    console.error('[Google Auth URL API Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/google/disconnect (Защищен TMA)
protectedGoogleAuthRouter.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Google Disconnect API Error]:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
