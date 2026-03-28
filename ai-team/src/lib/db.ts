import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Message, Session } from '@/agents/types';
import { normalizeAccountNumber } from './salary-csv';
import { CompanyCode } from './salary-companies';
import { PHASE_KEYS, type PhaseKey, type PropertyStatus } from '@/types/opening';
import { OPENING_DOCUMENT_MASTER } from './opening-document-master';

const DB_PATH = path.join(process.cwd(), 'data', 'ai-team.db');

function insertOpeningDocumentsMaster(database: Database.Database, propertyId: number): void {
  const ins = database.prepare(
    `INSERT INTO opening_documents (property_id, category, doc_name, is_required, submitted, deadline_offset)
     VALUES (?, ?, ?, ?, 0, ?)`,
  );
  for (const [category, docName, isRequired, deadlineOffset] of OPENING_DOCUMENT_MASTER) {
    ins.run(propertyId, category, docName, isRequired, deadlineOffset);
  }
}

function migrateAddOpeningDocumentsMaster(database: Database.Database): void {
  const props = database.prepare('SELECT id FROM opening_properties').all() as { id: number }[];
  const countStmt = database.prepare(
    'SELECT COUNT(*) as cnt FROM opening_documents WHERE property_id = ?',
  );
  for (const p of props) {
    const row = countStmt.get(p.id) as { cnt: number };
    if (row.cnt === 0) {
      insertOpeningDocumentsMaster(database, p.id);
    }
  }
}

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
      status TEXT DEFAULT 'pending',
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

    -- MF支払先マスタ
    CREATE TABLE IF NOT EXISTS mf_vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_name TEXT NOT NULL,
      vendor_name_short TEXT,
      vendor_code TEXT,
      vendor_unique_key TEXT,
      default_account_item TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mf_vendors_name ON mf_vendors(vendor_name);
    CREATE INDEX IF NOT EXISTS idx_mf_vendors_short ON mf_vendors(vendor_name_short);

    -- 自動生成タスク追跡
    CREATE TABLE IF NOT EXISTS auto_tasks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      firebase_synced INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- 出店管理: 物件
    CREATE TABLE IF NOT EXISTS opening_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_name TEXT NOT NULL,
      area TEXT NOT NULL,
      target_open_month TEXT,
      rent INTEGER,
      status TEXT DEFAULT 'candidate',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 出店管理: フェーズ
    CREATE TABLE IF NOT EXISTS opening_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      phase_key TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      scheduled_date TEXT,
      completed_date TEXT,
      memo TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(property_id, phase_key),
      FOREIGN KEY (property_id) REFERENCES opening_properties(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_opening_phases_property ON opening_phases(property_id);

    -- 出店管理: 認可書類（チェックリスト詳細は後続）
    CREATE TABLE IF NOT EXISTS opening_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      doc_name TEXT NOT NULL,
      is_required INTEGER DEFAULT 1,
      submitted INTEGER DEFAULT 0,
      deadline_offset TEXT,
      memo TEXT,
      FOREIGN KEY (property_id) REFERENCES opening_properties(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_opening_documents_property ON opening_documents(property_id);
  `);

  // 給与支払 GMO 振込CSV 用 口座マスタ
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL DEFAULT 'gotoschool',
      employee_no TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_code TEXT NOT NULL,
      branch_code TEXT NOT NULL,
      account_type TEXT DEFAULT '1',
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_number, company)
    );
  `);

  // company 列と複合 UNIQUE(account_number, company) が揃っていない場合はテーブルを作り直す
  try {
    const tableInfo = db.prepare("PRAGMA table_info(employee_bank_accounts)").all() as Array<{ name: string }>;
    const hasCompanyCol = tableInfo.some(c => c.name === 'company');
    const indexList = db.prepare("PRAGMA index_list(employee_bank_accounts)").all() as Array<{ name: string; unique: number }>;

    const hasCompositeUnique = indexList
      .filter(i => i.unique === 1)
      .some(i => {
        const safeName = String(i.name).replace(/'/g, "''");
        const idxCols = db.prepare(`PRAGMA index_info('${safeName}')`).all() as Array<{ name: string }>;
        const colNames = idxCols.map(c => c.name);
        return colNames.includes('account_number') && colNames.includes('company');
      });

    if (!hasCompanyCol || !hasCompositeUnique) {
      // existing をコピーして作り直す（ALTER TABLE で UNIQUE を差し替えできないため）
      db.exec(`
        CREATE TABLE IF NOT EXISTS employee_bank_accounts__v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company TEXT NOT NULL DEFAULT 'gotoschool',
          employee_no TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          bank_name TEXT NOT NULL,
          bank_code TEXT NOT NULL,
          branch_code TEXT NOT NULL,
          account_type TEXT DEFAULT '1',
          account_number TEXT NOT NULL,
          account_holder TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(account_number, company)
        );
      `);

      if (hasCompanyCol) {
        db.exec(`
          INSERT OR IGNORE INTO employee_bank_accounts__v2 (
            id, company, employee_no, employee_name, bank_name, bank_code, branch_code,
            account_type, account_number, account_holder, created_at, updated_at
          )
          SELECT
            id, company, employee_no, employee_name, bank_name, bank_code, branch_code,
            account_type, account_number, account_holder, created_at, updated_at
          FROM employee_bank_accounts;
        `);
      } else {
        db.exec(`
          INSERT OR IGNORE INTO employee_bank_accounts__v2 (
            id, company, employee_no, employee_name, bank_name, bank_code, branch_code,
            account_type, account_number, account_holder, created_at, updated_at
          )
          SELECT
            id, 'gotoschool' as company, employee_no, employee_name, bank_name, bank_code, branch_code,
            account_type, account_number, account_holder, created_at, updated_at
          FROM employee_bank_accounts;
        `);
      }

      db.exec(`
        DROP TABLE employee_bank_accounts;
        ALTER TABLE employee_bank_accounts__v2 RENAME TO employee_bank_accounts;
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_employee_bank_accounts_company_employee_no
          ON employee_bank_accounts(company, employee_no);
        CREATE INDEX IF NOT EXISTS idx_employee_bank_accounts_company_account_number
          ON employee_bank_accounts(company, account_number);
      `);
    }
  } catch {
    // migration 失敗しても app 起動自体は継続する（必要ならログ出し）
  }

  // マイグレーション: mentioned_meカラム追加
  try {
    db.prepare('ALTER TABLE slack_messages ADD COLUMN mentioned_me INTEGER DEFAULT 0').run();
  } catch { /* カラムが既に存在する場合は無視 */ }

  // マイグレーション: calendar_event_idカラム追加
  try {
    db.prepare('ALTER TABLE auto_tasks ADD COLUMN calendar_event_id TEXT').run();
  } catch { /* カラムが既に存在する場合は無視 */ }

  // マイグレーション: invoicesステータス統一 (draft/confirmed → pending/ready)
  db.prepare("UPDATE invoices SET status = 'ready' WHERE status IN ('confirmed', 'draft')").run();
  db.prepare("UPDATE invoices SET status = 'pending' WHERE status NOT IN ('ready', 'exported')").run();

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

  try {
    migrateAddOpeningDocumentsMaster(db);
  } catch {
    /* 出店書類マイグレーション失敗時も起動は継続 */
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

export function markNoReplyNeeded(messageId: string) {
  const db = getDb();
  db.prepare('UPDATE processed_emails SET needs_reply = 0 WHERE message_id = ?').run(messageId);
}

export function markAllUnrepliedAsNoReply(): number {
  const db = getDb();
  const result = db.prepare('UPDATE processed_emails SET needs_reply = 0 WHERE needs_reply = 1 AND reply_sent = 0').run();
  return result.changes;
}

export function autoExpireOldUnreplied(daysOld: number = 7): number {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - (daysOld * 86400);
  const result = db.prepare('UPDATE processed_emails SET needs_reply = 0 WHERE needs_reply = 1 AND reply_sent = 0 AND received_at < ?').run(cutoff);
  return result.changes;
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

export function deleteInvoice(id: number) {
  const db = getDb();
  db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
}

export function getInvoicesDueSoon(dates: string[]) {
  const db = getDb();
  const placeholders = dates.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, vendor_name, total_amount, due_date, status FROM invoices
     WHERE due_date IN (${placeholders}) AND status NOT IN ('exported')
     ORDER BY due_date`
  ).all(...dates) as { id: number; vendor_name: string | null; total_amount: number | null; due_date: string; status: string }[];
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

// --- MF Vendors ---

export function clearMFVendors() {
  const db = getDb();
  db.prepare('DELETE FROM mf_vendors').run();
}

export function insertMFVendor(data: {
  vendorName: string; vendorNameShort: string; vendorCode: string;
  vendorUniqueKey: string; defaultAccountItem: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO mf_vendors (vendor_name, vendor_name_short, vendor_code, vendor_unique_key, default_account_item)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.vendorName, data.vendorNameShort, data.vendorCode, data.vendorUniqueKey, data.defaultAccountItem);
}

export type MFVendorRow = {
  id: number; vendor_name: string; vendor_name_short: string | null;
  vendor_code: string | null; vendor_unique_key: string | null;
  default_account_item: string | null;
};

export function findMFVendorByName(name: string): MFVendorRow | null {
  if (!name) return null;
  const db = getDb();

  // 1. 完全一致（取引先名）
  let row = db.prepare('SELECT * FROM mf_vendors WHERE vendor_name = ? LIMIT 1').get(name) as MFVendorRow | undefined;
  if (row) return row;

  // 2. 完全一致（支払先名・略称）
  row = db.prepare('SELECT * FROM mf_vendors WHERE vendor_name_short = ? LIMIT 1').get(name) as MFVendorRow | undefined;
  if (row) return row;

  // 3. 部分一致（双方向）
  row = db.prepare(
    "SELECT * FROM mf_vendors WHERE ? LIKE '%' || vendor_name || '%' OR vendor_name LIKE '%' || ? || '%' OR ? LIKE '%' || vendor_name_short || '%' OR vendor_name_short LIKE '%' || ? || '%' LIMIT 1"
  ).get(name, name, name, name) as MFVendorRow | undefined;
  if (row) return row;

  return null;
}

export function getMFVendorCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM mf_vendors').get() as { count: number };
  return row.count;
}

// --- Summary (日次サマリー用) ---

export function getUnrepliedEmails() {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM processed_emails WHERE needs_reply = 1 AND reply_sent = 0 ORDER BY received_at DESC'
  ).all() as { message_id: string; subject: string; sender: string; reply_urgency: string; received_at: number; reply_draft: string | null }[];
}

export function getUnrepliedSlackMessages() {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM slack_messages WHERE needs_reply = 1 AND reply_sent = 0 ORDER BY processed_at DESC'
  ).all() as { channel_name: string; user_name: string; text: string; reply_urgency: string }[];
}

// --- Salary Convert (給与 GMO 振込 CSV) ---

export type EmployeeBankAccountRow = {
  id: number;
  company: string;
  employee_no: string;
  employee_name: string;
  bank_name: string;
  bank_code: string;
  branch_code: string;
  account_type: string;
  account_number: string;
  account_holder: string;
  created_at: string;
  updated_at: string;
};

export function insertEmployeeBankAccounts(accounts: Array<{
  employee_no: string;
  employee_name: string;
  bank_name: string;
  bank_code: string;
  branch_code: string;
  account_type: string;
  account_number: string;
  account_holder: string;
}>, company: CompanyCode): { inserted: number } {
  if (accounts.length === 0) return { inserted: 0 };

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO employee_bank_accounts (
      company, employee_no, employee_name, bank_name, bank_code, branch_code,
      account_type, account_number, account_holder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  for (const a of accounts) {
    inserted += stmt.run(
      company,
      a.employee_no,
      a.employee_name,
      a.bank_name,
      a.bank_code,
      a.branch_code,
      a.account_type,
      normalizeAccountNumber(a.account_number),
      a.account_holder
    ).changes;
  }

  return { inserted };
}

export function getEmployeeBankAccountsByAccountNumbers(accountNumbers: string[], company: CompanyCode): EmployeeBankAccountRow[] {
  if (accountNumbers.length === 0) return [];
  const db = getDb();

  const normalizedInputs = Array.from(
    new Set(accountNumbers.map(a => normalizeAccountNumber(a)).filter(Boolean)),
  );
  const unnormalizedInputs = normalizedInputs.map(n => n.replace(/^0+/, ''));
  const candidates = Array.from(new Set([...normalizedInputs, ...unnormalizedInputs])).filter(Boolean);

  const placeholders = candidates.map(() => '?').join(',');
  const sql = `
    SELECT id,
      company,
      employee_no, employee_name,
      bank_name, bank_code, branch_code,
      account_type, account_number, account_holder,
      created_at, updated_at
    FROM employee_bank_accounts
    WHERE company = ? AND account_number IN (${placeholders})
  `;

  const rows = db.prepare(sql).all(company, ...candidates) as EmployeeBankAccountRow[];
  return rows.map(r => ({ ...r, account_number: normalizeAccountNumber(r.account_number) }));
}

export function getAllEmployeeBankAccounts(company: CompanyCode): EmployeeBankAccountRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id,
      company,
      employee_no, employee_name,
      bank_name, bank_code, branch_code,
      account_type, account_number, account_holder,
      created_at, updated_at
    FROM employee_bank_accounts
    WHERE company = ?
    ORDER BY employee_no ASC
  `).all(company) as EmployeeBankAccountRow[];

  return rows.map(r => ({ ...r, account_number: normalizeAccountNumber(r.account_number) }));
}

export function upsertEmployeeBankAccounts(accounts: Array<{
  employee_no: string;
  employee_name: string;
  bank_name: string;
  bank_code: string;
  branch_code: string;
  account_type: string;
  account_number: string;
  account_holder: string;
}>, company: CompanyCode): { inserted: number; updated: number } {
  if (accounts.length === 0) return { inserted: 0, updated: 0 };

  const db = getDb();

  const normalizedAccounts = accounts
    .map(a => ({ ...a, account_number: normalizeAccountNumber(a.account_number) }))
    .filter(a => a.account_number);

  const normalizedInputs = Array.from(new Set(normalizedAccounts.map(a => a.account_number))).filter(Boolean);
  const unnormalizedInputs = normalizedInputs.map(n => n.replace(/^0+/, ''));
  const candidates = Array.from(new Set([...normalizedInputs, ...unnormalizedInputs])).filter(Boolean);

  const placeholders = candidates.map(() => '?').join(',');

  // 既存判定（口座番号で分岐）: inserted/updated数を正確に出すため
  const existingRows = db.prepare(
    `SELECT account_number FROM employee_bank_accounts WHERE company = ? AND account_number IN (${placeholders})`
  ).all(company, ...candidates) as Array<{ account_number: string }>;
  const existingSet = new Set(existingRows.map(r => normalizeAccountNumber(r.account_number)));

  const accountNumberMap = new Map<string, string>(); // normalized -> actual account_number in DB
  for (const r of existingRows) {
    accountNumberMap.set(normalizeAccountNumber(r.account_number), r.account_number);
  }

  const insertStmt = db.prepare(`
    INSERT INTO employee_bank_accounts (
      company, employee_no, employee_name, bank_name, bank_code, branch_code,
      account_type, account_number, account_holder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE employee_bank_accounts
    SET employee_no = ?, employee_name = ?, bank_name = ?, bank_code = ?, branch_code = ?,
        account_type = ?, account_holder = ?, account_number = ?, updated_at = datetime('now')
    WHERE company = ? AND account_number = ?
  `);

  const tx = db.transaction(() => {
    let inserted = 0;
    let updated = 0;

    for (const a of normalizedAccounts) {
      const normalized = a.account_number;
      const existingActual = accountNumberMap.get(normalized);
      if (existingSet.has(normalized) && existingActual) {
        updateStmt.run(
          a.employee_no,
          a.employee_name,
          a.bank_name,
          a.bank_code,
          a.branch_code,
          a.account_type,
          a.account_holder,
          normalized,
          company,
          existingActual
        );
        updated++;
      } else {
        insertStmt.run(
          company,
          a.employee_no,
          a.employee_name,
          a.bank_name,
          a.bank_code,
          a.branch_code,
          a.account_type,
          a.account_number,
          a.account_holder
        );
        inserted++;
      }
    }

    return { inserted, updated };
  });

  return tx();
}

// --- Opening (出店管理) ---

export type OpeningPropertyRow = {
  id: number;
  property_name: string;
  area: string;
  target_open_month: string | null;
  rent: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type OpeningPhaseRow = {
  id: number;
  property_id: number;
  phase_key: string;
  completed: number;
  scheduled_date: string | null;
  completed_date: string | null;
  memo: string | null;
  updated_at: string;
};

const phaseKeyOrder = new Map(PHASE_KEYS.map((p, i) => [p.key, i]));

export function listOpeningPropertiesWithDetails() {
  const db = getDb();
  const props = db
    .prepare(
      `SELECT * FROM opening_properties
       ORDER BY target_open_month IS NULL, target_open_month ASC, id ASC`,
    )
    .all() as OpeningPropertyRow[];

  const phaseStmt = db.prepare('SELECT * FROM opening_phases WHERE property_id = ?');
  const docStmt = db.prepare(
    `SELECT
       COUNT(*) as total,
       COALESCE(SUM(CASE WHEN submitted = 1 THEN 1 ELSE 0 END), 0) as submitted
     FROM opening_documents WHERE property_id = ?`,
  );

  return props.map((p) => {
    const phases = phaseStmt.all(p.id) as OpeningPhaseRow[];
    phases.sort((a, b) => (phaseKeyOrder.get(a.phase_key as (typeof PHASE_KEYS)[number]['key']) ?? 99) - (phaseKeyOrder.get(b.phase_key as (typeof PHASE_KEYS)[number]['key']) ?? 99));
    const docRow = docStmt.get(p.id) as { total: number; submitted: number };
    return {
      id: p.id,
      property_name: p.property_name,
      area: p.area,
      target_open_month: p.target_open_month,
      rent: p.rent,
      status: p.status as PropertyStatus,
      created_at: p.created_at,
      updated_at: p.updated_at,
      phases: phases.map((ph) => ({
        id: ph.id,
        property_id: ph.property_id,
        phase_key: ph.phase_key as PhaseKey,
        completed: ph.completed === 1,
        scheduled_date: ph.scheduled_date,
        completed_date: ph.completed_date,
        memo: ph.memo,
      })),
      doc_progress: { total: docRow.total, submitted: docRow.submitted },
    };
  });
}

const VALID_OPENING_STATUSES: PropertyStatus[] = [
  'candidate',
  'viewing',
  'applied',
  'contracted',
  'construction',
  'ready',
  'active',
  'dropped',
];

export function createOpeningProperty(data: {
  property_name: string;
  area: string;
  target_open_month: string | null;
  rent: number | null;
  status: string;
}): number {
  const db = getDb();
  const status = VALID_OPENING_STATUSES.includes(data.status as PropertyStatus)
    ? data.status
    : 'candidate';

  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO opening_properties (property_name, area, target_open_month, rent, status)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(data.property_name, data.area, data.target_open_month, data.rent, status);
    const propertyId = Number(r.lastInsertRowid);
    const insPhase = db.prepare(
      `INSERT INTO opening_phases (property_id, phase_key) VALUES (?, ?)`,
    );
    for (const { key } of PHASE_KEYS) {
      insPhase.run(propertyId, key);
    }
    insertOpeningDocumentsMaster(db, propertyId);
    return propertyId;
  });

  return tx();
}

export function updateOpeningPhaseCompleted(
  propertyId: number,
  phaseKey: string,
  completed: boolean,
) {
  const db = getDb();
  const completedDate = completed ? new Date().toISOString().slice(0, 10) : null;
  db.prepare(
    `UPDATE opening_phases
     SET completed = ?, completed_date = ?, updated_at = datetime('now', 'localtime')
     WHERE property_id = ? AND phase_key = ?`,
  ).run(completed ? 1 : 0, completedDate, propertyId, phaseKey);
}

export function deleteOpeningProperty(id: number): boolean {
  const db = getDb();
  const r = db.prepare('DELETE FROM opening_properties WHERE id = ?').run(id);
  return r.changes > 0;
}

export type OpeningDocumentRow = {
  id: number;
  property_id: number;
  category: string;
  doc_name: string;
  is_required: number;
  submitted: number;
  deadline_offset: string | null;
  memo: string | null;
};

export function getOpeningPropertyMeta(
  propertyId: number,
): { id: number; property_name: string } | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, property_name FROM opening_properties WHERE id = ?')
    .get(propertyId) as { id: number; property_name: string } | undefined;
  return row ?? null;
}

export function listOpeningDocumentsForProperty(propertyId: number): OpeningDocumentRow[] {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM opening_documents WHERE property_id = ? ORDER BY category, id',
    )
    .all(propertyId) as OpeningDocumentRow[];
}

export function updateOpeningDocument(
  propertyId: number,
  documentId: number,
  data: { submitted: boolean; memo?: string | null },
): boolean {
  const db = getDb();
  if (data.memo !== undefined) {
    const r = db
      .prepare(
        `UPDATE opening_documents SET submitted = ?, memo = ? WHERE id = ? AND property_id = ?`,
      )
      .run(data.submitted ? 1 : 0, data.memo, documentId, propertyId);
    return r.changes > 0;
  }
  const r = db
    .prepare(
      `UPDATE opening_documents SET submitted = ? WHERE id = ? AND property_id = ?`,
    )
    .run(data.submitted ? 1 : 0, documentId, propertyId);
  return r.changes > 0;
}
