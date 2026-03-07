/**
 * シンプルなレートリミッター
 * Gemini無料枠（5-15 RPM）対策で、API呼び出し間隔を制御する
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
