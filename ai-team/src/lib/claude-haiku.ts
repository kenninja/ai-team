/**
 * mail-cron 等向けの軽量 Claude（Haiku）呼び出し
 */
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export async function claudeHaikuGenerateText(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[claude-haiku] ANTHROPIC_API_KEY 未設定');
    return '';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error('[claude-haiku] APIエラー:', res.status, t);
    return '';
  }

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? '';
}
