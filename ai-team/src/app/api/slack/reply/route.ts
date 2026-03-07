import { NextResponse } from 'next/server';
import { sendSlackReply, isSlackConnected } from '@/lib/slack';
import { markSlackReplySent, updateSlackReplyDraft } from '@/lib/db';

export async function POST(request: Request) {
  if (!isSlackConnected()) {
    return NextResponse.json({ error: 'Slack未接続' }, { status: 401 });
  }

  const { channelId, messageTs, replyText, threadTs } = await request.json();
  if (!channelId || !replyText) {
    return NextResponse.json({ error: 'channelId, replyText は必須です' }, { status: 400 });
  }

  try {
    updateSlackReplyDraft(channelId, messageTs, replyText);
    await sendSlackReply(channelId, replyText, threadTs || messageTs);
    markSlackReplySent(channelId, messageTs);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Slack reply error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '返信送信エラー' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const { channelId, messageTs, replyText } = await request.json();
  if (!channelId || !messageTs || !replyText) {
    return NextResponse.json({ error: 'channelId, messageTs, replyText は必須です' }, { status: 400 });
  }
  updateSlackReplyDraft(channelId, messageTs, replyText);
  return NextResponse.json({ success: true });
}
