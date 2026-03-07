import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Message, Session } from '@/agents/types';

const DB_PATH = path.join(process.cwd(), 'data', 'ai-team.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // dataディレクトリがなければ作成
    const dir = path.dirname(DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      content TEXT NOT NULL,
      timestamp INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);

    -- Gmail認証トークン
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id TEXT PRIMARY KEY DEFAULT 'default',
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- 処理済みメール追跡
    CREATE TABLE IF NOT EXISTS processed_emails (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT,
      subject TEXT,
      sender TEXT,
      sender_email TEXT,
      body_text TEXT,
      received_at INTEGER,
      needs_reply INTEGER DEFAULT 0,
      reply_urgency TEXT,
      reply_draft TEXT,
      reply_sent INTEGER DEFAULT 0,
      has_invoice INTEGER DEFAULT 0,
      invoice_id INTEGER,
      summary TEXT,
      processed_at INTEGER DEFAULT (unixepoch())
    );

    -- 請求書
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_message_id TEXT,
      file_path TEXT,
      vendor_name TEXT,
      invoice_date TEXT,
      due_date TEXT,
      total_amount INTEGER,
      tax_amount INTEGER,
      tax_rate TEXT,
      description TEXT,
      invoice_number TEXT,
      account_title TEXT,
      sub_account TEXT,
      tax_category TEXT,
      department TEXT,
      status TEXT DEFAULT 'draft',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- ベンダーマスタ
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_name TEXT NOT NULL,
      account_title TEXT,
      sub_account TEXT,
      tax_category TEXT,
      department TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Slack処理済みメッセージ
    CREATE TABLE IF NOT EXISTS slack_messages (
      message_ts TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      user_id TEXT,
      user_name TEXT,
      text TEXT,
      thread_ts TEXT,
      needs_reply INTEGER DEFAULT 0,
      reply_urgency TEXT,
      reply_draft TEXT,
      reply_sent INTEGER DEFAULT 0,
      summary TEXT,
      task_created INTEGER DEFAULT 0,
      mentioned_me INTEGER DEFAULT 0,
      processed_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (channel_id, message_ts)
    );

    -- 自動生成タスク追跡
    CREATE TABLE IF NOT EXISTS auto_tasks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      firebase_synced INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // マイグレーション: mentioned_meカラム追加
  try {
    db.prepare('ALTER TABLE slack_messages ADD COLUMN mentioned_me INTEGER DEFAULT 0').run();
  } catch { /* カラムが既に存在する場合は無視 */ }

  // マイグレーション: calendar_event_idカラム追加
  try {
    db.prepare('ALTER TABLE auto_tasks ADD COLUMN calendar_event_id TEXT').run();
  } catch { /* カラムが既に存在する場合は無視 */ }

  // デフォルトベンダーのシード
  const vendorCount = db.prepare('SELECT COUNT(*) as count FROM vendors').get() as { count: number };
  if (vendorCount.count === 0) {
    const insertVendor = db.prepare(
      'INSERT INTO vendors (vendor_name, account_title, sub_account, tax_category, department) VALUES (?, ?, ?, ?, ?)'
    );
    insertVendor.run('AWS', '通信費', 'クラウド利用料', '課税仕入10%', 'IT部');
    insertVendor.run('Google', '通信費', 'クラウド利用料', '課税仕入10%', 'IT部');
    insertVendor.run('東京電力', '水道光熱費', '電気代', '課税仕入10%', '管理部');
    insertVendor.run('東京ガス', '水道光熱費', 'ガス代', '課税仕入10%', '管理部');
    insertVendor.run('ヤマト運輸', '荷造運賃', '宅配便', '課税仕入10%', '営業部');
  }
}

// --- Sessions ---

export function createSession(id: string, teamId: string, title?: string): Session {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO sessions (id, team_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, teamId, title || null, now, now);
  return { id, teamId, title: title || null, createdAt: now, updatedAt: now };
}

