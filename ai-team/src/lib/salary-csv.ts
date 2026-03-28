import iconv from 'iconv-lite';

export function decodeShiftJis(input: ArrayBuffer): string {
  return iconv.decode(Buffer.from(input), 'shift_jis');
}

export function encodeShiftJis(text: string): Uint8Array {
  return iconv.encode(text, 'shift_jis');
}

export const normalizeAccountNumber = (n: string) => {
  const t = n.trim();
  return t ? t.padStart(7, '0') : '';
};

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\r') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * CSV（簡易）パーサ: ダブルクォートで囲まれたカンマは区切らない。
 * ここでは給与・GMOの固定フォーマットを想定。
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // "" はエスケープされたダブルクォート
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

export type GmoMasterRow = {
  bank_code: string;
  branch_code: string;
  account_number: string;
  account_holder: string;
};

/**
 * GMO用CSV（ヘッダーなし）
 * 列: bank_code, branch_code, account_number, account_holder(カナ)
 */
export function parseGmoMasterCsv(text: string): Map<string, GmoMasterRow> {
  const map = new Map<string, GmoMasterRow>();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const cols = parseCsvLine(line);
    // GMO用CSV（ヘッダーなし / 8列）
    // col[0]: 銀行コード
    // col[1]: 支店コード
    // col[2]: 口座種別（1固定）
    // col[3]: 口座番号（キー）
    // col[4]: 口座名義（カナ）
    if (cols.length < 5) continue;

    const bank_code = cols[0] ?? '';
    const branch_code = cols[1] ?? '';
    const account_number = normalizeAccountNumber((cols[3] ?? '').replace(/\s+/g, ''));
    const account_holder = cols[4] ?? '';

    if (!account_number) continue;
    map.set(account_number, { bank_code, branch_code, account_number, account_holder });
  }

  return map;
}

export type MfSalaryRow = {
  employee_no: string;
  employee_name: string;
  bank_name: string;
  account_number: string;
  transfer_amount: string;
};

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    // 1) 完全一致
    const exactIdx = headers.indexOf(cand);
    if (exactIdx !== -1) return exactIdx;
  }

  // 2) 部分一致（列名揺れ対策: 例「振込先金融機関名」→「金融機関名」）
  for (const cand of candidates) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!cand || !h) continue;
      if (h.includes(cand) || cand.includes(h)) return i;
    }
  }

  return -1;
}

/**
 * MF FBデータCSV（ヘッダーあり）
 * ヘッダーの列名揺れに対応して候補から必要列を見つける。
 */
export function parseMfSalaryCsv(text: string): MfSalaryRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.trim());

  const employeeNoIdx = findHeaderIndex(headers, ['従業員番号', '社員番号', 'employee_no']);
  const employeeNameIdx = findHeaderIndex(headers, ['従業員名', '社員名', 'employee_name']);
  const bankNameIdx = findHeaderIndex(headers, ['振込先金融機関名', '銀行名', '金融機関名', 'bank_name']);
  const accountNumberIdx = findHeaderIndex(headers, ['口座番号', 'account_number']);
  const amountIdx = findHeaderIndex(headers, [
    '振込金額',
    '振込額',
    '金額',
    '支給額',
    '支払金額',
    'transfer_amount',
  ]);

  if ([employeeNoIdx, employeeNameIdx, bankNameIdx, accountNumberIdx, amountIdx].some(i => i === -1)) {
    throw new Error('MF CSVのヘッダーが見つかりません（列名を要確認）');
  }

  const rows: MfSalaryRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    const employee_no = (cols[employeeNoIdx] ?? '').trim();
    const employee_name = (cols[employeeNameIdx] ?? '').trim();
    const bank_name = (cols[bankNameIdx] ?? '').trim();
    const account_number = normalizeAccountNumber((cols[accountNumberIdx] ?? '').replace(/\s+/g, ''));
    const transfer_amount_raw = (cols[amountIdx] ?? '').trim();

    if (!employee_no || !account_number) continue;

    // 桁区切りカンマがあれば除去して、GMO側は文字列のまま出す
    const transfer_amount = transfer_amount_raw.replace(/,/g, '');

    rows.push({ employee_no, employee_name, bank_name, account_number, transfer_amount });
  }

  return rows;
}

