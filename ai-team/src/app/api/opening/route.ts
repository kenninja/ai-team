import { NextRequest, NextResponse } from 'next/server';
import { createOpeningProperty, listOpeningPropertiesWithDetails } from '@/lib/db';
import type { PropertyStatus } from '@/types/opening';

export async function GET() {
  try {
    const result = listOpeningPropertiesWithDetails();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[opening GET]', e);
    return NextResponse.json({ error: '一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { property_name, area, target_open_month, rent, status } = body as {
      property_name?: string;
      area?: string;
      target_open_month?: string | null;
      rent?: number | null | string;
      status?: PropertyStatus;
    };

    if (!property_name?.trim() || !area?.trim()) {
      return NextResponse.json({ error: '物件名とエリアは必須です' }, { status: 400 });
    }

    let rentOut: number | null = null;
    if (rent != null && rent !== '') {
      const n = typeof rent === 'number' ? rent : Number(String(rent));
      if (Number.isFinite(n)) rentOut = Math.round(n);
    }
    const id = createOpeningProperty({
      property_name: property_name.trim(),
      area: area.trim(),
      target_open_month: target_open_month ?? null,
      rent: rentOut,
      status: status ?? 'candidate',
    });

    return NextResponse.json({ id });
  } catch (e) {
    console.error('[opening POST]', e);
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }
}
