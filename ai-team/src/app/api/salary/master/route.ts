import { NextRequest, NextResponse } from 'next/server';
import { getAllEmployeeBankAccounts } from '@/lib/db';
import { toCompanyCode } from '@/lib/salary-companies';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const company = toCompanyCode(url.searchParams.get('company'));
  const rows = getAllEmployeeBankAccounts(company);

  return NextResponse.json({
    count: rows.length,
    records: rows.map(r => ({
      id: r.id,
      employee_no: r.employee_no,
      employee_name: r.employee_name,
      bank_name: r.bank_name,
      branch_code: r.branch_code,
      account_number: r.account_number,
    })),
  });
}

