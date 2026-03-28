import cron from 'node-cron';
import { WebClient } from '@slack/web-api';

let initialized = false;

/**
 * 日次サマリー通知のスケジュールを開始
 * 毎朝 9:00 JST (= 0:00 UTC) に実行
 */
export function startSummaryCron() {
  if (initialized) return;
  initialized = true;

  cron.schedule('0 0 * * *', async () => {
    console.log(`[summary-cron] 日次サマリー送信開始`);
    await sendDailySummary();
  });

  console.log('[summary-cron] スケジュール登録完了: 毎朝 9:00 JST');
}

/**
 * Slack WebClientを直接作成（globalThis依存を避ける）
 */
function getSlackClient(): WebClient | null {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  return new WebClient(token);
}

/**
 * 日次サマリーを組み立ててSlack DMに送信
 */
export async function sendDailySummary(): Promise<boolean> {
  const userId = process.env.SLACK_MY_USER_ID;
  if (!userId) {
    console.log('[summary-cron] SLACK_MY_USER_ID 未設定のためスキップ');
    return false;
  }

  const client = getSlackClient();
  if (!client) {
    console.log('[summary-cron] SLACK_BOT_TOKEN 未設定のためスキップ');
    return false;
  }

  try {
    const { getUnrepliedEmails, getUnrepliedSlackMessages } = await import('./db');
    const { readTasks } = await import('./firebase');

    // データ取得
    const unrepliedEmails = getUnrepliedEmails();
    const unrepliedSlack = getUnrepliedSlackMessages();

    let tasks: { title: string; deadline: string | null; priority: string; completed: boolean }[] = [];
    try {
      tasks = await readTasks();
    } catch (err) {
      console.error('[summary-cron] タスク取得エラー:', err);
    }

    // 未完了タスクを期限順にソート
    const today = new Date().toISOString().slice(0, 10);
    const pendingTasks = tasks
      .filter(t => !t.completed)
      .sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
    const todayDueTasks = pendingTasks.filter(t => t.deadline === today);

    // 何もなければ短いメッセージ
    if (unrepliedEmails.length === 0 && unrepliedSlack.length === 0 && pendingTasks.length === 0) {
      await sendDM(client, userId, '📋 おはようございます！\n\n対応が必要なものはありません 👍');
      console.log('[summary-cron] 送信完了（対応なし）');
      return true;
    }

    // サマリー組み立て
    const lines: string[] = ['📋 おはようございます！本日のサマリーです\n'];

    // 未返信メール
    if (unrepliedEmails.length > 0) {
      lines.push(`━━ 未返信メール (${unrepliedEmails.length}件) ━━`);
      for (const email of unrepliedEmails.slice(0, 10)) {
        const icon = urgencyIcon(email.reply_urgency);
        lines.push(`${icon} ${email.sender}「${email.subject}」`);
      }
      if (unrepliedEmails.length > 10) {
        lines.push(`   ...他 ${unrepliedEmails.length - 10}件`);
      }
      lines.push('');
    }

    // 未返信Slack
    if (unrepliedSlack.length > 0) {
      lines.push(`━━ 未返信Slack (${unrepliedSlack.length}件) ━━`);
      for (const msg of unrepliedSlack.slice(0, 10)) {
        const icon = urgencyIcon(msg.reply_urgency);
        const preview = msg.text.length > 30 ? msg.text.substring(0, 30) + '...' : msg.text;
        lines.push(`${icon} #${msg.channel_name} ${msg.user_name}「${preview}」`);
      }
      if (unrepliedSlack.length > 10) {
        lines.push(`   ...他 ${unrepliedSlack.length - 10}件`);
      }
      lines.push('');
    }

    // タスク
    lines.push(`━━ 今日のTODO (${todayDueTasks.length}件) ━━`);
    if (todayDueTasks.length === 0) {
      lines.push('✅ 今日期限のタスクはありません');
    } else {
      for (const task of todayDueTasks.slice(0, 10)) {
        const icon = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '⚪';
        lines.push(`${icon} ${task.title}`);
      }
      if (todayDueTasks.length > 10) {
        lines.push(`   ...他 ${todayDueTasks.length - 10}件`);
      }
    }
    lines.push('');

    // タスク（未完了全体）
    if (pendingTasks.length > 0) {
      lines.push(`━━ タスク (${pendingTasks.length}件) ━━`);
      for (const task of pendingTasks.slice(0, 10)) {
        const icon = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '⚪';
        const deadlineLabel = formatDeadlineLabel(task.deadline, today);
        lines.push(`${icon} ${deadlineLabel}${task.title}`);
      }
      if (pendingTasks.length > 10) {
        lines.push(`   ...他 ${pendingTasks.length - 10}件`);
      }
    }

    const message = lines.join('\n');
    await sendDM(client, userId, message);
    console.log('[summary-cron] 送信完了');
    return true;
  } catch (err) {
    console.error('[summary-cron] エラー:', err);
    return false;
  }
}

async function sendDM(client: WebClient, userId: string, text: string) {
  const dm = await client.conversations.open({ users: userId });
  const channelId = dm.channel?.id;
  if (!channelId) throw new Error('DMチャンネルを開けませんでした');
  await client.chat.postMessage({ channel: channelId, text });
}

function urgencyIcon(urgency: string): string {
  if (urgency === 'high') return '🔴';
  if (urgency === 'medium') return '🟡';
  return '⚪';
}

function formatDeadlineLabel(deadline: string | null, today: string): string {
  if (!deadline) return '';

  if (deadline === today) return '今日: ';

  const deadlineDate = new Date(deadline);
  const todayDate = new Date(today);
  const diffDays = Math.round((deadlineDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return '明日: ';
  if (diffDays < 0) return `⚠️期限超過(${deadline}): `;
  return `${deadline.slice(5)}: `; // MM-DD形式
}
