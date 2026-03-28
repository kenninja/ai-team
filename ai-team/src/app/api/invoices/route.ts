import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, getAllVendors } from '@/lib/db';

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { vendorName, totalAmount, taxAmount, invoiceDate, dueDate, accountItem, summary, status } = body;

  if (!vendorName) {
    return NextResponse.json({ error: '取引先名が必要です' }, { status: 400 });
  }

  const id = createInvoice({
    vendorName: vendorName,
    totalAmount: totalAmount || null,
    taxAmount: taxAmount || null,
    invoiceDate: invoiceDate || null,
    dueDate: dueDate || null,
    accountTitle: accountItem || null,
    description: summary || null,
  });

  // ステータスを設定（createInvoiceはデフォルト'pending'）
  if (status && status !== 'pending') {
    updateInvoice(id, { status });
  }

  const created = getInvoice(id);
  return NextResponse.json(created);
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

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'idが必要です' }, { status: 400 });
  }

  const existing = getInvoice(id);
  if (!existing) {
    return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 });
  }

  deleteInvoice(id);
  return NextResponse.json({ success: true });
}
