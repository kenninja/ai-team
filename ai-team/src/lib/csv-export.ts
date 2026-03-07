/**
 * MoneyForward債務支払い用CSV出力
 * invoice-appから移植
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Invoice = Record<string, any>;

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 簡易CSV
 */
export function generateSimpleCSV(invoices: Invoice[]): string {
  const BOM = '\uFEFF';
  const headers = ['取引日', '勘定科目', '補助科目', '金額', '税区分', '摘要', '取引先名'];
  const rows = invoices.map(inv => [
    escapeCSV(inv.invoice_date),
    escapeCSV(inv.account_title),
    escapeCSV(inv.sub_account),
    escapeCSV(inv.total_amount),
    escapeCSV(inv.tax_category),
    escapeCSV(inv.description),
    escapeCSV(inv.vendor_name),
  ].join(','));

  return BOM + [headers.join(','), ...rows].join('\n');
}

/**
 * マネーフォワード スポット支払形式CSV（41列）
 */
export function generateMFSpotCSV(invoices: Invoice[]): string {
  const BOM = '\uFEFF';
  const headers = [
    '行形式', '支払先', '支払先（表示名）', '支払先コード', '支払先部門名',
    '支払先敬称', '郵便番号', '都道府県', '市区町村', '番地',
    '建物名等', '電話番号', '銀行名', '支店名', '口座種別',
    '口座番号', '口座名義', '費用計上日', '支払期日', '支払方法',
    '品目', '経費科目', '税区分', '単価（税抜）', '数量',
    '金額（税抜）', '消費税額', '源泉徴収額', '費用負担部門', '貸方勘定科目',
    '貸方補助科目', 'メモ', 'タグ', 'セグメント1', 'セグメント2',
    'セグメント3', 'プロジェクト', '通貨', 'レート', '支払依頼メモ',
    '承認者（ログインメールアドレス）'
  ];

  const rows: string[] = [];
  for (const inv of invoices) {
    const taxExcluded = (inv.total_amount || 0) - (inv.tax_amount || 0);

    // 支払依頼行
    const paymentRow = new Array(41).fill('');
    paymentRow[0] = '支払依頼';
    paymentRow[1] = escapeCSV(inv.vendor_name);
    paymentRow[17] = escapeCSV(inv.invoice_date);
    paymentRow[18] = escapeCSV(inv.due_date);
    rows.push(paymentRow.join(','));

    // 明細行
    const detailRow = new Array(41).fill('');
    detailRow[0] = '明細';
    detailRow[20] = escapeCSV(inv.description);
    detailRow[21] = escapeCSV(inv.account_title);
    detailRow[22] = escapeCSV(inv.tax_category);
    detailRow[23] = escapeCSV(taxExcluded);
    detailRow[24] = '1';
    detailRow[25] = escapeCSV(taxExcluded);
    detailRow[26] = escapeCSV(inv.tax_amount);
    detailRow[28] = escapeCSV(inv.department);
    detailRow[30] = escapeCSV(inv.sub_account);
    detailRow[37] = 'JPY';
    detailRow[38] = '1';
    rows.push(detailRow.join(','));
  }

  return BOM + [headers.join(','), ...rows].join('\n');
}

/**
 * マネーフォワード 登録済み支払先形式CSV（36列）
 */
export function generateMFRegisteredCSV(invoices: Invoice[]): string {
  const BOM = '\uFEFF';
  const headers = [
    '行形式', '支払先', '費用計上日', '支払期日', '支払方法',
    '品目', '経費科目', '税区分', '単価（税抜）', '数量',
    '金額（税抜）', '消費税額', '源泉徴収額', '費用負担部門', '貸方勘定科目',
    '貸方補助科目', 'メモ', 'タグ', 'セグメント1', 'セグメント2',
    'セグメント3', 'プロジェクト', '通貨', 'レート', '支払依頼メモ',
    '承認者（ログインメールアドレス）', '支払先コード', '支払先部門名', '支払先敬称',
    '支払先（表示名）', '銀行名', '支店名', '口座種別', '口座番号',
    '口座名義', '電話番号'
  ];

  const rows: string[] = [];
  for (const inv of invoices) {
    const taxExcluded = (inv.total_amount || 0) - (inv.tax_amount || 0);

    // 支払依頼行
    const paymentRow = new Array(36).fill('');
    paymentRow[0] = '支払依頼';
    paymentRow[1] = escapeCSV(inv.vendor_name);
    paymentRow[2] = escapeCSV(inv.invoice_date);
    paymentRow[3] = escapeCSV(inv.due_date);
    rows.push(paymentRow.join(','));

    // 明細行
    const detailRow = new Array(36).fill('');
    detailRow[0] = '明細';
    detailRow[5] = escapeCSV(inv.description);
    detailRow[6] = escapeCSV(inv.account_title);
    detailRow[7] = escapeCSV(inv.tax_category);
    detailRow[8] = escapeCSV(taxExcluded);
    detailRow[9] = '1';
    detailRow[10] = escapeCSV(taxExcluded);
    detailRow[11] = escapeCSV(inv.tax_amount);
    detailRow[12] = '0';
    detailRow[13] = escapeCSV(inv.department);
    detailRow[15] = escapeCSV(inv.sub_account);
    detailRow[22] = 'JPY';
    detailRow[23] = '1';
    rows.push(detailRow.join(','));
  }

  return BOM + [headers.join(','), ...rows].join('\n');
}
