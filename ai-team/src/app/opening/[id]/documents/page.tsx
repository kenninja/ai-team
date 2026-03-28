'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import { OPENING_DOCUMENT_CATEGORY_ORDER } from '@/lib/opening-document-master';
import { formatOpeningDocDeadline, type OpeningDocument } from '@/types/opening';

type ApiResponse = {
  property: { id: number; property_name: string };
  documents: OpeningDocument[];
};

function categorySortKey(cat: string): number {
  const i = (OPENING_DOCUMENT_CATEGORY_ORDER as readonly string[]).indexOf(cat);
  return i === -1 ? 999 : i;
}

export default function OpeningDocumentsPage() {
  const params = useParams();
  const propertyId = String(params.id ?? '');

  const [propertyName, setPropertyName] = useState('');
  const [documents, setDocuments] = useState<OpeningDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [memoDrafts, setMemoDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/opening/${propertyId}/documents`);
      if (!r.ok) throw new Error();
      const data = (await r.json()) as ApiResponse;
      setPropertyName(data.property?.property_name ?? '');
      const docs = data.documents ?? [];
      setDocuments(docs);
      const drafts: Record<number, string> = {};
      for (const d of docs) {
        drafts[d.id] = d.memo ?? '';
      }
      setMemoDrafts(drafts);
    } catch {
      setDocuments([]);
      setPropertyName('');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, OpeningDocument[]>();
    for (const d of documents) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    const keys = Array.from(map.keys()).sort(
      (a, b) => categorySortKey(a) - categorySortKey(b),
    );
    return keys.map((cat) => ({ category: cat, items: map.get(cat)! }));
  }, [documents]);

  const stats = useMemo(() => {
    const total = documents.length;
    const submitted = documents.filter((d) => d.submitted).length;
    const requiredDocs = documents.filter((d) => d.is_required);
    const requiredTotal = requiredDocs.length;
    const requiredSubmitted = requiredDocs.filter((d) => d.submitted).length;
    return { total, submitted, requiredTotal, requiredSubmitted };
  }, [documents]);

  const patchDocument = async (
    docId: number,
    submitted: boolean,
    options?: { memo?: string | null; includeMemo: boolean },
  ) => {
    const prev = documents;
    const prevDrafts = { ...memoDrafts };
    setDocuments((list) =>
      list.map((d) =>
        d.id === docId
          ? {
              ...d,
              submitted,
              memo:
                options?.includeMemo && options.memo !== undefined
                  ? options.memo
                  : d.memo,
            }
          : d,
      ),
    );
    if (options?.includeMemo && options.memo !== undefined) {
      setMemoDrafts((m) => ({ ...m, [docId]: options.memo ?? '' }));
    }
    try {
      const body: { document_id: number; submitted: boolean; memo?: string | null } = {
        document_id: docId,
        submitted,
      };
      if (options?.includeMemo) {
        body.memo = options.memo ?? null;
      }
      const r = await fetch(`/api/opening/${propertyId}/documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
    } catch {
      setDocuments(prev);
      setMemoDrafts(prevDrafts);
    }
  };

  const toggleSubmitted = (d: OpeningDocument) => {
    patchDocument(d.id, !d.submitted);
  };

  const flushMemo = (d: OpeningDocument) => {
    const text = memoDrafts[d.id] ?? '';
    patchDocument(d.id, d.submitted, { memo: text || null, includeMemo: true });
  };

  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/30">
      <Header />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <Link
          href="/opening"
          className="inline-block text-sm text-blue-600 hover:underline mb-4"
        >
          ← 出店管理に戻る
        </Link>

        {loading ? (
          <p className="text-center text-gray-400 py-12">読み込み中...</p>
        ) : !propertyName ? (
          <p className="text-center text-gray-400 py-12">物件が見つかりません。</p>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">{propertyName}</h1>
              <p className="text-sm text-gray-500 mt-1">認可書類チェックリスト</p>
            </div>

            <section className="mb-8 rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 mb-2">
                提出済{' '}
                <span className="text-emerald-600">
                  {stats.submitted} / {stats.total}件
                </span>
                <span className="text-gray-500 font-normal text-xs ml-2">
                  （必須 {stats.requiredSubmitted} / {stats.requiredTotal}件）
                </span>
              </p>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct(stats.submitted, stats.total)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">必須のみ</p>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{
                    width: `${pct(stats.requiredSubmitted, stats.requiredTotal)}%`,
                  }}
                />
              </div>
            </section>

            <div className="space-y-4">
              {grouped.map(({ category, items }) => (
                <section
                  key={category}
                  className="border-2 border-gray-200 shadow-sm rounded-2xl p-4 bg-white"
                >
                  <h2 className="text-sm font-bold text-gray-800 mb-3">{category}</h2>
                  <ul className="space-y-2">
                    {items.map((d) => (
                      <li
                        key={d.id}
                        className={`rounded-xl border border-gray-100 p-3 transition-colors ${
                          d.submitted ? 'bg-green-50' : 'bg-gray-50/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            id={`opening-doc-${d.id}`}
                            type="checkbox"
                            checked={d.submitted}
                            onChange={() => toggleSubmitted(d)}
                            className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor={`opening-doc-${d.id}`}
                              className="flex flex-wrap items-center gap-2 cursor-pointer select-none"
                            >
                              <span className="text-sm font-medium text-gray-900">
                                {d.doc_name}
                              </span>
                              {d.is_required ? (
                                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">
                                  必須
                                </span>
                              ) : (
                                <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded">
                                  任意
                                </span>
                              )}
                              <span className="text-purple-600 text-xs font-bold">
                                {formatOpeningDocDeadline(d.deadline_offset)}
                              </span>
                            </label>
                            {d.submitted && (
                              <textarea
                                className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 resize-y min-h-[64px] bg-white"
                                placeholder="メモ（自治体差異・提出日など）"
                                value={memoDrafts[d.id] ?? ''}
                                onChange={(e) =>
                                  setMemoDrafts((m) => ({ ...m, [d.id]: e.target.value }))
                                }
                                onBlur={() => flushMemo(d)}
                              />
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
