import cron from 'node-cron';
import { WebClient } from '@slack/web-api';
import { isGmailConnected } from './gmail-auth';

let initialized = false;

/**
 * メール自動チェック + 即時通知のスケジュールを開始
 * 5分ごとにチェック、返信必要なメールのみSlack DMで通知
 */
export function startMailCron() {
  if (initialized) return;
  initialized = true;

  // 5分ごとにチェック
  cron.schedule('*/5 * * * *', async () => {
    await processNewEmails();
  });

  // 未返信リマインダー: 毎時0分にチェック
  cron.schedule('0 * * * *', async () => {
    await sendUnrepliedReminders();
  });

  // Gmail 分類（未読・過去24h）: 毎朝 9:00 JST
  cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        const { runGmailClassifyJob } = await import('./gmail-classify');
        console.log('[mail-cron] Gmail分類ジョブ開始');
        const r = await runGmailClassifyJob();
        console.log(
          `[mail-cron] Gmail分類完了 fetched=${r.fetched} classified=${r.classified} tasks=${r.tasksCreated} slack=${r.slackAlerts}`,
        );
      } catch (e) {
        console.error('[mail-cron] Gmail分類ジョブエラー:', e);
      }
    },
    { timezone: 'Asia/Tokyo' },
  );

  console.log('[mail-cron] スケジュール登録完了: 5分ごとチェック + 毎時リマインダー + 毎朝9時Gmail分類');
}

/**
 * Slack DMで通知を送信
 */
async function notifySlackDM(text: string, blocks?: unknown[]) {
  const userId = process.env.SLACK_MY_USER_ID;
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!userId || !botToken) return;

  try {
    const client = new WebClient(botToken);
    const dm = await client.conversations.open({ users: userId });
    const channelId = dm.channel?.id;
    if (!channelId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg: any = { channel: channelId, text };
    if (blocks) msg.blocks = blocks;
    await client.chat.postMessage(msg);
  } catch (err) {
    console.error('[mail-cron] Slack通知エラー:', err);
  }
}

