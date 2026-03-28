import { NextRequest, NextResponse } from 'next/server';
import { decodeShiftJis, normalizeAccountNumber, parseGmoMasterCsv, parseMfSalaryCsv } from '@/lib/salary-csv';
import { insertEmployeeBankAccounts } from '@/lib/db';
import { toCompanyCode } from '@/lib/salary-companies';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const gmoFile = formData.get('gmoFile') as File | null;
  const mfFile = formData.get('mfFile') as File | null;
  const company = toCompanyCode(formData.get('company') as string | null);

  if (!gmoFile || !mfFile) {
    return NextResponse.json({ error: 'gmoFile と mfFile が必要です' }, { status: 400 });
  }

  try {
    const gmoText = decodeShiftJis(await gmoFile.arrayBuffer());
    const mfText = decodeShiftJis(await mfFile.arrayBuffer());

    const gmoMap = parseGmoMasterCsv(gmoText);
    const mfRows = parseMfSalaryCsv(mfText);

    if (mfRows.length === 0) {
      return NextResponse.json({ error: 'MF CSVに行がありません' }, { status: 400 });
    }

    // account_number をキーに重複排除（MF側の重複行対策）
    const accountsByAccountNumber = new Map<string, Parameters<typeof insertEmployeeBankAccounts>[0][number]>();
    let missingGmo = 0;

    for (const row of mfRows) {
      const accountNumber = normalizeAccountNumber(row.account_number);
      const gmo = gmoMap.get(accountNumber);
      if (!gmo) {
        missingGmo++;
        continue;
      }

      accountsByAccountNumber.set(accountNumber, {
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        bank_name: row.bank_name,
        bank_code: gmo.bank_code,
        branch_code: gmo.branch_code,
        account_type: '1',
        account_number: accountNumber,
        account_holder: gmo.account_holder,
      });
    }

    const accounts = Array.from(accountsByAccountNumber.values());
    const matchedUniqueCount = accounts.length;

    const { inserted } = insertEmployeeBankAccounts(accounts, company);
    const duplicatesSkipped = matchedUniqueCount - inserted;

    return NextResponse.json({
      inserted,
      duplicatesSkipped,
      matchedUniqueCount,
      missingGmo,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

