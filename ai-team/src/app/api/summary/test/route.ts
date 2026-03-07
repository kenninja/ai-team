import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';

/**
 * GET /api/summary/test — デバッグ付き日次サマリー即時送信
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const userId = process.env.SLACK_MY_USER_ID;
  const botToken = process.env.SLACK_BOT_TOKEN;

  // デバッグ: 環境変数チェック
  if (!userId) {
    return NextResponse.json({ success: false, reason: 'SLACK_MY_USER_ID が未設定' });
  }
  if (!botToken) {
    return NextResponse.json({ success: false, reason: 'SLACK_BOT_TOKEN が未設定' });
  }

  try {
    const client = new WebClient(botToken);

    // DM送信テスト
    const dm = await client.conversations.open({ users: userId });
    const channelId = dm.channel?.id;
    if (!channelId) {
      return NextResponse.json({ success: false, reason: 'DMチャンネルを開けなかった' });
    }

    // sendDailySummary を呼ぶ
    const { sendDailySummary } = await import('@/lib/summary-cron');
    const success = await sendDailySummary();

    return NextResponse.json({
      success,
      message: success ? 'サマリーをSlack DMに送信しました' : 'sendDailySummary が false を返した',
      debug: { userId: userId.slice(0, 5) + '...', botToken: botToken.slice(0, 10) + '...', dmChannelId: channelId },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, reason: 'エラー発生', error: errorMsg });
  }
}
