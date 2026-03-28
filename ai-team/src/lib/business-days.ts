/**
 * 指定月の営業日一覧を返す（土日除く）
 */
export function getBusinessDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month - 1, 1);

  while (date.getMonth() === month - 1) {
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return days;
}

/**
 * 10営業日目の日付を返す
 */
export function getTenthBusinessDay(year: number, month: number): Date | null {
  const days = getBusinessDays(year, month);
  return days[9] ?? null;
}

/**
 * 今日から10営業日目まで残り何営業日か
 */
export function getRemainingBusinessDays(year: number, month: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = getBusinessDays(year, month);
  const tenthDay = days[9];
  if (!tenthDay) return 0;
  return days.filter(d => d > today && d <= tenthDay).length;
}
