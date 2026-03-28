'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import WorkLogSummary from '@/components/WorkLogSummary';
import { PHASE_KEYS, STATUS_LABELS, type OpeningProperty } from '@/types/opening';

type Task = {
  id: string;
  title: string;
  description: string;
  type: 'self' | 'ai';
  priority: 'urgent' | 'normal';
  action: { label: string; href: string };
};

type UrgentInvoice = {
  id: number;
  vendorName: string;
  totalAmount: number | null;
  dueDate: string;
};

type ClosingData = {
  month: number;
  year: number;
  remainingDays: number;
  exportedCount: number;
  unprocessedCount: number;
  totalCount: number;
  progressPercent: number;
  status: 'ok' | 'warn' | 'danger';
  statusLabel: string;
  tenthBusinessDay: string | null;
};

type DashboardData = {
  tasks: Task[];
  urgentInvoices: UrgentInvoice[];
  summary: {
    unpaidCount: number;
    unpaidTotal: number;
    noAccountCount: number;
  };
  closing: ClosingData;
};

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<{ gmail: boolean; slack: boolean; calendar: boolean }>({
    gmail: false, slack: false, calendar: false,
  });
  const [syncCode, setSyncCode] = useState<string | null>(null);
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyToast, setClassifyToast] = useState<string | null>(null);
  const [openingPipeline, setOpeningPipeline] = useState<OpeningProperty[] | null>(null);

  useEffect(() => {
    const code = localStorage.getItem('task-sync-code');
    setSyncCode(code);
  }, []);

  const { tasks: todayTasks, loading: tasksLoading } = useTodayTasks(syncCode);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    Promise.all([
      fetch('/api/gmail/auth').then(r => r.json()).catch(() => ({ connected: false })),
      fetch('/api/slack/status').then(r => r.json()).catch(() => ({ connected: false })),
      fetch('/api/calendar/status').then(r => r.json()).catch(() => ({ connected: false })),
    ]).then(([gmail, slack, calendar]) => {
      setStatuses({
        gmail: gmail.connected,
        slack: slack.connected,
        calendar: calendar.connected,
      });
    });

    fetch('/api/opening')
      .then((r) => r.json())
      .then((d: OpeningProperty[]) => {
        setOpeningPipeline(Array.isArray(d) ? d : []);
      })
      .catch(() => setOpeningPipeline([]));
  }, []);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const hour = today.getHours();
  const greeting = hour < 12 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'お疲れ様です';
  const dateStr = today.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  const closingBarColor =
    data?.closing.status === 'danger' ? '#E24B4A' :
    data?.closing.status === 'warn' ? '#EF9F27' : '#1D9E75';

  const closingBadgeStyle =
    data?.closing.status === 'danger'
      ? { background: '#FCEBEB', color: '#A32D2D' }
      : data?.closing.status === 'warn'
      ? { background: '#FAEEDA', color: '#633806' }
      : { background: '#E1F5EE', color: '#085041' };

  const openingPipelineItems = useMemo(() => {
    if (!openingPipeline) return [];
    return [...openingPipeline]
      .filter((p) => p.status !== 'active')
      .sort((a, b) =>
        (a.target_open_month ?? '\xff').localeCompare(b.target_open_month ?? '\xff'),
      )
      .slice(0, 5);
  }, [openingPipeline]);

  const phaseDoneFor = (p: OpeningProperty) =>
    PHASE_KEYS.filter((def) =>
      p.phases?.some((ph) => ph.phase_key === def.key && ph.completed),
    ).length;

  const runGmailClassify = async () => {
    setClassifyLoading(true);
    setClassifyToast(null);
    try {
      const r = await fetch('/api/gmail/classify', { method: 'POST' });
      const data = await r.json();
      if (data.ok) {
        setClassifyToast(`${data.classified}件のメールを取り込みました（タスク登録 ${data.tasksCreated}件）`);
      } else {
        setClassifyToast(data.error || '取り込みに失敗しました');
      }
    } catch {
      setClassifyToast('取り込みに失敗しました');
    } finally {
      setClassifyLoading(false);
      setTimeout(() => setClassifyToast(null), 6000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* 挨拶 + 連携状態 */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{greeting}</h1>
              <p className="text-sm text-gray-400 mt-1">{dateStr}</p>
            </div>
            <div className="flex gap-2">
              {(['gmail', 'slack', 'calendar'] as const).map(service => (
                <div key={service} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  statuses[service] ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statuses[service] ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {service.charAt(0).toUpperCase() + service.slice(1)}
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">読み込み中...</div>
          ) : (
            <>
              {/* 月次締め進捗 */}
              {data?.closing && (
                <section>
                  <p className="text-xs font-semibold text-gray-400 tracking-widest mb-2">月次締め進捗</p>
                  <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {data.closing.month}月締め　10営業日まで残り
                        <span className="text-lg font-bold ml-1" style={{ color: closingBarColor }}>
                          {data.closing.remainingDays}日
                        </span>
                      </p>
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={closingBadgeStyle}
                      >
                        {data.closing.statusLabel}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-gray-100 border border-gray-200 overflow-hidden mb-4">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${data.closing.progressPercent}%`, background: closingBarColor }}
                      />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-gray-200">
                      <div className="text-center pr-4">
                        <p className="text-2xl font-bold text-green-600">{data.closing.exportedCount}件</p>
                        <p className="text-xs text-gray-500 mt-1">CSV出力済み</p>
                      </div>
                      <div className="text-center px-4">
                        <p className="text-2xl font-bold text-red-500">{data.closing.unprocessedCount}件</p>
                        <p className="text-xs text-gray-500 mt-1">未入力・未処理</p>
                      </div>
                      <div className="text-center pl-4">
                        <p className="text-2xl font-bold text-gray-700">{data.closing.totalCount}件</p>
                        <p className="text-xs text-gray-500 mt-1">今月の合計</p>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* TODAY'S TASKS（Firebase） */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 tracking-widest">TODAY&apos;S TASKS</p>
                  <Link href="/tasks" className="text-xs text-blue-500 hover:underline">
                    すべて見る →
                  </Link>
                </div>
                {!syncCode ? (
                  <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4 text-center">
                    <p className="text-sm text-gray-400">タスク管理と連携するには</p>
                    <Link href="/tasks" className="text-sm text-blue-500 font-medium hover:underline">
                      タスクタブで同期コードを設定してください
                    </Link>
                  </div>
                ) : tasksLoading ? (
                  <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4 text-center text-sm text-gray-400">
                    読み込み中...
                  </div>
                ) : todayTasks.length === 0 ? (
                  <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4 text-center text-sm text-gray-400">
                    今日・明日のタスクはありません
                  </div>
                ) : (
                  <div className="space-y-2">
                    {todayTasks.map((task) => {
                      const isToday = task.deadline !== tomorrowStr;
                      const sourceColor: Record<string, string> = {
                        mail: 'bg-blue-50 text-blue-600',
                        gmail: 'bg-sky-50 text-sky-700',
                        slack: 'bg-pink-50 text-pink-600',
                        other: 'bg-purple-50 text-purple-600',
                      };
                      const sourceLabel: Record<string, string> = {
                        mail: 'メール',
                        gmail: 'Gmail',
                        slack: 'Slack',
                        other: 'その他',
                      };

                      return (
                        <Link key={task.id} href="/tasks">
                          <div className={`flex items-center gap-3 p-4 rounded-2xl bg-white shadow-sm border-2 hover:border-gray-300 transition-colors cursor-pointer ${
                            isToday && task.priority === 'high'
                              ? 'border-l-4 border-red-400 border-t-red-100 border-r-red-100 border-b-red-100'
                              : 'border-gray-200'
                          }`}>
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              task.priority === 'high' ? 'bg-red-400' :
                              task.priority === 'medium' ? 'bg-amber-400' : 'bg-green-400'
                            }`} />
                            <p className="flex-1 text-sm font-medium text-gray-900 truncate">
                              {task.title}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColor[task.source] || sourceColor.other}`}>
                              {sourceLabel[task.source] || sourceLabel.other}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isToday ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {isToday ? '今日' : '明日'}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 今週の業務ログ */}
              <section>
                <p className="text-xs font-semibold text-gray-400 tracking-widest mb-2">業務ログ</p>
                <WorkLogSummary />
              </section>

              {/* 出店パイプライン */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 tracking-widest">出店パイプライン</p>
                  <Link href="/opening" className="text-xs text-blue-500 hover:underline">
                    詳細を見る →
                  </Link>
                </div>
                {openingPipeline === null ? (
                  <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4 text-center text-sm text-gray-400">
                    読み込み中...
                  </div>
                ) : openingPipelineItems.length === 0 ? (
                  <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4 text-center text-sm text-gray-400">
                    稼働前の物件はありません
                  </div>
                ) : (
                  <div className="space-y-2">
                    {openingPipelineItems.map((p) => {
                      const done = phaseDoneFor(p);
                      const total = PHASE_KEYS.length;
                      return (
                        <div
                          key={p.id}
                          className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-3"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.property_name}</p>
                            <span className="text-xs font-medium text-gray-600 shrink-0">
                              {STATUS_LABELS[p.status]}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${(done / total) * 100}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            {done}/{total} フェーズ完了
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 期限が近い請求書 */}
              {(data?.urgentInvoices.length ?? 0) > 0 && (
                <section>
                  <p className="text-xs font-semibold text-gray-400 tracking-widest mb-2">期限が近い請求書</p>
                  <div className="space-y-2">
                    {data?.urgentInvoices.map(inv => {
                      const isTomorrow = inv.dueDate === tomorrowStr;
                      return (
                        <div
                          key={inv.id}
                          className={`flex items-center gap-3 p-4 rounded-2xl bg-white shadow-sm border-2 ${
                            isTomorrow
                              ? 'border-l-4 border-red-400 border-t-red-100 border-r-red-100 border-b-red-100'
                              : 'border-l-4 border-amber-400 border-t-amber-100 border-r-amber-100 border-b-amber-100'
                          }`}
                        >
                          <p className="font-semibold text-sm text-gray-900 flex-1">{inv.vendorName}</p>
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            isTomorrow ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {isTomorrow ? '明日' : '3日後'}
                          </span>
                          <span className="text-sm text-gray-600 min-w-[90px] text-right font-medium">
                            {inv.totalAmount ? `¥${inv.totalAmount.toLocaleString()}` : '金額未入力'}
                          </span>
                          <Link href="/mail/invoices" className="text-xs text-blue-500 font-medium hover:underline">
                            処理する
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Gmail 分類取り込み */}
              <section>
                <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 tracking-widest mb-1">Gmail</p>
                      <p className="text-sm font-medium text-gray-900">未読（過去24時間）を分類してタスク化</p>
                    </div>
                    <button
                      type="button"
                      disabled={classifyLoading}
                      onClick={runGmailClassify}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {classifyLoading ? (
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : null}
                      📬 メールを取り込む
                    </button>
                  </div>
                  {classifyToast && (
                    <p className="mt-3 text-sm text-gray-600">{classifyToast}</p>
                  )}
                </div>
              </section>

              {/* 給与 GMO 変換 */}
              <section>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white border-2 border-gray-200 shadow-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 tracking-widest mb-1">給与 GMO 変換</p>
                    <p className="text-sm font-medium text-gray-900">MF CSVからGMO用振込CSVを生成</p>
                  </div>
                  <Link href="/salary-convert" className="text-xs text-blue-500 font-medium hover:underline whitespace-nowrap">
                    開く →
                  </Link>
                </div>
              </section>

              {/* 今月のサマリー */}
              <section>
                <p className="text-xs font-semibold text-gray-400 tracking-widest mb-2">今月のサマリー</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: `${data?.summary.unpaidCount ?? 0}件`, label: '未払い請求書', color: 'text-red-500' },
                    { val: `¥${(data?.summary.unpaidTotal ?? 0).toLocaleString()}`, label: '今月 未払い合計', color: 'text-gray-900' },
                    { val: `${data?.summary.noAccountCount ?? 0}件`, label: '科目未入力', color: 'text-amber-500' },
                  ].map(item => (
                    <div key={item.label} className="p-4 rounded-2xl bg-white border-2 border-gray-200 shadow-sm text-center">
                      <p className={`text-2xl font-bold ${item.color}`}>{item.val}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
