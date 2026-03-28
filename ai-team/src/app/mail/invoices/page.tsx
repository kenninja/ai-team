'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import { InvoiceForm } from '@/components/invoice/InvoiceForm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Invoice = Record<string, any>;

type StatusFilter = 'all' | 'pending' | 'ready' | 'exported';

const statusConfig: Record<string, { label: string; className: string }> = {
  pending:  { label: '未処理',      className: 'bg-red-50 text-red-600' },
  ready:    { label: 'CSV出力待ち', className: 'bg-amber-50 text-amber-700' },
  exported: { label: 'MF登録済み',  className: 'bg-green-50 text-green-700' },
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mfVendorCount, setMfVendorCount] = useState(0);
  const [mfMatches, setMfMatches] = useState<Record<number, boolean>>({});
  const mfFileInputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = () => {
    fetch('/api/invoices')
      .then(res => res.json())
      .then(data => {
        setInvoices(data);
        setLoading(false);
        // MFマッチチェック
        const names = data.map((inv: Invoice) => inv.vendor_name).filter(Boolean);
        if (names.length > 0) {
          fetch('/api/mf-vendors/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorNames: Array.from(new Set(names)) }),
          })
            .then(r => r.json())
            .then((matches: Record<string, boolean>) => {
              const byId: Record<number, boolean> = {};
              data.forEach((inv: Invoice) => {
                byId[inv.id] = inv.vendor_name ? (matches[inv.vendor_name] ?? false) : false;
              });
              setMfMatches(byId);
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  };

  const refreshMfCount = () => {
    fetch('/api/mf-vendors').then(r => r.json()).then(d => setMfVendorCount(d.count)).catch(() => {});
  };

  useEffect(() => { fetchInvoices(); refreshMfCount(); }, []);

  // フィルタ適用
  const filtered = filter === 'all' ? invoices : invoices.filter(inv => inv.status === filter);

  // サマリー集計
  const pendingCount = invoices.filter(inv => inv.status === 'pending').length;
  const readyCount = invoices.filter(inv => inv.status === 'ready').length;
  const exportedCount = invoices.filter(inv => inv.status === 'exported').length;
  const monthlyTotal = invoices
    .filter(inv => inv.status !== 'exported')
    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  // CSV出力
  const handleMFExport = async () => {
    const readyIds = invoices.filter(inv => inv.status === 'ready').map(inv => inv.id);
    if (readyIds.length === 0) return;

    const res = await fetch('/api/invoices/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: readyIds, format: 'mf_auto' }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `invoices_mf_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // ステータスをexportedに更新
    setTimeout(async () => {
      await fetch('/api/invoices/bulk-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: readyIds, status: 'exported' }),
      });
      fetchInvoices();
    }, 1500);
  };

  const handleDelete = async (id: number, vendorName: string) => {
    if (!confirm(`「${vendorName || '取引先不明'}」の請求書を削除しますか？`)) return;
    const res = await fetch('/api/invoices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setInvoices(prev => prev.filter(inv => inv.id !== id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">請求書管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                請求書の登録・ステータス管理・MF用CSV出力
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={mfFileInputRef}
                type="file"
                accept=".csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append('file', file);
                  const res = await fetch('/api/mf-vendors/import', { method: 'POST', body: form });
                  const data = await res.json();
                  alert(`${data.imported}件の支払先を取り込みました`);
                  refreshMfCount();
                  fetchInvoices();
                  if (mfFileInputRef.current) mfFileInputRef.current.value = '';
                }}
                className="hidden"
              />
              <button
                onClick={() => mfFileInputRef.current?.click()}
                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
              >
                MF支払先マスタ更新{mfVendorCount > 0 && ` (${mfVendorCount}件)`}
              </button>
              <button
                onClick={() => { setEditingInvoice(undefined); setShowForm(true); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                + 新規登録
              </button>
              <button
                onClick={handleMFExport}
                disabled={readyCount === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                MF用CSV出力 ({readyCount}件)
              </button>
            </div>
          </div>

          {/* サマリーカード */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: '未処理', val: `${pendingCount}件`, color: 'text-red-500', bg: 'bg-red-50' },
              { label: 'CSV出力待ち', val: `${readyCount}件`, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'MF登録済み', val: `${exportedCount}件`, color: 'text-green-600', bg: 'bg-green-50' },
              { label: '今月 未処理合計', val: `\u00A5${monthlyTotal.toLocaleString()}`, color: 'text-gray-900', bg: 'bg-white' },
            ].map(item => (
              <div key={item.label} className={`p-4 rounded-2xl border-2 border-gray-200 shadow-sm text-center ${item.bg}`}>
                <p className={`text-2xl font-bold ${item.color}`}>{item.val}</p>
                <p className="text-xs text-gray-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          {/* ステータスフィルタ */}
          <div className="flex gap-2 mb-4">
            {([
              { key: 'all' as StatusFilter, label: '全件' },
              { key: 'pending' as StatusFilter, label: '未処理' },
              { key: 'ready' as StatusFilter, label: 'CSV出力待ち' },
              { key: 'exported' as StatusFilter, label: 'MF登録済み' },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* テーブル */}
          {loading ? (
            <div className="text-center text-gray-400 py-12">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="text-lg mb-2">請求書がありません</p>
              <p className="text-sm">「+ 新規登録」から請求書を登録してください</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" className="rounded" onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filtered.map(inv => inv.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }} />
                    </th>
                    <th className="px-3 py-2 text-left">取引先</th>
                    <th className="px-3 py-2 text-left">種別</th>
                    <th className="px-3 py-2 text-left">請求日</th>
                    <th className="px-3 py-2 text-left">支払期日</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-left">勘定科目</th>
                    <th className="px-3 py-2 text-left">ステータス</th>
                    <th className="px-3 py-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.includes(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{inv.vendor_name || '-'}</td>
                      <td className="px-3 py-2">
                        {mfMatches[inv.id] ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">登録済み</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">スポット</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{inv.invoice_date || '-'}</td>
                      <td className="px-3 py-2">{inv.due_date || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        {inv.total_amount ? `\u00A5${Number(inv.total_amount).toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-2">{inv.account_title || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          statusConfig[inv.status]?.className ?? 'bg-gray-100 text-gray-500'
                        }`}>
                          {statusConfig[inv.status]?.label ?? inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditingInvoice(inv); setShowForm(true); }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(inv.id, inv.vendor_name)}
                            className="text-xs text-red-500 hover:underline ml-2"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 新規登録・編集モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold mb-4">
              {editingInvoice ? '請求書を編集' : '請求書を登録'}
            </h2>
            <InvoiceForm
              invoice={editingInvoice}
              onSave={() => { setShowForm(false); fetchInvoices(); }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
