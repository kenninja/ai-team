import { NextRequest, NextResponse } from 'next/server';
import { sendReply } from '@/lib/gmail';
import { markReplySent, updateReplyDraft, getProcessedEmail } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { messageId, replyText } = body;

  if (!messageId || !replyText) {
    return NextResponse.json({ error: 'messageIdとreplyTextが必要です' }, { status: 400 });
  }

  // 処理済みメール情報を取得
  const processed = getProcessedEmail(messageId) as {
    message_id: string; thread_id: string; subject: string;
    sender_email: string;
  } | undefined;

  if (!processed) {
    return NextResponse.json({ error: '処理済みメールが見つかりません' }, { status: 404 });
  }

  try {
    // 返信ドラフトを更新
    updateReplyDraft(messageId, replyText);

    // 返信を送信
    const sentId = await sendReply(
      processed.thread_id,
      processed.sender_email,
      processed.subject,
      replyText,
      messageId
    );

    // 送信済みフラグを更新
    markReplySent(messageId);

    return NextResponse.json({ success: true, sentMessageId: sentId });
  } catch (error) {
    console.error('Reply send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '返信送信エラー' },
      { status: 500 }
    );
  }
}

// 返信ドラフトの更新（送信せずに保存のみ）
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { messageId, replyText } = body;

  if (!messageId || !replyText) {
    return NextResponse.json({ error: 'messageIdとreplyTextが必要です' }, { status: 400 });
  }

  updateReplyDraft(messageId, replyText);
  return NextResponse.json({ success: true });
}
