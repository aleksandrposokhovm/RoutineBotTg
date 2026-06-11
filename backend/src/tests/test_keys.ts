import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { GoogleGenAI } from '@google/genai';

const apiKeysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const apiKeys = apiKeysStr.split(',').map(k => k.trim()).filter(Boolean);

async function testKeys() {
  console.log(`Found ${apiKeys.length} keys to test.`);
  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    const client = new GoogleGenAI({ apiKey: key });
    const start = Date.now();
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Hello'
      });
      console.log(`Key ${i} (${key.substring(0, 10)}...): SUCCESS in ${Date.now() - start}ms. Response: ${response.text?.trim()}`);
    } catch (e: any) {
      console.log(`Key ${i} (${key.substring(0, 10)}...): FAILED in ${Date.now() - start}ms. Error: ${e.message || e}`);
    }
  }
}

testKeys();
