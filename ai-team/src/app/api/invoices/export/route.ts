import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, markInvoicesExported } from '@/lib/db';
import { generateSimpleCSV, generateMFSpotCSV, generateMFRegisteredCSV, generateMFAutoCSV } from '@/lib/csv-export';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ids, format } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'idsが必要です' }, { status: 400 });
  }

  if (!format || !['simple', 'mf_spot', 'mf_registered', 'mf_auto'].includes(format)) {
    return NextResponse.json({ error: 'format は simple, mf_spot, mf_registered, mf_auto のいずれかです' }, { status: 400 });
  }

  // 請求書データを取得
  const invoices = ids.map((id: number) => getInvoice(id)).filter(Boolean) as Record<string, unknown>[];

  if (invoices.length === 0) {
    return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 });
  }

  // CSV生成
  let csv: string;
  let filename: string;
  const dateStr = new Date().toISOString().split('T')[0];

  switch (format) {
    case 'simple':
      csv = generateSimpleCSV(invoices);
      filename = `invoices_simple_${dateStr}.csv`;
      break;
    case 'mf_spot':
      csv = generateMFSpotCSV(invoices);
      filename = `invoices_mf_spot_${dateStr}.csv`;
      break;
    case 'mf_registered':
      csv = generateMFRegisteredCSV(invoices);
      filename = `invoices_mf_registered_${dateStr}.csv`;
      break;
    case 'mf_auto':
      csv = generateMFAutoCSV(invoices);
      filename = `invoices_mf_auto_${dateStr}.csv`;
      break;
    default:
      return NextResponse.json({ error: '不明なフォーマット' }, { status: 400 });
  }

  // エクスポート済みにマーク
  markInvoicesExported(ids);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
