import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

let currentKeysStr = '';
let clients: GoogleGenAI[] = [];
let activeKeyIndex = 0;

function initOrRefreshClients() {
  try {
    const envPath = path.join(__dirname, '../../.env');
    dotenv.config({ path: envPath, override: true });
  } catch (error) {
    console.error('[Gemini Rotation] Error reloading .env file:', error);
  }

  const apiKeysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  if (apiKeysStr !== currentKeysStr || clients.length === 0) {
    const apiKeys = apiKeysStr.split(',').map(k => k.trim()).filter(Boolean);
    console.log(`[Gemini Rotation] Found ${apiKeys.length} API key(s) in .env. Initializing/updating clients...`);
    clients = apiKeys.map(key => new GoogleGenAI({ apiKey: key }));
    if (clients.length === 0) {
      clients = [new GoogleGenAI({ apiKey: '' })];
    }
    currentKeysStr = apiKeysStr;
    activeKeyIndex = 0;
  }
}


async function executeWithRetry<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  initOrRefreshClients();
  const totalClients = clients.length;
  let lastError: any = null;

  for (let attempt = 0; attempt < totalClients; attempt++) {
    const currentIndex = (activeKeyIndex + attempt) % totalClients;
    const client = clients[currentIndex];
    try {
      const result = await fn(client);
      activeKeyIndex = currentIndex;
      return result;
    } catch (error: any) {
      console.error(`[Gemini Rotation] Error with key index ${currentIndex}:`, error.message || error);
      lastError = error;

      if (totalClients > 1 && attempt < totalClients - 1) {
        const nextIndex = (currentIndex + 1) % totalClients;
        console.warn(`[Gemini Rotation] Rotating to API key index ${nextIndex}. Attempt ${attempt + 1} of ${totalClients}`);
      }
    }
  }

  throw lastError || new Error('All Gemini API keys failed.');
}

async function generateContent(
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
): ReturnType<GoogleGenAI['models']['generateContent']> {
  return executeWithRetry((client) => client.models.generateContent(params));
}

function safeParseFloat(val: any, fallback: number = 0): number {
  if (val === null || val === undefined) return fallback;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
}

