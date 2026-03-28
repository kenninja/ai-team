'use client';

import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import { COMPANIES, CompanyCode, DEFAULT_COMPANY } from '@/lib/salary-companies';

type EmployeeBankAccountRow = {
  id: number;
  employee_no: string;
  employee_name: string;
  bank_name: string;
  branch_code: string;
  account_number: string;
};

type ImportMasterResponse = {
  inserted: number;
  duplicatesSkipped: number;
  matchedUniqueCount: number;
  missingGmo: number;
};

type ConvertResponse = {
  filename: string;
  csvBase64: string;
  convertedCount: number;
  skippedCount: number;
  skipped: Array<{ employee_no: string; employee_name: string; account_number: string }>;
};

type BankCandidate = {
  code: string;
  name: string;
  roma?: string;
};

function downloadBase64Csv(filename: string, csvBase64: string) {
  const binary = atob(csvBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: 'text/csv; charset=shift_jis' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCellClient(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\r') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadUtf8Csv(filename: string, csvText: string) {
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function trimLeadingZeros(code: string): string {
  const t = code.trim();
  if (!t) return '';
  const normalized = t.replace(/^0+/, '');
  return normalized || '0';
}

export default function SalaryConvertPage() {
  const [selectedCompany, setSelectedCompany] = useState<CompanyCode>(DEFAULT_COMPANY);
  const [master, setMaster] = useState<EmployeeBankAccountRow[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportMasterResponse | null>(null);

  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<ConvertResponse | null>(null);

  const [gmoFile, setGmoFile] = useState<File | null>(null);
  const [mfMasterFile, setMfMasterFile] = useState<File | null>(null);
  const [mfConvertFile, setMfConvertFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const gmoInputRef = useRef<HTMLInputElement>(null);
  const mfMasterInputRef = useRef<HTMLInputElement>(null);
  const mfConvertInputRef = useRef<HTMLInputElement>(null);
  const addMasterInputRef = useRef<HTMLInputElement>(null);

  const [addMasterUploading, setAddMasterUploading] = useState(false);
  const [addMasterResult, setAddMasterResult] = useState<{
    inserted: number;
    updated: number;
    errors: string[];
  } | null>(null);

  // 手動1件追加フォーム
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_no: '',
    employee_name: '',
    bank_name: '',
    bank_code: '',
    branch_name: '',
    branch_code: '',
    account_type: '1',
    account_number: '',
    account_holder: '',
  });
  const [bankCandidates, setBankCandidates] = useState<BankCandidate[]>([]);
  const [branchCandidates, setBranchCandidates] = useState<BankCandidate[]>([]);
  const [showBankCandidates, setShowBankCandidates] = useState(false);
  const [showBranchCandidates, setShowBranchCandidates] = useState(false);

  const loadMaster = async (company: CompanyCode) => {
    setMasterLoading(true);
    try {
      const res = await fetch(`/api/salary/master?company=${company}`);
      const d = await res.json();
      setMaster(d.records ?? []);
    } catch {
      setMaster([]);
    } finally {
      setMasterLoading(false);
    }
  };

  useEffect(() => { void loadMaster(selectedCompany); }, [selectedCompany]);

  // 銀行名のオートコンプリート（300ms debounce）
  useEffect(() => {
    const q = manualForm.bank_name.trim();
    if (q.length === 0) {
      setBankCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/salary/bank-search?type=bank&name=${encodeURIComponent(q)}`);
        const data = await res.json();
        setBankCandidates(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch {
        setBankCandidates([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [manualForm.bank_name]);

  // 支店名のオートコンプリート（300ms debounce）
  useEffect(() => {
    const q = manualForm.branch_name.trim();
    const bankCode = manualForm.bank_code.trim();
    if (q.length === 0 || bankCode.length === 0) {
      setBranchCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/salary/bank-search?type=branch&bankCode=${encodeURIComponent(bankCode)}&name=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setBranchCandidates(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch {
        setBranchCandidates([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [manualForm.branch_name, manualForm.bank_code]);

  const handleCompanyChange = (next: CompanyCode) => {
    setSelectedCompany(next);
    setImportResult(null);
    setConvertResult(null);
    setAddMasterResult(null);
    setAddMasterUploading(false);
    setManualForm({
      employee_no: '',
      employee_name: '',
      bank_name: '',
      bank_code: '',
      branch_name: '',
      branch_code: '',
      account_type: '1',
      account_number: '',
      account_holder: '',
    });
    setBankCandidates([]);
    setBranchCandidates([]);
    setMaster([]);
  };

  const handleImportMaster = async () => {
    if (!gmoFile || !mfMasterFile) {
      alert('GMO用CSVとMF CSVの両方を選択してください');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('gmoFile', gmoFile);
      formData.append('mfFile', mfMasterFile);
      formData.append('company', selectedCompany);

      const res = await fetch('/api/salary/import-master', {
        method: 'POST',
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'インポートに失敗しました');

      setImportResult(d as ImportMasterResponse);
      await loadMaster(selectedCompany);

      // 初回登録/追加登録後は選択をクリア
      if (gmoInputRef.current) gmoInputRef.current.value = '';
      if (mfMasterInputRef.current) mfMasterInputRef.current.value = '';
      setGmoFile(null);
      setMfMasterFile(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  const handleConvert = async () => {
    if (!mfConvertFile) {
      alert('MF FBデータCSVを選択してください');
      return;
    }

    setConverting(true);
    setConvertResult(null);

    try {
      const formData = new FormData();
      formData.append('mfFile', mfConvertFile);
      formData.append('company', selectedCompany);

      const res = await fetch('/api/salary/convert', {
        method: 'POST',
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '変換に失敗しました');

      const result = d as ConvertResponse;
      setConvertResult(result);

      // 以降の変換に備えてファイル選択は残す（必要ならクリア）
    } catch (e) {
      alert(e instanceof Error ? e.message : '変換に失敗しました');
    } finally {
      setConverting(false);
    }
  };

  const handleDownloadAddMasterTemplate = () => {
    const skipped = convertResult?.skipped ?? [];
    if (skipped.length === 0) {
      alert('未登録者の情報がありません。変換を実行して警告が出た状態でダウンロードしてください。');
      return;
    }

    const header = [
      '従業員番号',
      '従業員名',
      '銀行名',
      '銀行コード',
      '支店コード',
      '口座種別',
      '口座番号',
      '口座名義',
    ];

    const rows = skipped.map(item =>
      ([
        item.employee_no,
        item.employee_name,
        '', // 銀行名
        '', // 銀行コード
        '', // 支店コード
        '', // 口座種別
        item.account_number,
        '', // 口座名義
      ] as const).map(v => escapeCsvCellClient(v)).join(',')
    );

    const csvText = [header.join(','), ...rows].join('\n');
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    downloadUtf8Csv(`未登録者テンプレート_${dateStr}.csv`, csvText);
  };

  const handleUploadAddMasterCsv = async (file: File) => {
    setAddMasterUploading(true);
    setAddMasterResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company', selectedCompany);

      const res = await fetch('/api/salary/add-master-csv', {
        method: 'POST',
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.errors?.[0] || d.error || '追加登録に失敗しました');

      setAddMasterResult(d);
      await loadMaster(selectedCompany);
      if (addMasterInputRef.current) addMasterInputRef.current.value = '';
    } catch (e) {
      alert(e instanceof Error ? e.message : '追加登録に失敗しました');
    } finally {
      setAddMasterUploading(false);
    }
  };

  const handleManualAdd = async () => {
    setManualSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('company', selectedCompany);
      formData.append('employee_no', manualForm.employee_no.trim());
      formData.append('employee_name', manualForm.employee_name.trim());
      formData.append('bank_name', manualForm.bank_name.trim());
      formData.append('bank_code', trimLeadingZeros(manualForm.bank_code));
      formData.append('branch_code', trimLeadingZeros(manualForm.branch_code));
      formData.append('account_type', manualForm.account_type || '1');
      formData.append('account_number', manualForm.account_number.trim());
      formData.append('account_holder', manualForm.account_holder.trim());

      const res = await fetch('/api/salary/add-master-csv', {
        method: 'POST',
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errors?.[0] || d.error || '追加登録に失敗しました');

      setAddMasterResult(d);
      setManualForm({
        employee_no: '',
        employee_name: '',
        bank_name: '',
        bank_code: '',
        branch_name: '',
        branch_code: '',
        account_type: '1',
        account_number: '',
        account_holder: '',
      });
      setBankCandidates([]);
      setBranchCandidates([]);
      await loadMaster(selectedCompany);
    } catch (e) {
      alert(e instanceof Error ? e.message : '追加登録に失敗しました');
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">給与 GMO 変換</h1>
              <p className="text-sm text-gray-500 mt-1">
                MF（FBデータ）から GMO 用振込 CSV（Shift-JIS / ヘッダーなし / 8列）を生成します
              </p>

              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <label className="block text-xs font-semibold text-gray-600 mb-1">対象会社</label>
                <select
                  value={selectedCompany}
                  onChange={(e) => handleCompanyChange(e.target.value as CompanyCode)}
                  className="w-full text-sm border border-gray-200 bg-white rounded-lg px-3 py-2"
                >
                  {Object.entries(COMPANIES).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-400 tracking-widest">登録マスタ</p>
              <p className="text-lg font-bold text-gray-900">{masterLoading ? '...' : `${master.length}件`}</p>
            </div>
          </div>

          {/* セクション1: 初回/追加マスタ登録 */}
          <details className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4">
            <summary className="cursor-pointer select-none flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex w-2.5 h-2.5 rounded-full bg-blue-500" />
                <p className="font-semibold text-gray-900">初回マスタ登録（追加登録も可）</p>
              </div>
              <p className="text-xs text-gray-500">GMO用CSV + MF CSV</p>
            </summary>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* GMO CSV */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-white"
                  onDragOver={(e) => e.preventDefault()}
                >
                  <p className="text-xs font-semibold text-gray-500 tracking-widest mb-2">GMO用CSV（Shift-JIS / ヘッダーなし）</p>
                  <input
                    ref={gmoInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setGmoFile(file);
                    }}
                  />
                  <button
                    onClick={() => gmoInputRef.current?.click()}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                    type="button"
                  >
                    GMO用CSVを選択
                  </button>
                  <p className="text-xs text-gray-500 mt-2">{gmoFile ? `選択中: ${gmoFile.name}` : '未選択'}</p>
                </div>

                {/* MF Master CSV */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-white"
                  onDragOver={(e) => e.preventDefault()}
                >
                  <p className="text-xs font-semibold text-gray-500 tracking-widest mb-2">MF FBデータCSV（Shift-JIS / ヘッダーあり）</p>
                  <input
                    ref={mfMasterInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setMfMasterFile(file);
                    }}
                  />
                  <button
                    onClick={() => mfMasterInputRef.current?.click()}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                    type="button"
                  >
                    MF CSVを選択
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    {mfMasterFile ? `選択中: ${mfMasterFile.name}` : '未選択'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleImportMaster}
                  disabled={importing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  type="button"
                >
                  {importing ? '登録中...' : 'マスタを登録する'}
                </button>
              </div>

              {importResult && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">登録結果</p>
                    <p className="text-xs text-gray-500">
                      マッチ: {importResult.matchedUniqueCount} / inserted: {importResult.inserted}
                    </p>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">
                    重複スキップ: {importResult.duplicatesSkipped} 件 / GMO未存在: {importResult.missingGmo} 件
                  </div>
                </div>
              )}

            </div>
          </details>

          {/* セクション2: 毎月の変換 */}
          <section className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4">
            <h2 className="font-semibold text-gray-900">毎月の変換（メイン）</h2>
            <p className="text-sm text-gray-500 mt-1">MF（FBデータ）をアップロードして変換します</p>

            <div
              className={`mt-4 border-2 border-dashed border-gray-300 rounded-xl p-4 transition-colors ${
                dragActive ? 'bg-gray-50 border-gray-400' : 'bg-white'
              }`}
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0] ?? null;
                setMfConvertFile(file);
              }}
            >
              <input
                ref={mfConvertInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setMfConvertFile(file);
                }}
              />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 tracking-widest mb-2">MF FBデータCSV（Shift-JIS / ヘッダーあり）</p>
                  <p className="text-xs text-gray-500">{mfConvertFile ? `選択中: ${mfConvertFile.name}` : 'ドラッグ&ドロップ もしくは選択'}</p>
                </div>
                <button
                  onClick={() => mfConvertInputRef.current?.click()}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                  type="button"
                >
                  CSVを選択
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleConvert}
                disabled={converting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                type="button"
              >
                {converting ? '変換中...' : 'GMO用CSVに変換する'}
              </button>
            </div>

            {convertResult && (
              <div className="mt-4 space-y-3">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">変換結果</p>
                    <p className="text-xs text-gray-500">{convertResult.filename}</p>
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    変換件数: {convertResult.convertedCount} / 未登録: {convertResult.skippedCount}
                  </div>

                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => downloadBase64Csv(convertResult.filename, convertResult.csvBase64)}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                    >
                      GMO用CSVをダウンロード
                    </button>
                  </div>
                </div>

                {convertResult.skippedCount > 0 && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                    <p className="text-sm font-semibold text-yellow-800">警告: マスタ未登録の口座番号があります</p>
                    <div className="mt-2 max-h-56 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-yellow-100">
                          <tr>
                            <th className="px-2 py-2 text-left">従業員番号</th>
                            <th className="px-2 py-2 text-left">従業員名</th>
                            <th className="px-2 py-2 text-left">口座番号</th>
                          </tr>
                        </thead>
                        <tbody>
                          {convertResult.skipped.map(item => (
                            <tr key={`${item.employee_no}-${item.account_number}`} className="border-b border-yellow-200">
                              <td className="px-2 py-2">{item.employee_no}</td>
                              <td className="px-2 py-2">{item.employee_name}</td>
                              <td className="px-2 py-2 font-medium">{item.account_number}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-yellow-900 mt-2">
                      マスタ未登録分は変換スキップされます。初回/追加マスタ登録で登録してください。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 追加登録（CSV一括） */}
            <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">追加登録（CSV一括）</p>
                  <p className="text-xs text-gray-500 mt-1">
                    変換時の警告に出た未登録者をテンプレートに取り込み、銀行情報を記入してアップロードしてください。
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-400 tracking-widest">未登録者</p>
                  <p className="text-lg font-bold text-gray-900">
                    {convertResult?.skippedCount ?? 0}件
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {(convertResult?.skippedCount ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadAddMasterTemplate}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    未登録者テンプレートをダウンロード
                  </button>
                )}

                <input
                  ref={addMasterInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) return;
                    void handleUploadAddMasterCsv(file);
                  }}
                />

                <button
                  type="button"
                  onClick={() => addMasterInputRef.current?.click()}
                  disabled={addMasterUploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {addMasterUploading ? 'アップロード中...' : '追加登録CSVを選択'}
                </button>
              </div>

              {addMasterResult && (
                <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">追加登録結果</p>
                    <p className="text-xs text-gray-500">
                      inserted: {addMasterResult.inserted} / updated: {addMasterResult.updated}
                    </p>
                  </div>
                  {addMasterResult.errors.length > 0 && (
                    <div className="mt-2 bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                      <p className="text-xs font-semibold text-yellow-900">エラー（不完全行はスキップ）</p>
                      <ul className="mt-2 text-xs text-yellow-900 list-disc pl-5 space-y-1">
                        {addMasterResult.errors.slice(0, 10).map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                      {addMasterResult.errors.length > 10 && (
                        <p className="text-xs text-yellow-900 mt-2">
                          さらに {addMasterResult.errors.length - 10} 件あります
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 1件手動追加 */}
              <div className="mt-4 border-2 border-gray-200 shadow-sm rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-gray-900">マスタ1件追加（手動）</h3>
                <p className="text-xs text-gray-500 mt-1">
                  銀行名・支店名は候補選択でコードを自動入力できます。候補が出ない場合は銀行コード・支店コードを直接入力してください。
                </p>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={manualForm.employee_no}
                    onChange={(e) => setManualForm(prev => ({ ...prev, employee_no: e.target.value }))}
                    placeholder="従業員番号"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={manualForm.employee_name}
                    onChange={(e) => setManualForm(prev => ({ ...prev, employee_name: e.target.value }))}
                    placeholder="従業員名"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />

                  <div className="relative">
                    <input
                      value={manualForm.bank_name}
                      onChange={(e) => {
                        setManualForm(prev => ({ ...prev, bank_name: e.target.value }));
                        setShowBankCandidates(true);
                      }}
                      onFocus={() => setShowBankCandidates(true)}
                      placeholder="銀行名"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    {showBankCandidates && bankCandidates.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-auto">
                        {bankCandidates.map((c) => (
                          <button
                            key={`${c.code}-${c.name}`}
                            type="button"
                            onClick={() => {
                              setManualForm(prev => ({
                                ...prev,
                                bank_name: c.name,
                                bank_code: trimLeadingZeros(c.code),
                                branch_name: '',
                                branch_code: '',
                              }));
                              setShowBankCandidates(false);
                              setBankCandidates([]);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {c.name} ({c.code})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    value={manualForm.bank_code}
                    onChange={(e) => setManualForm(prev => ({ ...prev, bank_code: e.target.value }))}
                    placeholder="銀行コード（候補で自動入力／手入力可）"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />

                  <div className="relative">
                    <input
                      value={manualForm.branch_name}
                      onChange={(e) => {
                        setManualForm(prev => ({ ...prev, branch_name: e.target.value }));
                        setShowBranchCandidates(true);
                      }}
                      onFocus={() => setShowBranchCandidates(true)}
                      placeholder={manualForm.bank_code ? '支店名' : '先に銀行を選択してください'}
                      disabled={!manualForm.bank_code}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {showBranchCandidates && branchCandidates.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-auto">
                        {branchCandidates.map((c) => (
                          <button
                            key={`${c.code}-${c.name}`}
                            type="button"
                            onClick={() => {
                              setManualForm(prev => ({
                                ...prev,
                                branch_name: c.name,
                                branch_code: trimLeadingZeros(c.code),
                              }));
                              setShowBranchCandidates(false);
                              setBranchCandidates([]);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {c.name} ({c.code})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    value={manualForm.branch_code}
                    onChange={(e) => setManualForm(prev => ({ ...prev, branch_code: e.target.value }))}
                    placeholder="支店コード（候補で自動入力／手入力可）"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />

                  <select
                    value={manualForm.account_type}
                    onChange={(e) => setManualForm(prev => ({ ...prev, account_type: e.target.value }))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="1">1=普通</option>
                    <option value="2">2=当座</option>
                  </select>

                  <input
                    value={manualForm.account_number}
                    onChange={(e) => setManualForm(prev => ({ ...prev, account_number: e.target.value }))}
                    placeholder="口座番号"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />

                  <input
                    value={manualForm.account_holder}
                    onChange={(e) => setManualForm(prev => ({ ...prev, account_holder: e.target.value }))}
                    placeholder="口座名義（カナ）"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm md:col-span-2"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleManualAdd}
                    disabled={manualSubmitting}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {manualSubmitting ? '登録中...' : '追加登録する'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* セクション3: 登録済みマスタ一覧 */}
          <section className="rounded-2xl border-2 border-gray-200 bg-white shadow-sm p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">登録済みマスタ一覧</h2>
              <p className="text-xs text-gray-500">件数: {masterLoading ? '...' : `${master.length}件`}</p>
            </div>

            {masterLoading ? (
              <div className="text-center text-gray-400 py-10">読み込み中...</div>
            ) : master.length === 0 ? (
              <div className="text-center text-gray-400 py-10">
                <p className="text-lg mb-2">マスタがありません</p>
                <p className="text-sm">上の「初回マスタ登録」から登録してください</p>
              </div>
            ) : (
              <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left">従業員番号</th>
                      <th className="px-3 py-2 text-left">従業員名</th>
                      <th className="px-3 py-2 text-left">銀行名</th>
                      <th className="px-3 py-2 text-left">支店コード</th>
                      <th className="px-3 py-2 text-left">口座番号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {master.map(row => (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{row.employee_no}</td>
                        <td className="px-3 py-2">{row.employee_name}</td>
                        <td className="px-3 py-2">{row.bank_name}</td>
                        <td className="px-3 py-2">{row.branch_code}</td>
                        <td className="px-3 py-2">{row.account_number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

