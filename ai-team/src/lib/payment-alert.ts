import cron from 'node-cron';
import { getInvoicesDueSoon } from './db';
import { sendSlackDM } from './slack';

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function buildAlertMessage(
  invoices: { vendor_name: string | null; total_amount: number | null; due_date: string }[],
  daysUntilDue: number
): string {
  const label = daysUntilDue === 1
    ? ':warning: *【明日が支払期限】*'
    : ':bell: *【3日後が支払期限】*';

  const lines = invoices.map((inv) => {
    const name = inv.vendor_name || '取引先不明';
    const amount = inv.total_amount
      ? `¥${inv.total_amount.toLocaleString()}`
      : '金額未入力';
    return `• *${name}*　${amount}　期限: ${inv.due_date}`;
  });

  return [label, ...lines].join('\n');
}

export async function checkPaymentAlerts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = formatDate(new Date(today.getTime() + 1 * 86400000));
  const threeDaysLater = formatDate(new Date(today.getTime() + 3 * 86400000));

  const invoices = getInvoicesDueSoon([tomorrow, threeDaysLater]);

  const tomorrowList = invoices.filter((inv) => inv.due_date === tomorrow);
  const threeDayList = invoices.filter((inv) => inv.due_date === threeDaysLater);

  const myUserId = process.env.SLACK_MY_USER_ID;
  if (!myUserId) {
    console.warn('[PaymentAlert] SLACK_MY_USER_ID が未設定です');
    return { tomorrow: tomorrowList.length, threeDays: threeDayList.length };
  }

  if (tomorrowList.length > 0) {
    await sendSlackDM(myUserId, buildAlertMessage(tomorrowList, 1));
    console.log(`[PaymentAlert] 明日期限 ${tomorrowList.length}件 送信`);
  }

  if (threeDayList.length > 0) {
    await sendSlackDM(myUserId, buildAlertMessage(threeDayList, 3));
    console.log(`[PaymentAlert] 3日後期限 ${threeDayList.length}件 送信`);
  }

  if (tomorrowList.length === 0 && threeDayList.length === 0) {
    console.log('[PaymentAlert] 対象請求書なし');
  }

  return { tomorrow: tomorrowList.length, threeDays: threeDayList.length };
}

export function startPaymentAlertCron() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[PaymentAlert] 支払期限アラートチェック開始');
    await checkPaymentAlerts();
  }, {
    timezone: 'Asia/Tokyo',
  });

  console.log('[PaymentAlert] 支払期限アラート登録完了（毎朝9時 JST）');
}
