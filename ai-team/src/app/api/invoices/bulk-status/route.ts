import { NextRequest, NextResponse } from 'next/server';
import { updateInvoice } from '@/lib/db';

export async function PATCH(request: NextRequest) {
  const { ids, status } = await request.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'idsが必要です' }, { status: 400 });
  }

  if (!['pending', 'ready', 'exported'].includes(status)) {
    return NextResponse.json({ error: 'status は pending, ready, exported のいずれかです' }, { status: 400 });
  }

  for (const id of ids) {
    updateInvoice(id, { status });
  }

  return NextResponse.json({ updated: ids.length });
}