export function getSession(id: string): Session | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as {
    id: string; team_id: string; title: string | null; created_at: number; updated_at: number;
  } | undefined;
  if (!row) return null;
  return { id: row.id, teamId: row.team_id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listSessions(teamId?: string): Session[] {
  const db = getDb();
  let rows;
  if (teamId) {
    rows = db.prepare('SELECT * FROM sessions WHERE team_id = ? ORDER BY updated_at DESC').all(teamId);
  } else {
    rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
  }
  return (rows as { id: string; team_id: string; title: string | null; created_at: number; updated_at: number }[]).map(row => ({
    id: row.id, teamId: row.team_id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export function updateSessionTitle(id: string, title: string) {
  const db = getDb();
  db.prepare('UPDATE sessions SET title = ?, updated_at = unixepoch() WHERE id = ?').run(title, id);
}

export function deleteSession(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// --- Messages ---

export function addMessage(msg: {
  id: string; sessionId: string; role: string; agentId?: string; agentName?: string; content: string;
}): Message {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO messages (id, session_id, role, agent_id, agent_name, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(msg.id, msg.sessionId, msg.role, msg.agentId || null, msg.agentName || null, msg.content, now);

  // セッションの更新時刻を更新
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, msg.sessionId);

  return {
    id: msg.id,
    sessionId: msg.sessionId,
    role: msg.role as Message['role'],
    agentId: msg.agentId,
    agentName: msg.agentName,
    content: msg.content,
    timestamp: now,
  };
}

export function getMessages(sessionId: string): Message[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId);
  return (rows as { id: string; session_id: string; role: string; agent_id: string | null; agent_name: string | null; content: string; timestamp: number }[]).map(row => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role as Message['role'],
    agentId: row.agent_id || undefined,
    agentName: row.agent_name || undefined,
    content: row.content,
    timestamp: row.timestamp,
  }));
}

// --- Gmail Tokens ---

export function saveGmailToken(token: { accessToken: string; refreshToken: string; expiryDate: number }) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO gmail_tokens (id, access_token, refresh_token, expiry_date, updated_at)
    VALUES ('default', ?, ?, ?, unixepoch())
  `).run(token.accessToken, token.refreshToken, token.expiryDate);
}

export function getGmailToken(): { accessToken: string; refreshToken: string; expiryDate: number } | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gmail_tokens WHERE id = ?').get('default') as {
    access_token: string; refresh_token: string; expiry_date: number;
  } | undefined;
  if (!row) return null;
  return { accessToken: row.access_token, refreshToken: row.refresh_token, expiryDate: row.expiry_date };
}

export function deleteGmailToken() {
  const db = getDb();
  db.prepare('DELETE FROM gmail_tokens WHERE id = ?').run('default');
}

// --- Processed Emails ---

export function saveProcessedEmail(email: {
  messageId: string; threadId: string; subject: string; sender: string;
  senderEmail: string; bodyText: string; receivedAt: number;
  needsReply: boolean; replyUrgency?: string; replyDraft?: string;
  hasInvoice: boolean; invoiceId?: number; summary?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO processed_emails
    (message_id, thread_id, subject, sender, sender_email, body_text, received_at,
     needs_reply, reply_urgency, reply_draft, has_invoice, invoice_id, summary, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `).run(
    email.messageId, email.threadId, email.subject, email.sender, email.senderEmail,
    email.bodyText, email.receivedAt,
    email.needsReply ? 1 : 0, email.replyUrgency || null, email.replyDraft || null,
    email.hasInvoice ? 1 : 0, email.invoiceId || null, email.summary || null
  );
}

export function getProcessedEmails() {
  const db = getDb();
  return db.prepare('SELECT * FROM processed_emails ORDER BY received_at DESC').all();
}

export function getProcessedEmail(messageId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM processed_emails WHERE message_id = ?').get(messageId);
}

export function isEmailProcessed(messageId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM processed_emails WHERE message_id = ?').get(messageId);
  return !!row;
}

export function markReplySent(messageId: string) {
  const db = getDb();
  db.prepare('UPDATE processed_emails SET reply_sent = 1 WHERE message_id = ?').run(messageId);
}

export function updateReplyDraft(messageId: string, draft: string) {
  const db = getDb();
  db.prepare('UPDATE processed_emails SET reply_draft = ? WHERE message_id = ?').run(draft, messageId);
}

// --- Invoices ---

export function createInvoice(data: {
  emailMessageId?: string; filePath?: string; vendorName?: string;
  invoiceDate?: string; dueDate?: string; totalAmount?: number;
  taxAmount?: number; taxRate?: string; description?: string;
  invoiceNumber?: string; accountTitle?: string; subAccount?: string;
  taxCategory?: string; department?: string;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO invoices (email_message_id, file_path, vendor_name, invoice_date, due_date,
      total_amount, tax_amount, tax_rate, description, invoice_number,
      account_title, sub_account, tax_category, department, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(
    data.emailMessageId || null, data.filePath || null, data.vendorName || null,
    data.invoiceDate || null, data.dueDate || null, data.totalAmount || null,
    data.taxAmount || null, data.taxRate || null, data.description || null,
    data.invoiceNumber || null, data.accountTitle || null, data.subAccount || null,
    data.taxCategory || null, data.department || null
  );
  return result.lastInsertRowid as number;
}

export function getInvoices(status?: string) {
  const db = getDb();
  if (status) {
    return db.prepare('SELECT * FROM invoices WHERE status = ? ORDER BY created_at DESC').all(status);
  }
  return db.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all();
}

export function getInvoice(id: number) {
  const db = getDb();
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
}

export function updateInvoice(id: number, data: Record<string, unknown>) {
  const db = getDb();
  const allowed = ['vendor_name', 'invoice_date', 'due_date', 'total_amount', 'tax_amount',
    'tax_rate', 'description', 'invoice_number', 'account_title', 'sub_account',
    'tax_category', 'department', 'status'];
  const fields = Object.keys(data).filter(k => allowed.includes(k));
  if (fields.length === 0) return;
  const sets = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => data[f]);
  db.prepare(`UPDATE invoices SET ${sets}, updated_at = unixepoch() WHERE id = ?`).run(...values, id);
}

export function markInvoicesExported(ids: number[]) {
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE invoices SET status = 'exported', updated_at = unixepoch() WHERE id IN (${placeholders})`).run(...ids);
}

// --- Vendors ---

export function findVendorByName(name: string) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM vendors WHERE ? LIKE '%' || vendor_name || '%' OR vendor_name LIKE '%' || ? || '%' LIMIT 1"
  ).get(name, name) as { vendor_name: string; account_title: string; sub_account: string; tax_category: string; department: string } | undefined;
}

export function getAllVendors() {
  const db = getDb();
  return db.prepare('SELECT * FROM vendors ORDER BY vendor_name').all();
}

// --- Slack Messages ---

export function saveSlackMessage(msg: {
  messageTs: string; channelId: string; channelName: string;
  userId: string; userName: string; text: string; threadTs?: string;
  needsReply: boolean; replyUrgency?: string; replyDraft?: string;
  summary?: string; taskCreated?: boolean; mentionedMe?: boolean;
}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO slack_messages
    (message_ts, channel_id, channel_name, user_id, user_name, text, thread_ts,
     needs_reply, reply_urgency, reply_draft, summary, task_created, mentioned_me, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
  `).run(
    msg.messageTs, msg.channelId, msg.channelName, msg.userId, msg.userName,
    msg.text, msg.threadTs || null,
    msg.needsReply ? 1 : 0, msg.replyUrgency || null, msg.replyDraft || null,
    msg.summary || null, msg.taskCreated ? 1 : 0, msg.mentionedMe ? 1 : 0
  );
}

export function getSlackMessages() {
  const db = getDb();
  return db.prepare('SELECT * FROM slack_messages ORDER BY processed_at DESC').all();
}

export function getSlackMessage(channelId: string, messageTs: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM slack_messages WHERE channel_id = ? AND message_ts = ?').get(channelId, messageTs);
}

export function isSlackMessageProcessed(channelId: string, messageTs: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM slack_messages WHERE channel_id = ? AND message_ts = ?').get(channelId, messageTs);
  return !!row;
}

export function markSlackReplySent(channelId: string, messageTs: string) {
  const db = getDb();
  db.prepare('UPDATE slack_messages SET reply_sent = 1 WHERE channel_id = ? AND message_ts = ?').run(channelId, messageTs);
}

export function updateSlackReplyDraft(channelId: string, messageTs: string, draft: string) {
  const db = getDb();
  db.prepare('UPDATE slack_messages SET reply_draft = ? WHERE channel_id = ? AND message_ts = ?').run(draft, channelId, messageTs);
}

export function markSlackTaskCreated(channelId: string, messageTs: string) {
  const db = getDb();
  db.prepare('UPDATE slack_messages SET task_created = 1 WHERE channel_id = ? AND message_ts = ?').run(channelId, messageTs);
}

// --- Auto Tasks ---

export function saveAutoTask(task: { id: string; source: string; sourceId: string; taskTitle: string }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO auto_tasks (id, source, source_id, task_title, firebase_synced, created_at)
    VALUES (?, ?, ?, ?, 1, unixepoch())
  `).run(task.id, task.source, task.sourceId, task.taskTitle);
}

export function isAutoTaskExists(source: string, sourceId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM auto_tasks WHERE source = ? AND source_id = ?').get(source, sourceId);
  return !!row;
}

export function getAutoTasks() {
  const db = getDb();
  return db.prepare('SELECT * FROM auto_tasks ORDER BY created_at DESC').all();
}

export function updateAutoTaskCalendarId(taskId: string, calendarEventId: string) {
  const db = getDb();
  db.prepare('UPDATE auto_tasks SET calendar_event_id = ? WHERE id = ?').run(calendarEventId, taskId);
}

// --- Summary (日次サマリー用) ---

export function getUnrepliedEmails() {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM processed_emails WHERE needs_reply = 1 AND reply_sent = 0 ORDER BY received_at DESC'
  ).all() as { subject: string; sender: string; reply_urgency: string; received_at: number }[];
}

export function getUnrepliedSlackMessages() {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM slack_messages WHERE needs_reply = 1 AND reply_sent = 0 ORDER BY processed_at DESC'
  ).all() as { channel_name: string; user_name: string; text: string; reply_urgency: string }[];
}
