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

export type TaskCreatorResult = {
  created: boolean;
  taskTitle?: string;
  task?: {
    title: string;
    deadline: string | null;
    priority: 'high' | 'medium' | 'low';
  };
};

const TASK_ANALYSIS_PROMPT = `あなたはビジネスメッセージからタスクを抽出する専門家です。
以下のメッセージを分析し、受信者が具体的なアクションを取る必要があるタスクがあるか判断してください。

■ 最重要ルール: タスク化するのは「社内メンバーや取引先から自分宛に届いた具体的な対応依頼」のみです。
外部からの営業・勧誘・宣伝は、どれだけ魅力的でも needs_task: false にしてください。

■ タスクが必要な例（needs_task: true）:
- 社内メンバーや既存取引先からの具体的な対応依頼（「○○を確認してください」「○○の対応お願いします」）
- 明確な期限付きの作業依頼（「○日までに提出してください」）
- 承認・確認・返答が必要な内容（「出欠を返信してください」「内容を確認の上ご連絡ください」）
- 契約・支払い・行政手続きなど放置すると問題になる対応

■ タスクが不要な例（needs_task: false）:
- 広告メール・営業メール・DM（商品紹介、サービス提案、料金プラン案内）
- メールマガジン・ニュースレター（Google Alerts、ニュース配信、業界情報）
- セミナー・ウェビナー・イベントの勧誘・案内（参加募集、開催告知）
- サービスの申込み勧誘・キャンペーン案内・無料トライアル案内
- 求人・採用サービスからの自動案内メール
- システム通知・自動通知・bot メッセージ（メンテナンス通知、ログイン通知）
- 雑談、挨拶のみ
- 情報共有・お知らせ（対応不要な報告・共有）
- 既に完了済みの報告

■ 判断に迷ったら needs_task: false にしてください。過剰なタスク化は業務を妨げます。

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
}): Promise<TaskCreatorResult> {
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

    return {
      created: true,
      taskTitle: analysis.task_title,
      task: {
        title: firestoreTask.title,
        deadline: firestoreTask.deadline ?? null,
        priority: firestoreTask.priority ?? 'medium',
      },
    };
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
