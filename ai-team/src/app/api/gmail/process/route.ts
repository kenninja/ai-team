import { NextRequest, NextResponse } from 'next/server';
import { fetchEmailDetail, downloadAttachment, addLabel } from '@/lib/gmail';
import { generateText } from '@/lib/gemini';
import { extractJson } from '@/lib/json-extract';
import { saveProcessedEmail, isEmailProcessed, createInvoice } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface EmailAnalysis {
  needs_reply: boolean;
  reply_urgency: string;
  reply_draft: string;
  has_invoice: boolean;
  summary: string;
}

const ANALYSIS_PROMPT = `あなたはビジネスメール分析の専門家です。
以下のメールを分析し、JSON形式で結果を返してください。JSONのみを返してください。

分析ポイント:
1. このメールに返信が必要かどうか
2. 返信が必要な場合、緊急度と返信ドラフト
3. 請求書やインボイスが添付されているかどうか（添付ファイル名から判断）
4. メールの要約

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { messageIds } = body;

  if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ error: 'messageIdsが必要です' }, { status: 400 });
  }

  const results = [];

  for (const messageId of messageIds) {
    // 既に処理済みならスキップ
    if (isEmailProcessed(messageId)) {
      results.push({ messageId, status: 'already_processed' });
      continue;
    }

    try {
      // メール詳細を取得
      const email = await fetchEmailDetail(messageId);

      // メール情報をまとめてAIに分析させる
      const attachmentNames = email.attachments.map(a => a.filename).join(', ');
      const analysisInput = `件名: ${email.subject}
差出人: ${email.from} <${email.fromEmail}>
日時: ${email.date}
添付ファイル: ${attachmentNames || 'なし'}

本文:
${email.bodyText || '(テキスト本文なし)'}`;

      const analysisResponse = await generateText(ANALYSIS_PROMPT, analysisInput);
      let analysis: EmailAnalysis;
      try {
        analysis = extractJson<EmailAnalysis>(analysisResponse);
      } catch {
        analysis = {
          needs_reply: false,
          reply_urgency: 'none',
          reply_draft: '',
          has_invoice: false,
          summary: 'メール分析に失敗しました',
        };
      }

      // 請求書添付がある場合、ファイルを保存し下書き請求書を作成
      let invoiceId: number | undefined;
      if (analysis.has_invoice) {
        const invoiceAttachments = email.attachments.filter(a =>
          /\.(pdf|jpg|jpeg|png)$/i.test(a.filename)
        );

        for (const att of invoiceAttachments) {
          try {
            const fileBuffer = await downloadAttachment(messageId, att.attachmentId);

            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            if (!existsSync(uploadDir)) {
              await mkdir(uploadDir, { recursive: true });
            }
            const ext = path.extname(att.filename);
            const fileName = `${uuidv4()}${ext}`;
            const filePath = path.join(uploadDir, fileName);
            await writeFile(filePath, fileBuffer);

            // 請求書レコードを作成（手入力で後から詳細を埋める）
            invoiceId = createInvoice({
              emailMessageId: messageId,
              filePath: `/uploads/${fileName}`,
              description: `${email.from}からの請求書 (${att.filename})`,
            });
          } catch (err) {
            console.error('Invoice save error:', err);
          }
        }
      }

      // 処理結果を保存
      const receivedAt = Math.floor(new Date(email.date).getTime() / 1000) || Math.floor(Date.now() / 1000);
      saveProcessedEmail({
        messageId,
        threadId: email.threadId,
        subject: email.subject,
        sender: email.from,
        senderEmail: email.fromEmail,
        bodyText: email.bodyText.substring(0, 5000), // 長すぎる場合は切り詰め
        receivedAt,
        needsReply: analysis.needs_reply,
        replyUrgency: analysis.reply_urgency,
        replyDraft: analysis.reply_draft || undefined,
        hasInvoice: analysis.has_invoice,
        invoiceId,
        summary: analysis.summary,
      });

      // 処理済みラベルを付与
      try {
        await addLabel(messageId, 'AI処理済み');
      } catch {
        // ラベル付与失敗は無視
      }

      // タスク自動作成
      let taskCreated = false;
      let taskTitle: string | undefined;
      try {
        const { analyzeAndCreateTask } = await import('@/lib/task-creator');
        const taskResult = await analyzeAndCreateTask({
          source: 'mail',
          sourceId: messageId,
          senderName: email.from,
          subject: email.subject,
          text: email.bodyText.substring(0, 2000),
        });
        taskCreated = taskResult.created;
        taskTitle = taskResult.taskTitle;
      } catch (err) {
        console.error('Task creation error:', err);
      }

      results.push({
        messageId,
        status: 'processed',
        analysis: {
          needsReply: analysis.needs_reply,
          replyUrgency: analysis.reply_urgency,
          hasInvoice: analysis.has_invoice,
          summary: analysis.summary,
          invoiceId,
          taskCreated,
          taskTitle,
        },
      });
    } catch (error) {
      console.error(`Process email ${messageId} error:`, error);
      results.push({
        messageId,
        status: 'error',
        error: error instanceof Error ? error.message : 'エラー',
      });
    }
  }

  return NextResponse.json({ results });
}
