import { google } from 'googleapis';
import { getAuthenticatedClient } from './gmail-auth';

export interface EmailSummary {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
  attachments: AttachmentInfo[];
  isUnread: boolean;
}

export interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailDetail extends EmailSummary {
  bodyText: string;
  bodyHtml: string;
}

function getGmail() {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Gmail未接続です。先にGmailを接続してください。');
  return google.gmail({ version: 'v1', auth });
}

/**
 * 受信メール一覧を取得
 */
export async function fetchEmails(maxResults = 20, query?: string): Promise<EmailSummary[]> {
  const gmail = getGmail();

  const q = query || 'in:inbox newer_than:7d';

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults,
  });

  const messageIds = listRes.data.messages || [];
  if (messageIds.length === 0) return [];

  const emails: EmailSummary[] = [];

  for (const msg of messageIds) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    });

    const headers = detail.data.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '(件名なし)';
    const fromRaw = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // From: "名前 <email>" or "email" を解析
    const fromMatch = fromRaw.match(/^"?(.+?)"?\s*<(.+?)>$/);
    const from = fromMatch ? fromMatch[1] : fromRaw;
    const fromEmail = fromMatch ? fromMatch[2] : fromRaw;

    // 添付ファイル情報
    const parts = detail.data.payload?.parts || [];
    const attachments: AttachmentInfo[] = [];
    collectAttachments(parts, attachments);

    const isUnread = (detail.data.labelIds || []).includes('UNREAD');

    emails.push({
      messageId: msg.id!,
      threadId: detail.data.threadId || '',
      subject,
      from,
      fromEmail,
      date,
      snippet: detail.data.snippet || '',
      hasAttachments: attachments.length > 0,
      attachments,
      isUnread,
    });
  }

  return emails;
}

function collectAttachments(parts: { filename?: string | null; mimeType?: string | null; body?: { attachmentId?: string | null; size?: number | null } | null; parts?: typeof parts }[], result: AttachmentInfo[]) {
  for (const part of parts) {
    if (part.filename && part.body?.attachmentId) {
      result.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
      });
    }
    if (part.parts) {
      collectAttachments(part.parts as typeof parts, result);
    }
  }
}

/**
 * メール詳細を取得（本文含む）
 */
export async function fetchEmailDetail(messageId: string): Promise<EmailDetail> {
  const gmail = getGmail();

  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = detail.data.payload?.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '(件名なし)';
  const fromRaw = headers.find(h => h.name === 'From')?.value || '';
  const date = headers.find(h => h.name === 'Date')?.value || '';

  const fromMatch = fromRaw.match(/^"?(.+?)"?\s*<(.+?)>$/);
  const from = fromMatch ? fromMatch[1] : fromRaw;
  const fromEmail = fromMatch ? fromMatch[2] : fromRaw;

  const attachments: AttachmentInfo[] = [];
  const parts = detail.data.payload?.parts || [];
  collectAttachments(parts, attachments);

  // 本文を抽出
  let bodyText = '';
  let bodyHtml = '';
  extractBody(detail.data.payload, (text, html) => {
    bodyText = text;
    bodyHtml = html;
  });

  const isUnread = (detail.data.labelIds || []).includes('UNREAD');

  return {
    messageId,
    threadId: detail.data.threadId || '',
    subject,
    from,
    fromEmail,
    date,
    snippet: detail.data.snippet || '',
    hasAttachments: attachments.length > 0,
    attachments,
    isUnread,
    bodyText,
    bodyHtml,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any, callback: (text: string, html: string) => void) {
  let text = '';
  let html = '';

  if (payload?.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/plain') text = decoded;
    if (payload.mimeType === 'text/html') html = decoded;
  }

  if (payload?.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        extractBody(part, (t, h) => {
          if (t) text = t;
          if (h) html = h;
        });
      }
    }
  }

  callback(text, html);
}

/**
 * 添付ファイルをダウンロード（base64で返す）
 */
export async function downloadAttachment(
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const gmail = getGmail();

  const attachment = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  const data = attachment.data.data || '';
  // Gmail APIはURL-safe base64を返す
  return Buffer.from(data, 'base64url');
}

/**
 * 返信メールを送信
 */
export async function sendReply(
  threadId: string,
  toEmail: string,
  subject: string,
  body: string,
  inReplyToMessageId: string
): Promise<string> {
  const gmail = getGmail();

  // メールのMessage-IDヘッダーを取得
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: inReplyToMessageId,
    format: 'metadata',
    metadataHeaders: ['Message-ID'],
  });
  const originalMessageIdHeader = original.data.payload?.headers?.find(
    h => h.name === 'Message-ID'
  )?.value || '';

  const rawMessage = [
    `To: ${toEmail}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${originalMessageIdHeader}`,
    `References: ${originalMessageIdHeader}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId,
    },
  });

  return res.data.id || '';
}

/**
 * メールにラベルを追加
 */
export async function addLabel(messageId: string, labelName: string) {
  const gmail = getGmail();

  // ラベルを取得または作成
  const labels = await gmail.users.labels.list({ userId: 'me' });
  let label = labels.data.labels?.find(l => l.name === labelName);

  if (!label) {
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: { name: labelName },
    });
    label = created.data;
  }

  if (label?.id) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: [label.id] },
    });
  }
}
