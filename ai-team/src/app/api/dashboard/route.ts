import { NextResponse } from 'next/server';
import { getInvoices, getInvoicesDueSoon } from '@/lib/db';
import { getRemainingBusinessDays, getTenthBusinessDay } from '@/lib/business-days';

type Task = {
  id: string;
  title: string;
  description: string;
  type: 'self' | 'ai';
  priority: 'urgent' | 'normal';
  action: { label: string; href: string };
};

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStr = formatDate(today);
  const tomorrowStr = formatDate(new Date(today.getTime() + 1 * 86400000));
  const threeDaysStr = formatDate(new Date(today.getTime() + 3 * 86400000));

  // 期限が近い請求書（翌日・3日後）
  const urgentInvoices = getInvoicesDueSoon([tomorrowStr, threeDaysStr]);

  // 全請求書から集計
  const allInvoices = getInvoices() as {
    id: number; vendor_name: string | null; total_amount: number | null;
    due_date: string | null; status: string; account_title: string | null;
    invoice_date: string | null;
  }[];

  // 期限超過（today以前 & 未出力）
  const overdueInvoices = allInvoices.filter(
    inv => inv.due_date && inv.due_date < todayStr && inv.status !== 'exported'
  );

  // 今月の未払い
  const currentMonth = todayStr.slice(0, 7);
  const unpaidThisMonth = allInvoices.filter(
    inv => inv.invoice_date?.startsWith(currentMonth) && inv.status !== 'exported'
  );
  const unpaidTotal = unpaidThisMonth.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  // 勘定科目未入力
  const noAccountInvoices = allInvoices.filter(
    inv => !inv.account_title && inv.status !== 'exported'
  );

  // 下書き
  const draftInvoices = allInvoices.filter(inv => inv.status === 'draft');

  // タスクリスト生成
  const tasks: Task[] = [];

  // 期限超過 → 最優先
  overdueInvoices.forEach(inv => {
    tasks.push({
      id: `overdue-${inv.id}`,
      title: `${inv.vendor_name || '取引先不明'}の支払いが期限超過`,
      description: `¥${inv.total_amount?.toLocaleString() ?? '未入力'}　期限: ${inv.due_date}`,
      type: 'self',
      priority: 'urgent',
      action: { label: '請求書を確認', href: '/mail/invoices' },
    });
  });

  // 明日期限
  urgentInvoices
    .filter(inv => inv.due_date === tomorrowStr)
    .forEach(inv => {
      tasks.push({
        id: `urgent-${inv.id}`,
        title: `${inv.vendor_name || '取引先不明'}の支払いを処理する`,
        description: `¥${inv.total_amount?.toLocaleString() ?? '未入力'}　明日が期限`,
        type: 'self',
        priority: 'urgent',
        action: { label: '請求書を確認', href: '/mail/invoices' },
      });
    });

  // 勘定科目未入力 → AIに任せる
  if (noAccountInvoices.length > 0) {
    tasks.push({
      id: 'no-account',
      title: '勘定科目が未入力の請求書を処理する',
      description: `${noAccountInvoices.length}件　AI一括推定→確認するだけ`,
      type: 'ai',
      priority: 'normal',
      action: { label: '一括推定を実行', href: '/mail/invoices' },
    });
  }

  // 下書きの確認
  if (draftInvoices.length > 0) {
    tasks.push({
      id: 'drafts',
      title: '下書き状態の請求書を確認・確定する',
      description: `${draftInvoices.length}件が未確定`,
      type: 'self',
      priority: 'normal',
      action: { label: '請求書一覧へ', href: '/mail/invoices' },
    });
  }

  // urgentInvoicesをフロント用に整形
  const urgentForFront = urgentInvoices.map(inv => ({
    id: inv.id,
    vendorName: inv.vendor_name || '取引先不明',
    totalAmount: inv.total_amount,
    dueDate: inv.due_date,
  }));

  // 月次締め進捗
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const exportedThisMonth = allInvoices.filter(
    inv => inv.invoice_date?.startsWith(currentMonth) && inv.status === 'exported'
  );
  const exportedCount = exportedThisMonth.length;
  const unprocessedCount = unpaidThisMonth.length;
  const totalCount = exportedCount + unprocessedCount;
  const progressPercent = totalCount > 0 ? Math.round((exportedCount / totalCount) * 100) : 0;

  const remainingDays = getRemainingBusinessDays(year, month);
  const tenthBusinessDay = getTenthBusinessDay(year, month);

  const closingStatus = remainingDays <= 3 ? 'danger' : remainingDays <= 6 ? 'warn' : 'ok';
  const closingStatusLabel =
    closingStatus === 'danger' ? '締め切り間近！' :
    closingStatus === 'warn' ? '要ペースアップ' : '順調です';

  return NextResponse.json({
    tasks,
    urgentInvoices: urgentForFront,
    summary: {
      unpaidCount: unpaidThisMonth.length,
      unpaidTotal,
      noAccountCount: noAccountInvoices.length,
    },
    closing: {
      month,
      year,
      remainingDays,
      exportedCount,
      unprocessedCount,
      totalCount,
      progressPercent,
      status: closingStatus,
      statusLabel: closingStatusLabel,
      tenthBusinessDay: tenthBusinessDay?.toISOString().split('T')[0] ?? null,
    },
    generatedAt: new Date().toISOString(),
  });
}