function safeParseFloatOrNull(val: any): number | null {
  if (val === null || val === undefined) return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

// ────────────────────────────────────────
// Типы для структурированных ответов ИИ
// ────────────────────────────────────────

export interface AIIntent {
  action: 'add_schedule' | 'add_plan' | 'add_diet' | 'delete_schedule' | 'delete_plan' | 'delete_diet' | 'complete_plan' | 'postpone_plan' | 'update_timezone' | 'edit_schedule' | 'edit_plan' | 'edit_diet' | 'get_history' | 'unknown';
  data: any;
  confirmationMessage?: string;
  userQueryText?: string;
}

export interface AIDietAnalysis {
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  portionGrams: number | null;
  needsPortionClarification: boolean;
}

export interface AINutritionCalculation {
  dailyCalories: number;
  dailyProtein: number;
  dailyFat: number;
  dailyCarbs: number;
  explanation: string;
}

// ────────────────────────────────────────
// Системный промпт для AI-агента
// ────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — персональный ИИ-ассистент RoutineBot. Ты управляешь расписанием, планами и рационом пользователя.

ТЕКУЩИЕ ДАТА И ВРЕМЯ ПОЛЬЗОВАТЕЛЯ: {CURRENT_DATETIME}
ЧАСОВОЙ ПОЯС ПОЛЬЗОВАТЕЛЯ: {USER_TIMEZONE}

Твои задачи:
1. РАСПИСАНИЕ — события с жесткой привязкой ко времени (совещания, звонки, встречи). Время ВСЕГДА указывается в часовом поясе пользователя.
2. ПЛАНЫ — задачи на день без привязки ко времени (To-Do лист).
3. РАЦИОН — приемы пищи с КБЖУ.

ПРАВИЛА ОТВЕТА:
- Всегда отвечай ТОЛЬКО валидным JSON (без markdown, без комментариев).
- ВАЖНО: Все ответы, сообщения и текстовые значения в полях JSON (такие как confirmationMessage, названия событий, описания, задачи, названия блюд и т.д.) должны быть СТРОГО на русском языке. Думай и пиши исключительно на русском.
- ВАЖНО: Если пользователь просит добавить событие/план на будущее (например, "завтра", "через неделю", "через месяц", "в следующую пятницу"), ВНИМАТЕЛЬНО вычисляй правильную дату (поле date в формате YYYY-MM-DD) относительно ТЕКУЩИЕ ДАТА И ВРЕМЯ. Бот умеет и должен работать с будущими датами.
- Формат ответа:
{
  "action": "add_schedule" | "add_plan" | "add_diet" | "delete_schedule" | "delete_plan" | "delete_diet" | "complete_plan" | "postpone_plan" | "update_timezone" | "edit_schedule" | "edit_plan" | "edit_diet" | "get_history" | "unknown",
  "data": { ... зависит от действия ... },
  "confirmationMessage": "Краткое сообщение пользователю о том, что было сделано (или ответ на его вопрос, если action является unknown)",
  "userQueryText": "Текстовая расшифровка голосового сообщения (если аудио) или точный/очищенный текст запроса пользователя (если текст)"
}

ФОРМАТ DATA ПО ДЕЙСТВИЯМ:

add_schedule:
{
  "title": "Название события",
  "description": "Описание (опционально)",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM"
}

add_plan:
{
  "tasks": [
    { "title": "Задача 1", "description": "..." },
    { "title": "Задача 2" }
  ],
  "date": "YYYY-MM-DD"
}

add_diet:
{
  "name": "Название блюда",
  "mealType": "breakfast" | "lunch" | "dinner" | "snack",
  "calories": 350,
  "protein": 25,
  "fat": 15,
  "carbs": 30,
  "portionGrams": 250,
  "needsPortionClarification": false,
  "date": "YYYY-MM-DD"
}
Если пользователь НЕ отправил фото и НЕ указал размер порции, ставь "needsPortionClarification": true.

delete_schedule / delete_plan / delete_diet:
{
  "searchQuery": "текст для поиска записи, которую нужно удалить",
  "date": "YYYY-MM-DD" (опционально)
}

edit_schedule:
{
  "searchQuery": "текст для поиска записи (например, 'созвон' или 'тренировка')",
  "date": "YYYY-MM-DD" (опционально),
  "newData": {
    "title": "Новое название (опционально)",
    "startTime": "Новое время начала HH:MM (опционально)",
    "endTime": "Новое время конца HH:MM (опционально)"
  }
}

edit_plan:
{
  "searchQuery": "текст для поиска задачи",
  "date": "YYYY-MM-DD" (опционально),
  "newData": {
    "title": "Новое название (опционально)",
    "description": "Новое описание (опционально)"
  }
}

edit_diet:
{
  "searchQuery": "текст для поиска блюда",
  "date": "YYYY-MM-DD" (опционально),
  "newData": {
    "name": "Новое название блюда (опционально)",
    "calories": 100 (опционально),
    "protein": 10 (опционально),
    "fat": 5 (опционально),
    "carbs": 20 (опционально),
    "portionGrams": 150 (опционально)
  }
}

complete_plan:
{
  "searchQuery": "текст для поиска задачи",
  "date": "YYYY-MM-DD" (опционально)
}

postpone_plan:
{
  "searchQuery": "текст для поиска задачи",
  "targetDate": "YYYY-MM-DD"
}

update_timezone:
{
  "timezone": "Asia/Dubai",
  "city": "Дубай"
}

get_history:
{
  "date": "YYYY-MM-DD",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "allTime": true | false,
  "completed": true | false,
  "searchQuery": "строка поиска",
  "type": "plans" | "schedule" | "diet" | "all"
}
Описание: Использовать для любых вопросов, запросов информации, аналитики, сравнений, статистики, отчетов или общения о расписании, планах, рационе, КБЖУ, профиле или данных пользователя.
ВАЖНО: Если пользователь задает любой вопрос о своем расписании, планах или рационе в свободной или разговорной форме (например, "что там у меня?", "какие дела?", "когда встречи?", "что я ел?", "покажи расписание"), всегда выбирай action "get_history" с соответствующим типом (type: "plans" | "schedule" | "diet" | "all") и не заполняй поля дат (оставь их пустыми/undefined), чтобы бэкенд мог автоматически загрузить нужный диапазон (например, бэклог задач или ближайшие встречи).
Параметры:
- date: Точная дата в формате YYYY-MM-DD, если вопрос касается одного конкретного дня (например, "вчера", "сегодня", "неделю назад", "15 мая").
- startDate и endDate: Используй для диапазонов дат. ВНИМАТЕЛЬНО вычисляй даты начала и конца периода относительно ТЕКУЩИЕ ДАТА И ВРЕМЯ. Например:
  - "эта неделя" -> с понедельника текущей недели по воскресенье текущей недели.
  - "прошлая неделя" -> с понедельника предыдущей недели по воскресенье предыдущей недели.
  - "этот месяц" -> с 1-го числа текущего месяца по последний день текущего месяца.
  - "прошлый месяц" -> с 1-го числа предыдущего месяца по последний день предыдущего месяца.
- allTime: Поставь true, если пользователь просит показать данные без ограничений по датам (например, "покажи все мои невыполненные планы", "какие у меня вообще есть планы", "когда-либо").
- completed: Поставь true или false, если пользователь спрашивает о выполненных или невыполненных планах/задачах (например, "какие у меня незавершенные дела" -> completed = false).
- searchQuery: Ключевое слово для поиска конкретных записей (например, "когда я ел пиццу" -> searchQuery = "пицца"). ВАЖНО: Никогда не пиши сюда названия приемов пищи ("завтрак", "обед", "ужин", "перекус") или общие слова вроде "еда". Для них оставляй searchQuery пустым, так как ИИ сам отфильтрует приемы пищи на этапе генерации ответа.
- type: "plans" (планы/to-do задачи), "schedule" (расписание/встречи/дела со временем), "diet" (еда/рацион/питание/калории), "all" (если вопрос касается нескольких категорий или общего обзора).

unknown:
Если пользователь задает общий вопрос (не требующий данных из его личной БД), хочет просто поболтать, здоровается, просит общего совета по тайм-менеджменту или питанию, спрашивает о свойствах продуктов (например, калорийность яблока) или о твоих возможностях — используй action "unknown", а в confirmationMessage напиши подробный, вежливый и развернутый ответ на его вопрос. Не используй "get_history", если вопрос не касается конкретно его сохраненного расписания, планов или рациона.`;

// ────────────────────────────────────────
// Функции для работы с Gemini
// ────────────────────────────────────────

/**
 * Обработка текстового сообщения — определение намерения пользователя
 */
export async function processTextMessage(
  text: string,
  userTimezone: string,
  currentDatetime: string
): Promise<AIIntent> {
  const prompt = SYSTEM_PROMPT
    .replace('{CURRENT_DATETIME}', currentDatetime)
    .replace('{USER_TIMEZONE}', userTimezone);

  const response = await generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: `${prompt}\n\nСообщение пользователя:\n${text}` }] }
    ],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const responseText = response.text || '{}';
  try {
    return JSON.parse(responseText) as AIIntent;
  } catch {
    return {
      action: 'unknown',
      data: {},
      confirmationMessage: 'Не удалось обработать ответ ИИ. Попробуйте ещё раз.'
    };
  }
}

/**
 * Обработка голосового сообщения — Gemini напрямую принимает аудио
 */
export async function processVoiceMessage(
  audioBuffer: Buffer,
  userTimezone: string,
  currentDatetime: string
): Promise<AIIntent> {
  const prompt = SYSTEM_PROMPT
    .replace('{CURRENT_DATETIME}', currentDatetime)
    .replace('{USER_TIMEZONE}', userTimezone);

  const audioBase64 = audioBuffer.toString('base64');

  const response = await generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${prompt}\n\nПользователь отправил голосовое сообщение. Расшифруй его и определи намерение:` },
          {
            inlineData: {
              mimeType: 'audio/ogg',
              data: audioBase64
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const responseText = response.text || '{}';
  try {
    return JSON.parse(responseText) as AIIntent;
  } catch {
    return {
      action: 'unknown',
      data: {},
      confirmationMessage: 'Не удалось обработать голосовое сообщение. Попробуйте ещё раз.'
    };
  }
}

/**
 * Анализ фото еды — распознавание блюда и расчет КБЖУ
 */
export async function analyzePhotoForDiet(
  photoBuffer: Buffer,
  caption: string | undefined,
  userTimezone: string,
  currentDatetime: string
): Promise<AIDietAnalysis> {
  const photoBase64 = photoBuffer.toString('base64');

  const prompt = `Ты — эксперт по питанию. Проанализируй фотографию еды и определи:
1. Название блюда (на русском языке)
2. Тип приема пищи (breakfast/lunch/dinner/snack) на основе текущего времени: ${currentDatetime} (${userTimezone})
3. Примерный КБЖУ (калории, белки, жиры, углеводы)
4. Примерный вес порции в граммах

${caption ? `Пользователь также написал подпись: "${caption}"` : ''}

ВАЖНО: Поле "name" (название блюда) должно быть СТРОГО на русском языке.

Ответь ТОЛЬКО в формате JSON:
{
  "name": "Название блюда",
  "mealType": "breakfast" | "lunch" | "dinner" | "snack",
  "calories": число,
  "protein": число,
  "fat": число,
  "carbs": число,
  "portionGrams": число,
  "needsPortionClarification": false
}`;

  const response = await generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: photoBase64
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const responseText = response.text || '{}';
  try {
    const data = JSON.parse(responseText);
    return {
      name: String(data.name || caption || 'Неизвестное блюдо'),
      mealType: (['breakfast', 'lunch', 'dinner', 'snack'].includes(data.mealType) ? data.mealType : 'snack') as any,
      calories: safeParseFloat(data.calories, 0),
      protein: safeParseFloat(data.protein, 0),
      fat: safeParseFloat(data.fat, 0),
      carbs: safeParseFloat(data.carbs, 0),
      portionGrams: safeParseFloatOrNull(data.portionGrams),
      needsPortionClarification: data.needsPortionClarification !== undefined ? Boolean(data.needsPortionClarification) : true
    };
  } catch {
    return {
      name: caption || 'Неизвестное блюдо',
      mealType: 'snack',
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      portionGrams: null,
      needsPortionClarification: true
    };
  }
}

/**
 * Расчет суточной нормы КБЖУ по профилю пользователя
 */
export async function calculateNutritionGoals(profile: {
  height: number;
  weight: number;
  age: number;
  gender: string;
  activityLevel: string;
  goal: string;
}): Promise<AINutritionCalculation> {
  const prompt = `Рассчитай суточную норму КБЖУ для человека:
- Рост: ${profile.height} см
- Вес: ${profile.weight} кг
- Возраст: ${profile.age} лет
- Пол: ${profile.gender === 'male' ? 'мужской' : 'женский'}
- Уровень активности: ${profile.activityLevel}
- Цель: ${profile.goal === 'lose' ? 'похудение' : profile.goal === 'gain' ? 'набор массы' : 'поддержание веса'}

Используй формулу Миффлина-Сан Жеора и соответствующий коэффициент активности.

ВАЖНО: Объяснение расчета (поле "explanation") должно быть СТРОГО на русском языке.

Ответь ТОЛЬКО в формате JSON:
{
  "dailyCalories": число,
  "dailyProtein": число,
  "dailyFat": число,
  "dailyCarbs": число,
  "explanation": "Краткое объяснение расчета"
}`;

  const response = await generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
    }
  });

  const responseText = response.text || '{}';
  try {
    const data = JSON.parse(responseText);
    return {
      dailyCalories: safeParseFloat(data.dailyCalories, 2000),
      dailyProtein: safeParseFloat(data.dailyProtein, 150),
      dailyFat: safeParseFloat(data.dailyFat, 70),
      dailyCarbs: safeParseFloat(data.dailyCarbs, 200),
      explanation: String(data.explanation || 'Расчет выполнен успешно.')
    };
  } catch {
    return {
      dailyCalories: 2000,
      dailyProtein: 150,
      dailyFat: 70,
      dailyCarbs: 200,
      explanation: 'Использованы средние значения по умолчанию.'
    };
  }
}

