import { NextResponse } from 'next/server';
import { getSlackMessage } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: { channelId: string; messageTs: string } }
) {
  const message = getSlackMessage(params.channelId, params.messageTs);
  if (!message) {
    return NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ message });
}