async function processNewEmails() {
  try {
    if (!isGmailConnected()) return;

    const { fetchEmails } = await import('./gmail');
    const { isEmailProcessed, saveProcessedEmail, createInvoice } = await import('./db');
    const { claudeHaikuGenerateText } = await import('./claude-haiku');
    const { extractJsonLenient } = await import('./json-extract');
    const { waitForRateLimit } = await import('./rate-limiter');

    // 直近のメールを取得
    const emails = await fetchEmails(20, 'in:inbox newer_than:1d');
    const unprocessed = emails.filter(e => !isEmailProcessed(e.messageId));

    if (unprocessed.length === 0) return;

    console.log(`[mail-cron] 未処理メール ${unprocessed.length}件を処理中...`);

    for (const email of unprocessed) {
      try {
        const { fetchEmailDetail, downloadAttachment, addLabel } = await import('./gmail');
        const detail = await fetchEmailDetail(email.messageId);

        // AI分析
        const analysisPrompt = `あなたはビジネスメール分析の専門家です。
以下のメールを分析し、JSON形式で結果を返してください。JSONのみを返してください。

{
  "needs_reply": true/false,
  "reply_urgency": "high/medium/low/none",
  "reply_draft": "返信ドラフト（返信不要ならnull）",
  "has_invoice": true/false,
  "summary": "メールの要約（1-2文）"
}

注意:
- 広告、ニュースレター、自動通知メールには返信不要です
- 請求書の判定は添付ファイル名に"請求","invoice","bill"が含まれるか、PDFファイルの添付があるかで判断
- 返信ドラフトはビジネスにふさわしい丁寧な日本語で作成してください
- needs_reply が true のときは reply_draft に必ず返信案の文字列を入れること（null や空文字にしないこと）`;

        const attachmentNames = detail.attachments.map(a => a.filename).join(', ');
        const input = `件名: ${detail.subject}\n差出人: ${detail.from} <${detail.fromEmail}>\n添付: ${attachmentNames || 'なし'}\n\n本文:\n${detail.bodyText || '(なし)'}`;

        await waitForRateLimit();
        const analysisResponse = await claudeHaikuGenerateText(analysisPrompt, input);
        type MailAnalysis = {
          needs_reply: boolean;
          reply_urgency: string;
          reply_draft: string;
          has_invoice: boolean;
          summary: string;
        };
        let analysis: MailAnalysis;
        try {
          const raw = extractJsonLenient<Record<string, unknown>>(analysisResponse);
          const draftRaw = raw.reply_draft;
          const draftStr =
            draftRaw === null || draftRaw === undefined
              ? ''
              : String(draftRaw).trim();
          analysis = {
            needs_reply: Boolean(raw.needs_reply),
            reply_urgency: typeof raw.reply_urgency === 'string' ? raw.reply_urgency : 'none',
            reply_draft: draftStr,
            has_invoice: Boolean(raw.has_invoice),
            summary: typeof raw.summary === 'string' ? raw.summary : '',
          };
        } catch {
          analysis = {
            needs_reply: false,
            reply_urgency: 'none',
            reply_draft: '',
            has_invoice: false,
            summary: '分析失敗',
          };
        }

        // 請求書処理（ファイル保存のみ、手入力で後から詳細を埋める）
        let invoiceId: number | undefined;
        if (analysis.has_invoice) {
          const invoiceAttachments = detail.attachments.filter(a => /\.(pdf|jpg|jpeg|png)$/i.test(a.filename));

          for (const att of invoiceAttachments) {
            try {
              const fileBuffer = await downloadAttachment(email.messageId, att.attachmentId);
              const { writeFile, mkdir } = await import('fs/promises');
              const { existsSync } = await import('fs');
              const path = await import('path');
              const { v4: uuidv4 } = await import('uuid');

              const uploadDir = path.join(process.cwd(), 'public', 'uploads');
              if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

              const ext = path.extname(att.filename);
              const fileName = `${uuidv4()}${ext}`;
              await writeFile(path.join(uploadDir, fileName), fileBuffer);

              invoiceId = createInvoice({
                emailMessageId: email.messageId,
                filePath: `/uploads/${fileName}`,
                description: `${detail.from}からの請求書 (${att.filename})`,
              });
            } catch (err) {
              console.error('[mail-cron] 請求書保存エラー:', err);
            }
          }
        }

        // DB保存
        const receivedAt = Math.floor(new Date(detail.date).getTime() / 1000) || Math.floor(Date.now() / 1000);
        saveProcessedEmail({
          messageId: email.messageId,
          threadId: email.threadId,
          subject: detail.subject,
          sender: detail.from,
          senderEmail: detail.fromEmail,
          bodyText: detail.bodyText.substring(0, 5000),
          receivedAt,
          needsReply: analysis.needs_reply,
          replyUrgency: analysis.reply_urgency,
          replyDraft: analysis.reply_draft || undefined,
          hasInvoice: analysis.has_invoice,
          invoiceId,
          summary: analysis.summary,
        });

        try { await addLabel(email.messageId, 'AI処理済み'); } catch { /* ignore */ }

        // タスク自動作成
        try {
          await waitForRateLimit();
          const { analyzeAndCreateTask } = await import('./task-creator');
          const taskResult = await analyzeAndCreateTask({
            source: 'mail',
            sourceId: email.messageId,
            senderName: detail.from,
            subject: detail.subject,
            text: detail.bodyText.substring(0, 2000),
          });
          if (taskResult.created) {
            console.log(`[mail-cron] タスク作成: "${taskResult.taskTitle}"`);
          }
        } catch (err) {
          console.error('[mail-cron] タスク作成エラー:', err);
        }

        // 返信が必要なメールのみSlack DMで即時通知（ボタン付き）
        if (analysis.needs_reply) {
          const icon = analysis.reply_urgency === 'high' ? '🔴' : analysis.reply_urgency === 'medium' ? '🟡' : '🟢';
          const fallback = `📬 ${detail.from}「${detail.subject}」`;
          const draft = analysis.reply_draft.trim();
          const blocks: unknown[] = [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `📬 *新着メール（要返信）*\n${icon} *${detail.from}*「${detail.subject}」\n📝 ${analysis.summary}` },
            },
          ];
          if (draft) {
            blocks.push({
              type: 'section',
              text: { type: 'mrkdwn', text: `✏️ *AI返信案：*\n${draft}` },
            });
          }
          // Claude 等で reply_draft が空でも、編集・返信不要は出す（このまま送信は下書きがあるときのみ）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const elements: any[] = [];
          if (draft) {
            elements.push({
              type: 'button',
              text: { type: 'plain_text', text: '✅ このまま送信' },
              style: 'primary',
              action_id: 'mail_reply_send',
              value: JSON.stringify({ messageId: email.messageId, draft }),
            });
          }
          elements.push(
            {
              type: 'button',
              text: { type: 'plain_text', text: '✏️ 編集して送信' },
              action_id: 'mail_reply_edit',
              value: JSON.stringify({
                messageId: email.messageId,
                draft,
                subject: detail.subject,
                from: detail.from,
              }),
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '🚫 返信不要' },
              action_id: 'mail_no_reply',
              value: JSON.stringify({ messageId: email.messageId, subject: detail.subject }),
            },
          );
          blocks.push({ type: 'actions', elements });
          blocks.push({ type: 'divider' });
          await notifySlackDM(fallback, blocks);
        }

        console.log(`[mail-cron] 処理完了: ${detail.subject} (返信要: ${analysis.needs_reply}, 請求書: ${analysis.has_invoice})`);
      } catch (err) {
        console.error(`[mail-cron] メール処理エラー (${email.messageId}):`, err);
      }
    }

    console.log(`[mail-cron] 完了: ${unprocessed.length}件処理`);
  } catch (error) {
    console.error('[mail-cron] エラー:', error);
  }
}