/**
 * Извлечь согласие (yes/no) из голосового сообщения
 */
export async function transcribeYesNo(audioBuffer: Buffer): Promise<'yes' | 'no' | 'unknown'> {
  const audioBase64 = audioBuffer.toString('base64');
  const prompt = `Прослушай аудио и определи, выразил ли пользователь согласие ("да", "давай", "yes", "ок") или отказ ("нет", "не надо", "no", "отмена").
Ответь ТОЛЬКО в формате JSON:
{
  "answer": "yes" | "no" | "unknown"
}`;

  try {
    const response = await generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'audio/ogg',
                data: audioBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const data = JSON.parse(response.text || '{}');
    return data.answer || 'unknown';
  } catch (error) {
    console.error('Error transcribing yes/no from voice:', error);
    return 'unknown';
  }
}

/**
 * Извлечь количество граммов из голосового сообщения
 */
export async function extractGramsFromVoice(audioBuffer: Buffer): Promise<number | null> {
  const audioBase64 = audioBuffer.toString('base64');
  const prompt = `Прослушай аудио. Если пользователь четко называет вес еды или порции (число), верни это число (например, "двести грамм" -> 200). 
Если пользователь говорит о чем-то другом (например, просит поставить задачу, говорит о расписании, совещаниях или отменяет запрос), верни null. Это нужно, чтобы отличить вес еды от времени или других чисел в случайном разговоре.
Ответь ТОЛЬКО в формате JSON:
{
  "grams": число или null
}`;

  try {
    const response = await generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'audio/ogg',
                data: audioBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const data = JSON.parse(response.text || '{}');
    if (data.grams !== undefined && data.grams !== null) {
      const grams = parseFloat(data.grams);
      return isNaN(grams) ? null : grams;
    }
    return null;
  } catch (error) {
    console.error('Error extracting grams from voice:', error);
    return null;
  }
}

