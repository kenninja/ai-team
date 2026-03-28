import { NextResponse } from 'next/server';
import { clearMFVendors, insertMFVendor } from '@/lib/db';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'ファイルなし' }, { status: 400 });

  const text = await file.text();
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);

  const vendorNameIdx = headers.indexOf('取引先名');
  const payeeNameIdx = headers.indexOf('支払先名');
  const vendorCodeIdx = headers.indexOf('取引先コード');
  const payeeCodeIdx = headers.indexOf('支払先コード');
  const payeeUniqueKeyIdx = headers.indexOf('支払先ユニークキー');
  const accountItemIdx = headers.indexOf('経費科目');

  // 既存データをクリアして再インポート
  clearMFVendors();

  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const vendorName = cols[vendorNameIdx] ?? '';
    const payeeName = cols[payeeNameIdx] ?? '';
    const vendorCode = cols[vendorCodeIdx] ?? '';
    const payeeCode = cols[payeeCodeIdx] ?? '';
    const payeeUniqueKey = cols[payeeUniqueKeyIdx] ?? '';
    const accountItem = cols[accountItemIdx] ?? '';

    if (!vendorName && !payeeName) continue;
    if (!payeeUniqueKey) continue;

    insertMFVendor({
      vendorName,
      vendorNameShort: payeeName,
      vendorCode: payeeCode || vendorCode,
      vendorUniqueKey: payeeUniqueKey,
      defaultAccountItem: accountItem,
    });

    count++;
  }

  return NextResponse.json({ imported: count });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
