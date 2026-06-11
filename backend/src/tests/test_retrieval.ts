import dotenv from 'dotenv';
import path from 'path';
// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { processTextMessage } from '../services/gemini';
import { getTodayDateInTz, getCurrentDatetimeInTz } from '../services/timezone';

async function testQuery(text: string, timezone: string = 'Asia/Yekaterinburg') {
  const currentDatetime = getCurrentDatetimeInTz(timezone);
  console.log(`\n==================================================`);
  console.log(`User Query: "${text}"`);
  console.log(`Current Datetime context sent to AI: ${currentDatetime}`);
  try {
    const result = await processTextMessage(text, timezone, currentDatetime);
    console.log(`Parsed Intent:`, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error processing query:`, error);
  }
}

async function runTests() {
  const queries = [
    "что я ел год назад на обед?",
    "какие планы у меня на следующую пятницу?",
    "что у меня по расписанию в понедельник?",
    "что я кушал 15 мая?",
    "какой у меня рацион на сегодня?",
    "покажи мое расписание на завтра"
  ];

  for (const q of queries) {
    await testQuery(q);
    // 5 seconds sleep to reduce rate limit probability
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

runTests().catch(console.error);
