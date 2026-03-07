import { NextRequest, NextResponse } from 'next/server';
import { fetchEmails } from '@/lib/gmail';
import { isGmailConnected } from '@/lib/gmail-auth';
import { isEmailProcessed } from '@/lib/db';

export async function GET(request: NextRequest) {
  if (!isGmailConnected()) {
    return NextResponse.json({ error: 'Gmail未接続', connected: false }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || undefined;
  const max = parseInt(searchParams.get('max') || '20');

  try {
    const emails = await fetchEmails(max, query);

    // 処理済みかどうかのフラグを追加
    const withStatus = emails.map(e => ({
      ...e,
      isProcessed: isEmailProcessed(e.messageId),
    }));

    return NextResponse.json({ emails: withStatus, connected: true });
  } catch (error) {
    console.error('Gmail fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'メール取得エラー' },
      { status: 500 }
    );
  }
}
