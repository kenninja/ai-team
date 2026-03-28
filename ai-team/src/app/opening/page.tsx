'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import {
  PHASE_KEYS,
  STATUS_LABELS,
  NINKA_PHASE_KEYS,
  type OpeningProperty,
  type PhaseKey,
  type PropertyStatus,
} from '@/types/opening';

const STATUS_ORDER: PropertyStatus[] = [
  'candidate',
  'viewing',
  'applied',
  'contracted',
  'construction',
  'ready',
  'active',
  'dropped',
];

function statusRank(s: PropertyStatus) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 99 : i;
}

function formatOpenMonth(v: string | null) {
  if (!v) return '—';
  return v.replace(/-/g, '/');
}

export default function OpeningPage() {
  const [properties, setProperties] = useState<OpeningProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    property_name: '',
    area: '',
    target_open_month: '',
    rent: '',
    status: 'candidate' as PropertyStatus,
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/opening');
      if (!r.ok) throw new Error();
      const data = (await r.json()) as OpeningProperty[];
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    return [...properties].sort((a, b) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      const ma = a.target_open_month ?? '\xff';
      const mb = b.target_open_month ?? '\xff';
      return ma.localeCompare(mb);
    });
  }, [properties]);

  const statusCounts = useMemo(() => {
    const map = new Map<PropertyStatus, number>();
    for (const s of STATUS_ORDER) map.set(s, 0);
    for (const p of properties) {
      map.set(p.status, (map.get(p.status) ?? 0) + 1);
    }
    return map;
  }, [properties]);

  const togglePhase = async (propertyId: number, phaseKey: PhaseKey, next: boolean) => {
    let before: OpeningProperty[] | null = null;
    setProperties((list) => {
      before = list;
      return list.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              phases: p.phases?.map((ph) =>
                ph.phase_key === phaseKey ? { ...ph, completed: next } : ph,
              ),
            }
          : p,
      );
    });
    try {
      const r = await fetch(`/api/opening/${propertyId}/phase`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase_key: phaseKey, completed: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      if (before) setProperties(before);
    }
  };

  const deleteProperty = async (id: number) => {
    if (!window.confirm('この物件を削除しますか？')) return;
    try {
      const r = await fetch(`/api/opening/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        alert(j.error || '削除に失敗しました');
        return;
      }
      setProperties((list) => list.filter((x) => x.id !== id));
    } catch {
      alert('削除に失敗しました');
    }
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const month =
      form.target_open_month.trim() === ''
        ? null
        : form.target_open_month.replace(/(\d{4})-(\d{2})/, '$1/$2');
    try {
      const r = await fetch('/api/opening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_name: form.property_name,
          area: form.area,
          target_open_month: month,
          rent: form.rent === '' ? null : Number(form.rent),
          status: form.status,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        alert(j.error || '登録に失敗しました');
        return;
      }
      setModalOpen(false);
      setForm({
        property_name: '',
        area: '',
        target_open_month: '',
        rent: '',
        status: 'candidate',
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/30">
      <Header />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">出店管理</h1>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
          >
            ＋ 物件追加
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-100 text-gray-700">
            物件 {properties.length}件
          </span>
          {STATUS_ORDER.map((st) => (
            <span
              key={st}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700"
            >
              {STATUS_LABELS[st]} {statusCounts.get(st) ?? 0}
            </span>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-12">読み込み中...</p>
        ) : sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            物件がありません。「＋ 物件追加」から登録してください。
          </p>
        ) : (
          <div className="space-y-4">
            {sorted.map((p) => {
              const phases = PHASE_KEYS.map((def) => {
                const row = p.phases?.find((x) => x.phase_key === def.key);
                return { def, completed: row?.completed ?? false };
              });
              const done = phases.filter((x) => x.completed).length;
              const totalPh = PHASE_KEYS.length;
              const doc = p.doc_progress ?? { total: 0, submitted: 0 };

              return (
                <article
                  key={p.id}
                  className="relative border-2 border-gray-200 shadow-sm rounded-2xl p-4 bg-white pr-10"
                >
                  <button
                    type="button"
                    onClick={() => deleteProperty(p.id)}
                    className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 text-sm leading-none hover:bg-gray-100 hover:text-gray-600"
                    aria-label="この物件を削除"
                  >
                    ✕
                  </button>
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4 justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h2 className="text-lg font-semibold text-gray-900 truncate">
                          {p.property_name}
                        </h2>
                        <span className="text-sm text-gray-500">{p.area}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-xs font-medium">
                          {STATUS_LABELS[p.status]}
                        </span>
                        <span className="text-gray-600">
                          開校予定{' '}
                          <span className="font-medium">{formatOpenMonth(p.target_open_month)}</span>
                        </span>
                        {p.rent != null ? (
                          <span className="text-gray-600">
                            賃料 <span className="font-medium">¥{p.rent.toLocaleString()}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">賃料 未入力</span>
                        )}
                      </div>
                    </div>
                    <div className="lg:w-64 flex-shrink-0 space-y-2">
                      <p className="text-xs text-gray-500">フェーズ進捗</p>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden border border-gray-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${(done / totalPh) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">
                        {done}/{totalPh} 完了
                      </p>
                      <p className="text-xs text-gray-500 mt-2">認可書類</p>
                      <Link
                        href={`/opening/${p.id}/documents`}
                        className="inline-flex text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        提出済 {doc.submitted}/{doc.total}
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 mb-2">フェーズチェック</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {phases.map(({ def, completed }) => {
                        const isNinka = NINKA_PHASE_KEYS.has(def.key);
                        return (
                          <label
                            key={def.key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-colors ${
                              isNinka
                                ? 'border-purple-200 bg-purple-50/80 hover:bg-purple-50'
                                : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={completed}
                              onChange={(e) => togglePhase(p.id, def.key, e.target.checked)}
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span
                              className={`text-sm ${
                                isNinka ? 'text-purple-900 font-medium' : 'text-gray-800'
                              }`}
                            >
                              {def.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-lg max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">物件を追加</h3>
              <form onSubmit={submitNew} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">物件名</label>
                  <input
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={form.property_name}
                    onChange={(e) => setForm((f) => ({ ...f, property_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">エリア</label>
                  <input
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={form.area}
                    onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">開校予定月</label>
                  <input
                    type="month"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={form.target_open_month}
                    onChange={(e) => setForm((f) => ({ ...f, target_open_month: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">賃料（円）</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={form.rent}
                    onChange={(e) => setForm((f) => ({ ...f, rent: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">ステータス</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as PropertyStatus }))
                    }
                  >
                    {(Object.keys(STATUS_LABELS) as PropertyStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {STATUS_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {submitting ? '登録中...' : '登録'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
