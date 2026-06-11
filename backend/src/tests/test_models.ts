import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { GoogleGenAI } from '@google/genai';
const apiKeysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const apiKeys = apiKeysStr.split(',').map(k => k.trim()).filter(Boolean);
const genai = new GoogleGenAI({ apiKey: apiKeys[0] || '' });

async function testModel(modelName: string) {
  try {
    const response = await genai.models.generateContent({
      model: modelName,
      contents: "Hi, who are you? Answer in 3 words."
    });
    console.log(`Model ${modelName} SUCCESS:`, response.text?.trim());
  } catch (error: any) {
    console.log(`Model ${modelName} FAILED:`, error.message || error);
  }
}

async function run() {
  try {
    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: 'Who are you?',
      config: {
        systemInstruction: 'You are a helpful assistant named Antigravity. Always start your response with "[Antigravity]:"'
      }
    });
    console.log("SystemInstruction response:", response.text?.trim());
  } catch (error: any) {
    console.error("SystemInstruction failed:", error.message || error);
  }
}

run();
