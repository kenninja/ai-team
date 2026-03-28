import { NextRequest, NextResponse } from 'next/server';
import { findMFVendorByName } from '@/lib/db';

// GET: 単一の取引先名チェック（InvoiceFormから使用）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  if (!name) {
    return NextResponse.json({ matched: false });
  }
  return NextResponse.json({ matched: findMFVendorByName(name) !== null });
}

// POST: 複数の取引先名を一括チェック
export async function POST(request: NextRequest) {
  const { vendorNames } = await request.json();
  if (!Array.isArray(vendorNames)) {
    return NextResponse.json({ error: 'vendorNames配列が必要です' }, { status: 400 });
  }

  const results: Record<string, boolean> = {};
  for (const name of vendorNames) {
    results[name] = findMFVendorByName(name) !== null;
  }

  return NextResponse.json(results);
}
