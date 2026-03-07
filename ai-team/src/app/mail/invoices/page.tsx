'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Invoice = Record<string, any>;

const ACCOUNT_TITLES = [
  '通信費', '水道光熱費', '荷造運賃', '消耗品費', '旅費交通費',
  '接待交際費', '広告宣伝費', '支払手数料', '地代家賃', '保険料',
  '修繕費', '外注費', '会議費', '新聞図書費', '雑費',
];

const TAX_CATEGORIES = ['課税仕入10%', '課税仕入8%', '非課税仕入', '不課税仕入'];
const DEPARTMENTS = ['IT部', '管理部', '営業部', '経理部', '総務部'];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Invoice>({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/invoices')
      .then(res => res.json())
      .then(data => { setInvoices(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleEdit = (inv: Invoice) => {
    setEditingId(inv.id);
    setEditData({ ...inv });
  };

  const handleSave = async () => {
    if (!editingId) return;
    const res = await fetch('/api/invoices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...editData }),
    });
    const updated = await res.json();
    setInvoices(prev => prev.map(inv => inv.id === editingId ? updated : inv));
    setEditingId(null);
  };

  const handleConfirm = async (id: number) => {
    const res = await fetch('/api/invoices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'confirmed' }),
    });
    const updated = await res.json();
    setInvoices(prev => prev.map(inv => inv.id === id ? updated : inv));
  };

  const handleExport = async (format: string) => {
    const ids = selectedIds.length > 0 ? selectedIds :
      invoices.filter(inv => inv.status === 'confirmed').map(inv => inv.id);

    if (ids.length === 0) return;

    const res = await fetch('/api/invoices/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, format }),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `invoices_${format}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setShowExportModal(false);

    // 一覧を再取得
    const refreshRes = await fetch('/api/invoices');
    setInvoices(await refreshRes.json());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const confirmedCount = invoices.filter(inv => inv.status === 'confirmed').length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">請求書管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                メールから抽出された請求書を確認・編集し、MoneyForward用CSVを出力できます
              </p>
            </div>
            <button
              onClick={() => setShowExportModal(true)}
              disabled={confirmedCount === 0 && selectedIds.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              CSV出力 ({selectedIds.length > 0 ? selectedIds.length : confirmedCount}件)
            </button>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">読み込み中...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <span className="text-4xl block mb-3">📄</span>
              <p>請求書がありません</p>
              <a href="/mail" className="text-blue-600 hover:underline text-sm mt-2 block">
                メール画面でAI分析を実行してください
              </a>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" className="rounded" onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(invoices.map(inv => inv.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }} />
                    </th>
                    <th className="px-3 py-2 text-left">取引先</th>
                    <th className="px-3 py-2 text-left">請求日</th>
                    <th className="px-3 py-2 text-left">支払期日</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-left">勘定科目</th>
                    <th className="px-3 py-2 text-left">ステータス</th>
                    <th className="px-3 py-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
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
                      <td className="px-3 py-2">{inv.invoice_date || '-'}</td>
                      <td className="px-3 py-2">{inv.due_date || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        {inv.total_amount ? `¥${Number(inv.total_amount).toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-2">{inv.account_title || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          inv.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                          inv.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {inv.status === 'draft' ? '下書き' : inv.status === 'confirmed' ? '確定' : '出力済'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(inv)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            編集
                          </button>
                          {inv.status === 'draft' && (
                            <button
                              onClick={() => handleConfirm(inv.id)}
                              className="text-xs text-green-600 hover:underline ml-2"
                            >
                              確定
                            </button>
                          )}
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

      {/* 編集モーダル */}
      {editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">請求書を編集</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">取引先名</label>
                <input value={editData.vendor_name || ''} onChange={e => setEditData({...editData, vendor_name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">請求日</label>
                  <input type="date" value={editData.invoice_date || ''} onChange={e => setEditData({...editData, invoice_date: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">支払期日</label>
                  <input type="date" value={editData.due_date || ''} onChange={e => setEditData({...editData, due_date: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">税込金額</label>
                  <input type="number" value={editData.total_amount || ''} onChange={e => setEditData({...editData, total_amount: parseInt(e.target.value) || 0})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">消費税額</label>
                  <input type="number" value={editData.tax_amount || ''} onChange={e => setEditData({...editData, tax_amount: parseInt(e.target.value) || 0})}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">摘要</label>
                <input value={editData.description || ''} onChange={e => setEditData({...editData, description: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">勘定科目</label>
                <select value={editData.account_title || ''} onChange={e => setEditData({...editData, account_title: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">選択してください</option>
                  {ACCOUNT_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">税区分</label>
                <select value={editData.tax_category || ''} onChange={e => setEditData({...editData, tax_category: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">選択してください</option>
                  {TAX_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">部門</label>
                <select value={editData.department || ''} onChange={e => setEditData({...editData, department: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">選択してください</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                キャンセル
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV出力モーダル */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">CSV出力形式を選択</h3>
            <div className="space-y-2">
              <button
                onClick={() => handleExport('simple')}
                className="w-full text-left px-4 py-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-sm">簡易CSV</div>
                <div className="text-xs text-gray-500">基本的な請求書データ</div>
              </button>
              <button
                onClick={() => handleExport('mf_spot')}
                className="w-full text-left px-4 py-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-sm">MF スポット支払</div>
                <div className="text-xs text-gray-500">未登録の支払先用（41列）</div>
              </button>
              <button
                onClick={() => handleExport('mf_registered')}
                className="w-full text-left px-4 py-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-sm">MF 登録済み支払先</div>
                <div className="text-xs text-gray-500">登録済み支払先用（36列）</div>
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              className="w-full mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 text-center"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
