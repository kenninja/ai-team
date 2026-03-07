import { generateText } from './gemini';
import { extractJson } from './json-extract';
import { appendTask, FirestoreTask } from './firebase';
import { saveAutoTask, isAutoTaskExists, updateAutoTaskCalendarId } from './db';

interface TaskAnalysis {
  needs_task: boolean;
  task_title: string | null;
  priority: 'high' | 'medium' | 'low';
  deadline_hint: string | null;
}

const TASK_ANALYSIS_PROMPT = `あなたはビジネスメッセージからタスクを抽出する専門家です。
以下のメッセージを分析し、受信者がアクションを取る必要があるタスクがあるか判断してください。

タスクが必要な例:
- 「○○を確認してください」「○○の対応お願いします」
- 期限付きの依頼・リクエスト
- 確認・承認が必要な内容
- フォローアップが必要な内容

タスクが不要な例:
- 雑談、挨拶のみ
- 情報共有・お知らせ（対応不要）
- 自動通知・bot メッセージ
- 既に完了済みの報告

JSON形式で返してください:
{
  "needs_task": true/false,
  "task_title": "タスクの簡潔なタイトル（不要ならnull）",
  "priority": "high/medium/low",
  "deadline_hint": "期限のヒント（明示されていればYYYY-MM-DD形式、あいまいなら日本語、不明ならnull）"
}`;

export async function analyzeAndCreateTask(params: {
  source: 'slack' | 'mail';
  sourceId: string;
  senderName: string;
  subject?: string;
  text: string;
  channelOrThread?: string;
}): Promise<{ created: boolean; taskTitle?: string }> {
  if (isAutoTaskExists(params.source, params.sourceId)) {
    return { created: false };
  }

  const input = [
    params.subject ? `件名: ${params.subject}` : '',
    `送信者: ${params.senderName}`,
    params.channelOrThread ? `チャンネル/スレッド: ${params.channelOrThread}` : '',
    `\n本文:\n${params.text.substring(0, 2000)}`,
  ].filter(Boolean).join('\n');

  const response = await generateText(TASK_ANALYSIS_PROMPT, input);
  let analysis: TaskAnalysis;
  try {
    analysis = extractJson<TaskAnalysis>(response);
  } catch {
    return { created: false };
  }

  if (!analysis.needs_task || !analysis.task_title) {
    return { created: false };
  }

  const deadline = parseDeadlineHint(analysis.deadline_hint);
  const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const firestoreTask: FirestoreTask = {
    id: taskId,
    title: analysis.task_title,
    source: params.source,
    deadline: deadline,
    deadlineTime: null,
    priority: analysis.priority,
    repeat: 'none',
    alertBefore: analysis.priority === 'high' ? '1day' : 'none',
    completed: false,
    createdAt: new Date().toISOString(),
    notified: false,
    alertNotified: false,
  };

  try {
    await appendTask(firestoreTask);
    saveAutoTask({
      id: taskId,
      source: params.source,
      sourceId: params.sourceId,
      taskTitle: analysis.task_title,
    });
    console.log(`[task-creator] タスク作成: "${analysis.task_title}" (${params.source})`);

    // カレンダー自動登録（期限がある場合のみ）
    if (deadline) {
      try {
        const { createCalendarEvent, isCalendarConnected } = await import('./google-calendar');
        if (isCalendarConnected()) {
          const eventId = await createCalendarEvent(firestoreTask);
          if (eventId) {
            updateAutoTaskCalendarId(taskId, eventId);
          }
        }
      } catch (err) {
        console.error('[task-creator] カレンダー登録エラー:', err);
      }
    }

    return { created: true, taskTitle: analysis.task_title };
  } catch (err) {
    console.error('[task-creator] Firebase書き込みエラー:', err);
    return { created: false };
  }
}

function parseDeadlineHint(hint: string | null): string | null {
  if (!hint) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(hint)) return hint;

  const now = new Date();
  if (hint.includes('今日')) {
    return now.toISOString().slice(0, 10);
  }
  if (hint.includes('明日')) {
    now.setDate(now.getDate() + 1);
    return now.toISOString().slice(0, 10);
  }
  if (hint.includes('今週')) {
    const dayOfWeek = now.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
    now.setDate(now.getDate() + daysUntilFriday);
    return now.toISOString().slice(0, 10);
  }
  if (hint.includes('来週')) {
    const dayOfWeek = now.getDay();
    const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    now.setDate(now.getDate() + daysUntilNextMonday + 4);
    return now.toISOString().slice(0, 10);
  }
  if (hint.includes('月末')) {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.toISOString().slice(0, 10);
  }
  return null;
}
