import { GoogleGenAI } from '@google/genai';
import { extractJson } from './json-extract';
import { waitForRateLimit } from './rate-limiter';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface InvoiceData {
  vendor_name: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  tax_rate: string | null;
  description: string | null;
  invoice_number: string | null;
}

/**
 * 請求書ファイルをGemini Vision APIでOCR処理
 */
export async function ocrInvoice(
  fileBuffer: Buffer,
  mimeType: string
): Promise<InvoiceData> {
  await waitForRateLimit();

  const base64Data = fileBuffer.toString('base64');

  const prompt = `以下の請求書画像から情報を抽出し、JSON形式で返してください。
読み取れない項目はnullとしてください。
JSONのみを返し、他のテキストは含めないでください。

{
  "vendor_name": "取引先名（会社名）",
  "invoice_date": "請求日（YYYY-MM-DD形式）",
  "due_date": "支払期日（YYYY-MM-DD形式）",
  "total_amount": 税込合計金額（数値のみ）,
  "tax_amount": 消費税額（数値のみ）,
  "tax_rate": "10%または8%",
  "description": "主な品目・摘要",
  "invoice_number": "請求書番号"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  const responseText = response.text ?? '';

  try {
    return extractJson<InvoiceData>(responseText);
  } catch {
    console.error('Invoice OCR JSON parse error:', responseText);
    return {
      vendor_name: null,
      invoice_date: null,
      due_date: null,
      total_amount: null,
      tax_amount: null,
      tax_rate: null,
      description: null,
      invoice_number: null,
    };
  }
}
