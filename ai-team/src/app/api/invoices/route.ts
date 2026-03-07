import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, getInvoice, updateInvoice, getAllVendors } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const type = searchParams.get('type');

  if (type === 'vendors') {
    return NextResponse.json(getAllVendors());
  }

  const invoices = getInvoices(status);
  return NextResponse.json(invoices);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: 'idが必要です' }, { status: 400 });
  }

  const existing = getInvoice(id);
  if (!existing) {
    return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 });
  }

  updateInvoice(id, data);
  const updated = getInvoice(id);
  return NextResponse.json(updated);
}
