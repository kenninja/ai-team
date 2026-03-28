import { NextRequest, NextResponse } from 'next/server';
import { decodeShiftJis, encodeShiftJis, escapeCsvCell, normalizeAccountNumber, parseMfSalaryCsv } from '@/lib/salary-csv';
import { getEmployeeBankAccountsByAccountNumbers } from '@/lib/db';
import { toCompanyCode } from '@/lib/salary-companies';

const PAYEE_NAME_FIXED = 'ｶ)ｺﾞ-ﾄｳ-ｽｸ-ﾙ';
const FIXED_X = 'X';

function makeGmoFilename(date: Date): string {
  const ymd = date.toISOString().split('T')[0].replace(/-/g, '');
  return `GMO 振込_${ymd}.csv`;
}

function toBase64(bytes: Uint8Array): string {
  // Next.js（Node）側なので Buffer が使える
  return Buffer.from(bytes).toString('base64');
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const mfFile = formData.get('mfFile') as File | null;
  const company = toCompanyCode(formData.get('company') as string | null);
  if (!mfFile) return NextResponse.json({ error: 'mfFile が必要です' }, { status: 400 });

  try {
    const mfText = decodeShiftJis(await mfFile.arrayBuffer());
    const mfRows = parseMfSalaryCsv(mfText);

    if (mfRows.length === 0) {
      return NextResponse.json({ error: 'MF CSVに行がありません' }, { status: 400 });
    }

    const accountNumbers = Array.from(new Set(mfRows.map(r => normalizeAccountNumber(r.account_number)).filter(Boolean)));
    const masters = getEmployeeBankAccountsByAccountNumbers(accountNumbers, company);
    const masterMap = new Map(masters.map(m => [m.account_number, m]));

    const csvLines: string[] = [];
    const skipped: Array<{ employee_no: string; employee_name: string; account_number: string }> = [];

    for (const row of mfRows) {
      const accountNumber = normalizeAccountNumber(row.account_number);
      const master = masterMap.get(accountNumber);
      if (!master) {
        skipped.push({
          employee_no: row.employee_no,
          employee_name: row.employee_name,
          account_number: accountNumber,
        });
        continue;
      }

      // GMO用CSV（ヘッダーなし / 8列）
      const cols = [
        master.bank_code, // col0: 銀行コード
        master.branch_code, // col1: 支店コード
        master.account_type || '1', // col2: 口座種別（固定 1）
        accountNumber, // col3: 口座番号
        master.account_holder, // col4: 口座名義（カナ）
        row.transfer_amount, // col5: 振込金額
        PAYEE_NAME_FIXED, // col6: ｶ)ｺﾞ-ﾄｳ-ｽｸ-ﾙ
        FIXED_X, // col7: X
      ].map(c => escapeCsvCell(c));

      csvLines.push(cols.join(','));
    }

    const convertedCount = csvLines.length;
    const skippedCount = skipped.length;

    const filename = makeGmoFilename(new Date());
    const csv = csvLines.join('\r\n'); // GMO側都合のため改行はCRLF
    const bytes = encodeShiftJis(csv);

    return NextResponse.json({
      filename,
      csvBase64: toBase64(bytes),
      convertedCount,
      skippedCount,
      skipped,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

