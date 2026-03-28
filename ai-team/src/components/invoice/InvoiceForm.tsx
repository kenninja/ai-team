'use client';
import { useState, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Invoice = Record<string, any>;

type Props = {
  invoice?: Invoice;
  onSave: () => void;
  onCancel: () => void;
};

const COMMON_ACCOUNTS = ['通信費', '地代家賃', '消耗品費', '業務委託料', '雑費', '広告宣伝費', '水道光熱費', '荷造運賃'];

export function InvoiceForm({ invoice, onSave, onCancel }: Props) {
  const [vendorName, setVendorName] = useState(invoice?.vendor_name ?? '');
  const [totalAmount, setTotalAmount] = useState(invoice?.total_amount?.toString() ?? '');
  const [taxAmount, setTaxAmount] = useState(invoice?.tax_amount?.toString() ?? '');
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date ?? '');
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? '');
  const [accountItem, setAccountItem] = useState(invoice?.account_title ?? '');
  const [summary, setSummary] = useState(invoice?.description ?? '');
  const [isMFVendor, setIsMFVendor] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!vendorName) { setIsMFVendor(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mf-vendors/check?name=${encodeURIComponent(vendorName)}`);
        const data = await res.json();
        setIsMFVendor(data.matched);
      } catch { setIsMFVendor(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [vendorName]);

  const handleAmountChange = (val: string) => {
    setTotalAmount(val);
    const num = parseInt(val.replace(/,/g, ''), 10);
    if (!isNaN(num)) {
      setTaxAmount(Math.round(num * 10 / 110).toString());
    }
  };

  const isReady = vendorName && totalAmount && dueDate;

  const handleSave = async (status: 'pending' | 'ready') => {
    setSaving(true);
    const body = {
      vendorName,
      totalAmount: parseInt(totalAmount.replace(/,/g, ''), 10) || null,
      taxAmount: parseInt(taxAmount.replace(/,/g, ''), 10) || null,
      invoiceDate: invoiceDate || null,
      dueDate: dueDate || null,
      accountItem: accountItem || null,
      summary: summary || null,
      status,
    };

    if (invoice) {
      await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoice.id,
          vendor_name: body.vendorName,
          total_amount: body.totalAmount,
          tax_amount: body.taxAmount,
          invoice_date: body.invoiceDate,
          due_date: body.dueDate,
          account_title: body.accountItem,
          description: body.summary,
          status: body.status,
        }),
      });
    } else {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="space-y-4 p-1">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          取引先名 <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            placeholder="例：株式会社メガ"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />
          {isMFVendor && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium whitespace-nowrap">
              登録済み
            </span>
          )}
          {vendorName && !isMFVendor && (
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">
              スポット
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            請求金額（税込）<span className="text-red-400">*</span>
          </label>
          <input
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            placeholder="例：494377"
            value={totalAmount}
            onChange={(e) => handleAmountChange(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">消費税額</label>
          <input
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            placeholder="自動計算"
            value={taxAmount}
            onChange={(e) => setTaxAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">請求日</label>
          <input
            type="date"
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            支払期日 <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">勘定科目</label>
        <input
          className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400 mb-2"
          placeholder="例：地代家賃"
          value={accountItem}
          onChange={(e) => setAccountItem(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {COMMON_ACCOUNTS.map((acc) => (
            <button
              key={acc}
              type="button"
              onClick={() => setAccountItem(acc)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                accountItem === acc
                  ? 'bg-green-50 border-green-400 text-green-700 font-medium'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {acc}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">摘要</label>
        <input
          className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-sm focus:outline-none focus:border-blue-400"
          placeholder="例：3月分家賃・共益費"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">MFの品目欄に入ります</p>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          onClick={() => handleSave('pending')}
          disabled={!vendorName || saving}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          下書き保存
        </button>
        <button
          onClick={() => handleSave('ready')}
          disabled={!isReady || saving}
          className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-40"
        >
          {saving ? '保存中...' : 'CSV出力待ちに登録'}
        </button>
      </div>
    </div>
  );
}
