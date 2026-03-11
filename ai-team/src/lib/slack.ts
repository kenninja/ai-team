import { App } from '@slack/bolt';

// Next.js dev modeではモジュールが複数回ロードされるため、globalThisで状態を共有
const globalForSlack = globalThis as unknown as { __slackApp?: App };

function getSlackApp(): App | null {
  return globalForSlack.__slackApp || null;
}

function setSlackApp(app: App) {
  globalForSlack.__slackApp = app;
}

export function isSlackConnected(): boolean {
  return getSlackApp() !== null;
}

export async function initSlackApp(): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !appToken || !signingSecret) {
    console.log('[slack] トークン未設定のためスキップ');
    return;
  }

  const slackApp = new App({
    token: botToken,
    appToken: appToken,
    signingSecret: signingSecret,
    socketMode: true,
  });
  setSlackApp(slackApp);

  // エラーハンドラー
  slackApp.error(async (error) => {
    console.error('[slack] エラー:', error);
  });

  // メッセージリスナー
  slackApp.message(async ({ message, client }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = message as any;

    // botメッセージはスキップ
    if (msg.subtype || msg.bot_id) return;
    if (!msg.text) return;

    const { isSlackMessageProcessed, saveSlackMessage, markSlackTaskCreated } = await import('./db');
    const channelId = msg.channel;
    const messageTs = msg.ts;

    if (isSlackMessageProcessed(channelId, messageTs)) return;

    // ユーザー情報取得
    let userName = 'Unknown';
    try {
      if (msg.user) {
        const userInfo = await client.users.info({ user: msg.user });
        userName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';
      }
    } catch { /* ignore */ }

    // チャンネル情報取得
    let channelName = channelId;
    try {
      const channelInfo = await client.conversations.info({ channel: channelId });
      channelName = channelInfo.channel?.name || channelId;
    } catch { /* ignore */ }

    // AI分析
    const { generateText } = await import('./gemini');
    const { extractJson } = await import('./json-extract');

    const analysisPrompt = `あなたはSlackメッセージ分析の専門家です。
以下のSlackメッセージを分析し、JSON形式で返してください:
{
  "needs_reply": true/false,
  "reply_urgency": "high/medium/low/none",
  "reply_draft": "返信が必要な場合の返信ドラフト（不要ならnull）",
  "summary": "メッセージの1行要約"
}

判断基準:
- 質問や確認依頼 → needs_reply: true
- 情報共有のみ・雑談 → needs_reply: false
- botやシステム通知 → needs_reply: false`;

    const input = `チャンネル: #${channelName}\n送信者: ${userName}\n\n${msg.text}`;

    let analysis = { needs_reply: false, reply_urgency: 'none', reply_draft: null as string | null, summary: '' };
    try {
      const { waitForRateLimit } = await import('./rate-limiter');
      await waitForRateLimit();
      const response = await generateText(analysisPrompt, input);
      analysis = extractJson(response);
    } catch (err) {
      console.error('[slack] AI分析エラー:', err);
    }

    // 自分へのメンション判定
    const myUserId = process.env.SLACK_MY_USER_ID;
    const mentionedMe = myUserId ? msg.text.includes(`<@${myUserId}>`) : false;

    // DB保存
    saveSlackMessage({
      messageTs,
      channelId,
      channelName,
      userId: msg.user || '',
      userName,
      text: msg.text,
      threadTs: msg.thread_ts,
      needsReply: analysis.needs_reply,
      replyUrgency: analysis.reply_urgency || undefined,
      replyDraft: analysis.reply_draft || undefined,
      summary: analysis.summary || undefined,
      mentionedMe,
    });

    // タスク自動作成
    try {
      const { waitForRateLimit } = await import('./rate-limiter');
      await waitForRateLimit();
      const { analyzeAndCreateTask } = await import('./task-creator');
      const taskResult = await analyzeAndCreateTask({
        source: 'slack',
        sourceId: `${channelId}:${messageTs}`,
        senderName: userName,
        text: msg.text,
        channelOrThread: `#${channelName}`,
      });
      if (taskResult.created) {
        markSlackTaskCreated(channelId, messageTs);
      }
    } catch (err) {
      console.error('[slack] タスク作成エラー:', err);
    }

    console.log(`[slack] 処理完了: #${channelName} ${userName} (返信要: ${analysis.needs_reply})`);
  });

  // --- メール返信ボタン: そのまま送信 ---
  slackApp.action('mail_reply_send', async ({ action, ack, client, body }) => {
    await ack();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = JSON.parse((action as any).value);
      const { messageId, draft } = value;

      const { sendReply } = await import('./gmail');
      const { markReplySent, getProcessedEmail } = await import('./db');
      const processed = getProcessedEmail(messageId) as {
        thread_id: string; subject: string; sender_email: string;
      } | undefined;

      if (!processed) {
        await client.chat.postMessage({
          channel: body.channel?.id || body.user.id,
          text: '❌ メール情報が見つかりませんでした',
        });
        return;
      }

      await sendReply(processed.thread_id, processed.sender_email, processed.subject, draft, messageId);
      markReplySent(messageId);

      // 元メッセージを更新してボタンを消す
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalMessage = (body as any).message;
      if (originalMessage) {
        await client.chat.update({
          channel: body.channel?.id || '',
          ts: originalMessage.ts,
          text: `✅ 返信送信済み「${processed.subject}」`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `✅ *返信送信済み*\n宛先: ${processed.sender_email}\n件名: ${processed.subject}` } },
            { type: 'divider' },
          ],
        });
      }

      console.log(`[slack] メール返信送信: ${processed.subject}`);
    } catch (err) {
      console.error('[slack] メール返信エラー:', err);
      await client.chat.postMessage({
        channel: body.channel?.id || body.user.id,
        text: `❌ 返信送信エラー: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // --- メール返信ボタン: 編集して送信（ダイアログ表示） ---
  slackApp.action('mail_reply_edit', async ({ action, ack, client, body }) => {
    await ack();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = JSON.parse((action as any).value);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const triggerId = (body as any).trigger_id;

      await client.views.open({
        trigger_id: triggerId,
        view: {
          type: 'modal',
          callback_id: 'mail_reply_modal',
          private_metadata: JSON.stringify({ messageId: value.messageId }),
          title: { type: 'plain_text', text: 'メール返信' },
          submit: { type: 'plain_text', text: '送信' },
          close: { type: 'plain_text', text: 'キャンセル' },
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*宛先:* ${value.from}\n*件名:* ${value.subject}` },
            },
            {
              type: 'input',
              block_id: 'reply_block',
              label: { type: 'plain_text', text: '返信内容' },
              element: {
                type: 'plain_text_input',
                action_id: 'reply_text',
                multiline: true,
                initial_value: value.draft,
              },
            },
          ],
        },
      });
    } catch (err) {
      console.error('[slack] ダイアログ表示エラー:', err);
    }
  });

  // --- メール返信不要ボタン ---
  slackApp.action('mail_no_reply', async ({ action, ack, client, body }) => {
    await ack();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = JSON.parse((action as any).value);
      const { messageId, subject } = value;

      const { markNoReplyNeeded } = await import('./db');
      markNoReplyNeeded(messageId);

      // 元メッセージを更新してボタンを消す
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalMessage = (body as any).message;
      if (originalMessage) {
        await client.chat.update({
          channel: body.channel?.id || '',
          ts: originalMessage.ts,
          text: `🚫 返信不要「${subject}」`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `🚫 *返信不要にしました*\n件名: ${subject}` } },
            { type: 'divider' },
          ],
        });
      }

      console.log(`[slack] 返信不要: ${subject}`);
    } catch (err) {
      console.error('[slack] 返信不要エラー:', err);
    }
  });

  // --- モーダル送信ハンドラー ---
  slackApp.view('mail_reply_modal', async ({ ack, view, client, body }) => {
    await ack();
    try {
      const metadata = JSON.parse(view.private_metadata);
      const { messageId } = metadata;
      const replyText = view.state.values.reply_block.reply_text.value || '';

      const { sendReply } = await import('./gmail');
      const { markReplySent, getProcessedEmail } = await import('./db');
      const processed = getProcessedEmail(messageId) as {
        thread_id: string; subject: string; sender_email: string;
      } | undefined;

      if (!processed) {
        await client.chat.postMessage({
          channel: body.user.id,
          text: '❌ メール情報が見つかりませんでした',
        });
        return;
      }

      await sendReply(processed.thread_id, processed.sender_email, processed.subject, replyText, messageId);
      markReplySent(messageId);

      await client.chat.postMessage({
        channel: body.user.id,
        text: `✅ 返信送信済み「${processed.subject}」→ ${processed.sender_email}`,
      });

      console.log(`[slack] メール返信送信（編集後）: ${processed.subject}`);
    } catch (err) {
      console.error('[slack] モーダル返信エラー:', err);
      await client.chat.postMessage({
        channel: body.user.id,
        text: `❌ 返信送信エラー: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  await slackApp.start();
  console.log('[slack] Socket Mode接続完了');
}

export async function sendSlackReply(
  channelId: string,
  text: string,
  threadTs?: string
): Promise<string> {
  const app = getSlackApp();
  if (!app) throw new Error('Slack未接続');
  const result = await app.client.chat.postMessage({
    channel: channelId,
    text,
    thread_ts: threadTs,
  });
  return result.ts || '';
}

/**
 * ユーザーにSlack DMを送信
 */
export async function sendSlackDM(userId: string, text: string): Promise<string> {
  const app = getSlackApp();
  if (!app) throw new Error('Slack未接続');

  // DMチャンネルを開く
  const dm = await app.client.conversations.open({ users: userId });
  const channelId = dm.channel?.id;
  if (!channelId) throw new Error('DMチャンネルを開けませんでした');

  const result = await app.client.chat.postMessage({
    channel: channelId,
    text,
  });
  return result.ts || '';
}
