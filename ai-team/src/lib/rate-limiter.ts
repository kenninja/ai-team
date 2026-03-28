/**
 * シンプルなレートリミッター
 * Gemini無料枠対策で、API呼び出し間隔を制御する
 */
const MIN_INTERVAL_MS = 4000; // 4秒間隔 = 最大15RPM

let lastCallTime = 0;

export async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTime;

  if (elapsed < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastCallTime = Date.now();
}

/**
 * 429エラー時に自動リトライするラッパー
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'));

      if (isRateLimit && attempt < maxRetries) {
        const waitSec = 15 * (attempt + 1);
        console.log(`[rate-limiter] 429エラー、${waitSec}秒後にリトライ (${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}
