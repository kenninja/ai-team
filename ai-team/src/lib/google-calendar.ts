import { google } from 'googleapis';
import { getAuthenticatedClient, isGmailConnected } from './gmail-auth';
import { FirestoreTask } from './firebase';

export function isCalendarConnected(): boolean {
  return isGmailConnected();
}

export async function createCalendarEvent(task: FirestoreTask): Promise<string | null> {
  const auth = getAuthenticatedClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth });

  const sourceLabel = task.source === 'slack' ? 'Slack' : task.source === 'mail' ? 'メール' : 'その他';
  const description = `AI Team 自動登録\nソース: ${sourceLabel}\n優先度: ${task.priority}`;

  let event;

  if (task.deadlineTime) {
    // 時間指定イベント（30分間）
    const startDateTime = `${task.deadline}T${task.deadlineTime}:00`;
    const endDate = new Date(`${task.deadline}T${task.deadlineTime}:00`);
    endDate.setMinutes(endDate.getMinutes() + 30);
    const endDateTime = endDate.toISOString().replace('Z', '');

    event = {
      summary: task.title,
      description,
      start: { dateTime: startDateTime, timeZone: 'Asia/Tokyo' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Tokyo' },
      reminders: {
        useDefault: false,
        overrides: task.priority === 'high'
          ? [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }]
          : [{ method: 'popup', minutes: 30 }],
      },
    };
  } else {
    // 終日イベント
    event = {
      summary: task.title,
      description,
      start: { date: task.deadline! },
      end: { date: task.deadline! },
      reminders: {
        useDefault: false,
        overrides: task.priority === 'high'
          ? [{ method: 'popup', minutes: 480 }]
          : [{ method: 'popup', minutes: 480 }],
      },
    };
  }

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  console.log(`[calendar] イベント作成: "${task.title}" (${task.deadline})`);
  return result.data.id || null;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const auth = getAuthenticatedClient();
  if (!auth) return;

  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
  console.log(`[calendar] イベント削除: ${eventId}`);
}
