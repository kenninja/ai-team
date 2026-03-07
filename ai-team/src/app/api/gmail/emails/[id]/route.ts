import { NextRequest, NextResponse } from 'next/server';
import { fetchEmailDetail } from '@/lib/gmail';
import { getProcessedEmail } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const detail = await fetchEmailDetail(params.id);
    const processed = getProcessedEmail(params.id);

    return NextResponse.json({ email: detail, processed });
  } catch (error) {
    console.error('Email detail error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'メール詳細取得エラー' },
      { status: 500 }
    );
  }
}