/**
 * 未返信リマインダー: 2時間以上放置されている未返信メールを再通知
 */
async function sendUnrepliedReminders() {
  try {
    const { getUnrepliedEmails, autoExpireOldUnreplied } = await import('./db');

    // 7日以上経過した未返信メールを自動クリア
    const expired = autoExpireOldUnreplied(7);
    if (expired > 0) {
      console.log(`[mail-cron] ${expired}件の古い未返信メールを自動クリア`);
    }

    const unreplied = getUnrepliedEmails();

    if (unreplied.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const twoHours = 2 * 60 * 60;

    // 2時間以上経過した未返信メールのみ
    const overdue = unreplied.filter(e => (now - e.received_at) >= twoHours);
    if (overdue.length === 0) return;

    // Block Kit形式でボタン付きリマインドを送信
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `⏰ *未返信リマインド (${overdue.length}件)*` } },
      { type: 'divider' },
    ];

    for (const email of overdue.slice(0, 10)) {
      const icon = email.reply_urgency === 'high' ? '🔴' : email.reply_urgency === 'medium' ? '🟡' : '🟢';
      const elapsed = now - email.received_at;
      const days = Math.floor(elapsed / 86400);
      const hours = Math.floor(elapsed / 3600);
      const timeStr = days > 0 ? `${days}日超過` : `${hours}時間経過`;

      let text = `${icon} *${email.sender}*\n「${email.subject}」(${timeStr})`;
      if (email.reply_draft) {
        text += `\n✏️ AI返信案：${email.reply_draft}`;
      }

      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text },
      });
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ 対応済み' },
            action_id: 'reminder_mark_replied',
            value: JSON.stringify({ messageId: email.message_id, subject: email.subject }),
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '🚫 返信不要' },
            action_id: 'reminder_no_reply',
            value: JSON.stringify({ messageId: email.message_id, subject: email.subject }),
          },
        ],
      });
    }

    if (overdue.length > 10) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `...他 ${overdue.length - 10}件` } });
    }

    // 一括クリアボタン
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '🗑️ 全件クリア' },
          action_id: 'reminder_clear_all',
          style: 'danger',
          confirm: {
            title: { type: 'plain_text', text: '確認' },
            text: { type: 'mrkdwn', text: `未返信 ${overdue.length}件 を全てクリアしますか？` },
            confirm: { type: 'plain_text', text: 'クリア' },
            deny: { type: 'plain_text', text: 'キャンセル' },
          },
        },
      ],
    });

    const fallback = `⏰ 未返信リマインド (${overdue.length}件)`;
    await notifySlackDM(fallback, blocks);
    console.log(`[mail-cron] リマインダー送信: ${overdue.length}件`);
  } catch (err) {
    console.error('[mail-cron] リマインダーエラー:', err);
  }
}
