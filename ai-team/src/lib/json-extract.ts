/**
 * Gemini APIのレスポンスからJSONを抽出する
 * マークダウンのコードブロックで返ってくる場合に対応
 */
export function extractJson<T>(text: string): T {
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/) ||
    [null, text];

  const jsonStr = jsonMatch[1] || text;
  return JSON.parse(jsonStr.trim());
}

/**
 * 前置き付きの応答でも最初の JSON オブジェクトを拾う（Claude 等向け）
 */
export function extractJsonLenient<T>(text: string): T {
  if (!text || !String(text).trim()) {
    throw new Error('empty');
  }
  try {
    return extractJson<T>(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1).trim()) as T;
    }
    throw new Error('no json object');
  }
}
