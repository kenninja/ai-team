import { NextRequest, NextResponse } from 'next/server';

type BankApiItem = {
  code: string;
  name: string;
  kana?: string;
  hira?: string;
  roma?: string;
};

type BankApiRawItem = {
  code?: unknown;
  name?: unknown;
  kana?: unknown;
  hira?: unknown;
  roma?: unknown;
  normalize?: {
    name?: unknown;
    kana?: unknown;
    hira?: unknown;
    roma?: unknown;
  } | unknown;
};

function toSafeList(input: unknown): BankApiItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((v): v is BankApiItem => !!v && typeof v === 'object')
    .map((v) => ({
      code: String(v.code ?? ''),
      name: String(v.name ?? ''),
      roma: typeof v.roma === 'string' ? v.roma : undefined,
    }))
    .filter(v => v.code !== '' && v.name !== '');
}

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLowerCase().trim();
}

function filterByName(items: unknown, keyword: string): unknown[] {
  if (!Array.isArray(items)) return [];
  const q = normalizeText(keyword);
  if (!q) return items;

  return (items as BankApiRawItem[]).filter((item) => {
    const n = item && typeof item === 'object' ? item : {};
    const rawNorm = n.normalize;
    const normObj =
      rawNorm && typeof rawNorm === 'object'
        ? (rawNorm as { name?: unknown; kana?: unknown; hira?: unknown; roma?: unknown })
        : null;
    const haystacks = [
      normalizeText(n.name),
      normalizeText(n.kana),
      normalizeText(n.hira),
      normalizeText(n.roma),
      normalizeText(normObj?.name),
      normalizeText(normObj?.kana),
      normalizeText(normObj?.hira),
      normalizeText(normObj?.roma),
    ];
    return haystacks.some(h => h.includes(q));
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const name = (searchParams.get('name') ?? '').trim();
  const bankCode = (searchParams.get('bankCode') ?? '').trim();

  if (!type || !name) return NextResponse.json([]);

  try {
    if (type === 'bank') {
      const url = `https://bank.teraren.com/banks.json?name=${encodeURIComponent(name)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return NextResponse.json([]);
      const data = await res.json();
      // 外部API側が name を厳密に絞り込まないため、サーバ側でも再フィルタする
      const filtered = filterByName(data, name);
      return NextResponse.json(toSafeList(filtered).slice(0, 5));
    }

    if (type === 'branch') {
      if (!bankCode) return NextResponse.json([]);
      const paddedBankCode = bankCode.padStart(4, '0');
      const base = `https://bank.teraren.com/banks/${encodeURIComponent(paddedBankCode)}/branches.json`;
      const matched: unknown[] = [];

      // page=1,2,... を順に取得（最大10ページ）
      for (let page = 1; page <= 10; page++) {
        const url = `${base}?page=${page}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) break;

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;

        const filtered = filterByName(data, name);
        if (filtered.length > 0) {
          matched.push(...filtered);
          if (matched.length >= 5) break;
        }
      }

      return NextResponse.json(toSafeList(matched).slice(0, 5));
    }

    return NextResponse.json([]);
  } catch {
    // 外部API障害でもUIを壊さない
    return NextResponse.json([]);
  }
}

