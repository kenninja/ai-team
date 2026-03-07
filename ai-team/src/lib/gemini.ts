import { GoogleGenAI } from '@google/genai';
import { waitForRateLimit } from './rate-limiter';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-2.5-flash';

/**
 * Gemini APIでテキスト生成（非ストリーミング）
 */
export async function generateText(
  systemPrompt: string,
  userMessage: string,
  conversationContext?: string
): Promise<string> {
  await waitForRateLimit();

  const fullMessage = conversationContext
    ? `## これまでの経緯:\n${conversationContext}\n\n## 今回の指示:\n${userMessage}`
    : userMessage;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: 'user', parts: [{ text: fullMessage }] },
    ],
    config: {
      systemInstruction: systemPrompt,
    },
  });

  return response.text ?? '';
}

/**
 * Gemini APIでテキスト生成（ストリーミング）
 * AsyncGeneratorでチャンクを返す
 */
export async function* generateTextStream(
  systemPrompt: string,
  userMessage: string,
  conversationContext?: string
): AsyncGenerator<string> {
  await waitForRateLimit();

  const fullMessage = conversationContext
    ? `## これまでの経緯:\n${conversationContext}\n\n## 今回の指示:\n${userMessage}`
    : userMessage;

  const response = await ai.models.generateContentStream({
    model: MODEL,
    contents: [
      { role: 'user', parts: [{ text: fullMessage }] },
    ],
    config: {
      systemInstruction: systemPrompt,
    },
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) {
      yield text;
    }
  }
}
