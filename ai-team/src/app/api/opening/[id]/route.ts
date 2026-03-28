import { NextResponse } from 'next/server';
import { deleteOpeningProperty } from '@/lib/db';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const propertyId = Number(params.id);
    if (!Number.isFinite(propertyId) || propertyId < 1) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 });
    }

    const deleted = deleteOpeningProperty(propertyId);
    if (!deleted) {
      return NextResponse.json({ error: '物件が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[opening DELETE]', e);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
