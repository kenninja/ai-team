import { getGmailClient } from './gmail-auth';
import { appendGmailClassifiedTaskIfNew, FirestoreTask } from './firebase';
import { notifySlackDmText } from './slack';
import { extractJson } from './json-extract';
import type { MailCategory } from '@/types/gmail';

const VALID_CATEGORIES: MailCategory[] = [
  'invoice',
  'requires_reply',
  'supplier_chase',
  'internal',
  'other',
];

const TASK_CATEGORY_LIST: MailCategory[] = ['invoice', 'requires_reply', 'supplier_chase'];
const TASK_CATEGORIES = new Set(TASK_CATEGORY_LIST);

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export type GmailClassifyItemResult = {
  mailId: string;
  subject: string;
  from: string;
  category: MailCategory;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: string;
  taskRegistered: boolean;
};

export type GmailClassifyJobResult = {
  ok: boolean;
  error?: string;
  fetched: number;
  classified: number;
  tasksCreated: number;
  slackAlerts: number;
  results: GmailClassifyItemResult[];
};

async function classifyWithClaude(input: {
  subject: string;
  from: string;
  snippet: string;
}): Promise<{ category: MailCategory; priority: 'high' | 'medium' | 'low'; suggestedAction: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      category: 'other',
      priority: 'low',
      suggestedAction: 'ANTHROPIC_API_KEY 未設定のため分類できません',
    };
  }

  const prompt = `以下のメールを分類してください。
カテゴリは次のいずれかのみ: invoice / requires_reply / supplier_chase / internal / other
優先度は high / medium / low のいずれか
推奨アクションは1行で簡潔に

件名: ${input.subject}
差出人: ${input.from}
抜粋: ${input.snippet}

JSONのみ返答してください。形式:
{"category":"requires_reply","priority":"high","suggestedAction":"..."}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[gmail-classify] Claude API HTTPエラー:', res.status, errText);
      return {
        category: 'other',
        priority: 'low',
        suggestedAction: 'Claude API エラー',
      };
    }

    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text || '';
    const j = extractJson<{ category?: string; priority?: string; suggestedAction?: string }>(text);
    const cat = VALID_CATEGORIES.includes(j.category as MailCategory)
      ? (j.category as MailCategory)
      : 'other';
    const pri =
      j.priority === 'high' || j.priority === 'medium' || j.priority === 'low'
        ? j.priority
        : 'medium';
    return {
      category: cat,
      priority: pri,
      suggestedAction: (j.suggestedAction || '').trim() || '（なし）',
    };
  } catch (e) {
    console.error('[gmail-classify] Claude 分類エラー:', e);
    return {
      category: 'other',
      priority: 'low',
      suggestedAction: '分類処理で例外が発生しました',
    };
  }
}

function safeTaskId(mailId: string): string {
  const safe = mailId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `gmail_${safe}_${Date.now().toString(36)}`;
}

export async function runGmailClassifyJob(): Promise<GmailClassifyJobResult> {
  const out: GmailClassifyJobResult = {
    ok: true,
    fetched: 0,
    classified: 0,
    tasksCreated: 0,
    slackAlerts: 0,
    results: [],
  };

  try {
    const gmail = await getGmailClient();

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread newer_than:1d',
      maxResults: 30,
    });

    const messageRefs = listRes.data.messages || [];
    out.fetched = messageRefs.length;

    for (const ref of messageRefs) {
      const id = ref.id;
      if (!id) continue;

      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || '(件名なし)';
        const fromRaw = headers.find((h) => h.name === 'From')?.value || '';
        const snippet = detail.data.snippet || '';

        const { category, priority, suggestedAction } = await classifyWithClaude({
          subject,
          from: fromRaw,
          snippet,
        });
        out.classified++;

        let taskRegistered = false;

        if (priority === 'high') {
          const text =
            `🚨 【要対応メール】\n` +
            `件名：${subject}\n` +
            `差出人：${fromRaw}\n` +
            `分類：${category}\n` +
            `推奨アクション：${suggestedAction}`;
          await notifySlackDmText(text);
          out.slackAlerts++;
        }

        if (TASK_CATEGORIES.has(category)) {
          const task: FirestoreTask = {
            id: safeTaskId(id),
            title: `【メール】${subject}`,
            source: 'gmail',
            deadline: null,
            deadlineTime: null,
            priority,
            repeat: 'none',
            alertBefore: priority === 'high' ? '1day' : 'none',
            completed: false,
            createdAt: new Date().toISOString(),
            notified: false,
            alertNotified: false,
            category,
            status: 'pending',
            mailId: id,
            suggestedAction,
          };

          const added = await appendGmailClassifiedTaskIfNew(task);
          if (added) {
            out.tasksCreated++;
            taskRegistered = true;
          }
        }

        out.results.push({
          mailId: id,
          subject,
          from: fromRaw,
          category,
          priority,
          suggestedAction,
          taskRegistered,
        });
      } catch (e) {
        console.error('[gmail-classify] 1件スキップ:', e);
      }
    }

    return out;
  } catch (e) {
    console.error('[gmail-classify] ジョブ失敗:', e);
    return {
      ...out,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      results: out.results,
    };
  }
}