/**
 * Генерирует красивый структурированный ответ на основе найденных данных из БД и вопроса пользователя
 */
export async function generateHistoryResponse(
  userQuery: string,
  data: {
    plans?: any[];
    schedule?: any[];
    diet?: any[];
    nutritionProfile?: any;
    meta: {
      date?: string;
      startDate?: string;
      endDate?: string;
      searchQuery?: string;
      type: string;
    }
  },
  userTimezone: string,
  currentDatetime: string
): Promise<string> {
  const prompt = `Ты — персональный ИИ-ассистент RoutineBot. Твоя задача — красиво, структурированно, понятно и подробно ответить на вопрос пользователя, используя предоставленные данные из его базы данных.
  
ТЕКУЩИЕ ДАТА И ВРЕМЯ ПОЛЬЗОВАТЕЛЯ: ${currentDatetime}
ЧАСОВОЙ ПОЯС ПОЛЬЗОВАТЕЛЯ: ${userTimezone}

Вопрос пользователя: "${userQuery}"

Данные из базы данных:
${JSON.stringify(data, null, 2)}

Инструкции по оформлению ответа:
1. Отвечай на русском языке в вежливом и поддерживающем тоне.
2. Используй подходящие эмодзи для разделов (например, 📋 для планов/задач, 📅 для расписания, 🍽 для еды/рациона, 🔥 для калорий).
3. Форматируй ответ с помощью Markdown. Используй жирный шрифт для ключевых моментов, списки и заголовки.
4. Отвечай КОНКРЕТНО на поставленный вопрос. Например:
   - Если пользователь спросил: "Что я ел вчера на завтрак?", сфокусируйся на завтраке, но при желании кратко упомяни общую сумму за день, если это уместно.
   - Если спросил "Во сколько я занимался спортом во вторник?", выведи точные часы занятий спортом во вторник.
   - Если спросил "Что я делал 15 мая?", подробно перечисли все события расписания (с указанием времени) и выполненные/невыполненные планы на этот день.
5. Если в данных ничего не найдено, вежливо и дружелюбно сообщи пользователю, что на этот период или по этому запросу записей в базе данных не обнаружено.
6. Выводи время событий строго в локальном формате, в котором они предоставлены в поле time/startTime/endTime (все UTC-события расписания уже переведены в локальное время пользователя на стороне сервера, поэтому используй текстовые поля локального времени, предоставленные в данных).
7. Если пользователь спрашивает про рацион питания, и у нас есть NutritionProfile (профиль КБЖУ), сопоставь фактическое потребление с его суточными целями (например, "Вы набрали 1800 ккал из вашей нормы 2000 ккал").
8. Не выдумывай факты, которых нет в данных. Опирайся исключительно на предоставленный JSON.
9. Если пользователь задал гибкий/общий вопрос без конкретной даты (например, "какие у меня дела?", "когда созвон?", "что я ел?"), а бэкенд вернул данные за сегодня, вчера или ближайшие дни, ответь ему развернуто и естественно (например: "Сегодня встреч нет, но завтра у вас запланировано...", или "Сегодня по планам у вас 3 задачи, а также 2 невыполненные задачи с прошлых дней...", или "Вчера вы съели..., а за сегодня записей еще нет"). Сделай так, чтобы ответ выглядел профессионально и помогал сориентироваться.

Пиши ответ в Telegram-формате Markdown (используй * для жирного текста, _ для курсива, не используй сложные конструкции или Markdown V2 экранирование). Начни сразу с ответа, без вступлений типа "Вот ваш ответ:".`;

  try {
    const response = await generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return response.text || 'Не удалось сформировать ответ.';
  } catch (error) {
    console.error('Error generating history response:', error);
    return 'Произошла ошибка при анализе данных истории. Пожалуйста, попробуйте позже.';
  }
}

