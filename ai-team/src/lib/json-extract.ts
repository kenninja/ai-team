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
