import { NextRequest, NextResponse } from 'next/server';
import { normalizeAccountNumber, parseCsvLine } from '@/lib/salary-csv';
import { upsertEmployeeBankAccounts } from '@/lib/db';
import { toCompanyCode } from '@/lib/salary-companies';

function trimLeadingZeros(code: string): string {
  const t = code.trim();
  if (!t) return '';
  const normalized = t.replace(/^0+/, '');
  return normalized || '0';
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  const trimmed = headers.map(h => h.trim());
  for (const cand of candidates) {
    const idx = trimmed.indexOf(cand);
    if (idx !== -1) return idx;
  }
  // 部分一致（念のため）
  for (const cand of candidates) {
    if (!cand) continue;
    for (let i = 0; i < trimmed.length; i++) {
      const h = trimmed[i];
      if (!h) continue;
      if (h.includes(cand) || cand.includes(h)) return i;
    }
  }
  return -1;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const company = toCompanyCode(formData.get('company') as string | null);

  // 1件手動追加（fileなし）にも対応
  if (!file) {
    const employee_no = String(formData.get('employee_no') ?? '').trim();
    const employee_name = String(formData.get('employee_name') ?? '').trim();
    const bank_name = String(formData.get('bank_name') ?? '').trim();
    const bank_code = trimLeadingZeros(String(formData.get('bank_code') ?? ''));
    const branch_code = trimLeadingZeros(String(formData.get('branch_code') ?? ''));
    const account_type = String(formData.get('account_type') ?? '1').trim() || '1';
    const account_number = normalizeAccountNumber(String(formData.get('account_number') ?? '').trim());
    const account_holder = String(formData.get('account_holder') ?? '').trim();

    const errors: string[] = [];
    if (!employee_no) errors.push('従業員番号が空です');
    if (!employee_name) errors.push('従業員名が空です');
    if (!bank_name) errors.push('銀行名が空です');
    if (!bank_code) errors.push('銀行コードが空です');
    if (!branch_code) errors.push('支店コードが空です');
    if (!account_number) errors.push('口座番号が空です');
    if (!account_holder) errors.push('口座名義が空です');

    if (errors.length > 0) {
      return NextResponse.json({ inserted: 0, updated: 0, errors }, { status: 400 });
    }

    const { inserted, updated } = upsertEmployeeBankAccounts([{
      employee_no,
      employee_name,
      bank_name,
      bank_code,
      branch_code,
      account_type,
      account_number,
      account_holder,
    }], company);

    return NextResponse.json({ inserted, updated, errors: [] });
  }

  try {
    const buf = await file.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, ''); // BOM除去

    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) {
      return NextResponse.json({ inserted: 0, updated: 0, errors: ['CSVにデータがありません'] }, { status: 400 });
    }

    const headers = parseCsvLine(lines[0]).map(h => h.trim());

    const idxEmployeeNo = findHeaderIndex(headers, ['従業員番号', 'employee_no', '従業員番号 ']);
    const idxEmployeeName = findHeaderIndex(headers, ['従業員名', 'employee_name']);
    const idxBankName = findHeaderIndex(headers, ['銀行名', 'bank_name']);
    const idxBankCode = findHeaderIndex(headers, ['銀行コード', 'bank_code']);
    const idxBranchCode = findHeaderIndex(headers, ['支店コード', 'branch_code']);
    const idxAccountType = findHeaderIndex(headers, ['口座種別', 'account_type']);
    const idxAccountNumber = findHeaderIndex(headers, ['口座番号', 'account_number']);
    const idxAccountHolder = findHeaderIndex(headers, ['口座名義', 'account_holder']);

    const required = [
      ['従業員番号', idxEmployeeNo],
      ['従業員名', idxEmployeeName],
      ['銀行名', idxBankName],
      ['銀行コード', idxBankCode],
      ['支店コード', idxBranchCode],
      ['口座番号', idxAccountNumber],
      ['口座名義', idxAccountHolder],
    ] as const;

    const missingHeaders = required.filter(([, idx]) => idx === -1).map(([name]) => name);
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { inserted: 0, updated: 0, errors: [`ヘッダーが必要です: ${missingHeaders.join(', ')}`] },
        { status: 400 },
      );
    }

    if (idxAccountType === -1) {
      // 要件テンプレにはあるが、空カラムでも動くように default
      // （ただし後で値が必要になるので、見つからない場合は default='1' で扱う）
    }

    const accounts: Array<{
      employee_no: string;
      employee_name: string;
      bank_name: string;
      bank_code: string;
      branch_code: string;
      account_type: string;
      account_number: string;
      account_holder: string;
    }> = [];

    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);

      const employee_no = (row[idxEmployeeNo] ?? '').trim();
      const employee_name = (row[idxEmployeeName] ?? '').trim();
      const bank_name = (row[idxBankName] ?? '').trim();
      const bank_code = trimLeadingZeros(row[idxBankCode] ?? '');
      const branch_code = trimLeadingZeros(row[idxBranchCode] ?? '');
      const account_type_raw = idxAccountType !== -1 ? (row[idxAccountType] ?? '').trim() : '';
      const account_type = account_type_raw || '1';
      const account_number = normalizeAccountNumber((row[idxAccountNumber] ?? '').trim());
      const account_holder = (row[idxAccountHolder] ?? '').trim();

      const lineNo = i + 1; // ヘッダー込み

      if (!employee_no) errors.push(`${lineNo}行目: 従業員番号が空です`);
      if (!employee_name) errors.push(`${lineNo}行目: 従業員名が空です`);
      if (!bank_name) errors.push(`${lineNo}行目: 銀行名が空です`);
      if (!bank_code) errors.push(`${lineNo}行目: 銀行コードが空です`);
      if (!branch_code) errors.push(`${lineNo}行目: 支店コードが空です`);
      if (!account_number) errors.push(`${lineNo}行目: 口座番号が空です`);
      if (!account_holder) errors.push(`${lineNo}行目: 口座名義が空です`);

      if (
        !employee_no ||
        !employee_name ||
        !bank_name ||
        !bank_code ||
        !branch_code ||
        !account_number ||
        !account_holder
      ) {
        continue;
      }

      accounts.push({
        employee_no,
        employee_name,
        bank_name,
        bank_code,
        branch_code,
        account_type,
        account_number,
        account_holder,
      });
    }

    const { inserted, updated } = upsertEmployeeBankAccounts(accounts, company);

    return NextResponse.json({ inserted, updated, errors });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ inserted: 0, updated: 0, errors: [message] }, { status: 500 });
  }
}

