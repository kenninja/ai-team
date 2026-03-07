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

  console.log('[mail-cron] スケジュール登録完了: 5分ごとチェック + 毎時リマインダー');
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
    const { isEmailProcessed, saveProcessedEmail, createInvoice, findVendorByName } = await import('./db');
    const { generateText } = await import('./gemini');
    const { extractJson } = await import('./json-extract');
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
- 返信ドラフトはビジネスにふさわしい丁寧な日本語で作成してください`;

        const attachmentNames = detail.attachments.map(a => a.filename).join(', ');
        const input = `件名: ${detail.subject}\n差出人: ${detail.from} <${detail.fromEmail}>\n添付: ${attachmentNames || 'なし'}\n\n本文:\n${detail.bodyText || '(なし)'}`;

        await waitForRateLimit();
        const analysisResponse = await generateText(analysisPrompt, input);
        let analysis: { needs_reply: boolean; reply_urgency: string; reply_draft: string; has_invoice: boolean; summary: string };
        try {
          analysis = extractJson(analysisResponse);
        } catch {
          analysis = { needs_reply: false, reply_urgency: 'none', reply_draft: '', has_invoice: false, summary: '分析失敗' };
        }

        // 請求書処理
        let invoiceId: number | undefined;
        if (analysis.has_invoice) {
          const { ocrInvoice } = await import('./invoice-ocr');
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

              const ocrData = await ocrInvoice(fileBuffer, att.mimeType);
              const vendor = ocrData.vendor_name ? findVendorByName(ocrData.vendor_name) : undefined;

              invoiceId = createInvoice({
                emailMessageId: email.messageId,
                filePath: `/uploads/${fileName}`,
                vendorName: ocrData.vendor_name || undefined,
                invoiceDate: ocrData.invoice_date || undefined,
                dueDate: ocrData.due_date || undefined,
                totalAmount: ocrData.total_amount || undefined,
                taxAmount: ocrData.tax_amount || undefined,
                taxRate: ocrData.tax_rate || undefined,
                description: ocrData.description || undefined,
                invoiceNumber: ocrData.invoice_number || undefined,
                accountTitle: vendor?.account_title || undefined,
                subAccount: vendor?.sub_account || undefined,
                taxCategory: vendor?.tax_category || undefined,
                department: vendor?.department || undefined,
              });
            } catch (err) {
              console.error('[mail-cron] OCRエラー:', err);
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
          const blocks: unknown[] = [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `📬 *新着メール（要返信）*\n${icon} *${detail.from}*「${detail.subject}」\n📝 ${analysis.summary}` },
            },
          ];
          if (analysis.reply_draft) {
            blocks.push({
              type: 'section',
              text: { type: 'mrkdwn', text: `✏️ *AI返信案：*\n${analysis.reply_draft}` },
            });
            blocks.push({
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ このまま送信' },
                  style: 'primary',
                  action_id: 'mail_reply_send',
                  value: JSON.stringify({ messageId: email.messageId, draft: analysis.reply_draft }),
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✏️ 編集して送信' },
                  action_id: 'mail_reply_edit',
                  value: JSON.stringify({ messageId: email.messageId, draft: analysis.reply_draft, subject: detail.subject, from: detail.from }),
                },
              ],
            });
          }
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
    const { getUnrepliedEmails } = await import('./db');
    const unreplied = getUnrepliedEmails() as {
      subject: string; sender: string; reply_urgency: string; received_at: number; reply_draft: string | null;
    }[];

    if (unreplied.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const twoHours = 2 * 60 * 60;

    // 2時間以上経過した未返信メールのみ
    const overdue = unreplied.filter(e => (now - e.received_at) >= twoHours);
    if (overdue.length === 0) return;

    const lines = [`⏰ 未返信リマインド (${overdue.length}件)`];
    for (const email of overdue.slice(0, 5)) {
      const icon = email.reply_urgency === 'high' ? '🔴' : email.reply_urgency === 'medium' ? '🟡' : '🟢';
      const hours = Math.floor((now - email.received_at) / 3600);
      lines.push(`${icon} *${email.sender}*「${email.subject}」(${hours}時間経過)`);
      if (email.reply_draft) {
        lines.push(`   ✏️ AI返信案：${email.reply_draft}`);
      }
    }
    if (overdue.length > 5) {
      lines.push(`   ...他 ${overdue.length - 5}件`);
    }
    lines.push(`\n─────────────────`);

    await notifySlackDM(lines.join('\n'));
    console.log(`[mail-cron] リマインダー送信: ${overdue.length}件`);
  } catch (err) {
    console.error('[mail-cron] リマインダーエラー:', err);
  }
}
