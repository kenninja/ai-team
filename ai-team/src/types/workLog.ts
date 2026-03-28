export type WorkLogCategory =
  | '経理'
  | 'タスク管理'
  | '請求書'
  | 'Slack対応'
  | 'その他';

export interface WorkLog {
  id?: string;
  date: string; // 'YYYY-MM-DD'
  category: WorkLogCategory;
  taskTitle: string;
  completedAt: string; // ISO string
  durationMinutes?: number;
  note?: string;
}

