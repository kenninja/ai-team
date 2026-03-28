export type PropertyStatus =
  | 'candidate'
  | 'viewing'
  | 'applied'
  | 'contracted'
  | 'construction'
  | 'ready'
  | 'active'
  | 'dropped';

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  candidate: '🔍 候補',
  viewing: '👀 内覧済',
  applied: '📝 申込中',
  contracted: '✅ 契約済',
  construction: '🔨 工事中',
  ready: '🏃 準備中',
  active: '🎉 稼働',
  dropped: '❌ 見送り',
};

export const PHASE_KEYS = [
  { key: 'search', label: '物件検索', offset: -8 },
  { key: 'viewing', label: '内覧・申込', offset: -4 },
  { key: 'contract', label: '契約・入居', offset: -3 },
  { key: 'ninka_start', label: '認可申請着手', offset: -4 },
  { key: 'ninka_submit', label: '認可書類提出', offset: -2 },
  { key: 'ninka_get', label: '認可取得', offset: -1 },
  { key: 'construction', label: '内装工事完了', offset: -1 },
  { key: 'experience', label: '体験・集客', offset: -1 },
  { key: 'active', label: '稼働開始', offset: 0 },
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number]['key'];

export const NINKA_PHASE_KEYS = new Set<PhaseKey>(['ninka_start', 'ninka_submit', 'ninka_get']);

export interface OpeningProperty {
  id: number;
  property_name: string;
  area: string;
  target_open_month: string | null;
  rent: number | null;
  status: PropertyStatus;
  created_at: string;
  updated_at: string;
  phases?: OpeningPhase[];
  doc_progress?: { total: number; submitted: number };
}

export interface OpeningPhase {
  id: number;
  property_id: number;
  phase_key: PhaseKey;
  completed: boolean;
  scheduled_date: string | null;
  completed_date: string | null;
  memo: string | null;
}

export interface OpeningDocument {
  id: number;
  property_id: number;
  category: string;
  doc_name: string;
  is_required: boolean;
  submitted: boolean;
  deadline_offset: string | null;
  memo: string | null;
}

export function formatOpeningDocDeadline(offset: string | null): string {
  if (!offset) return '—';
  const m = offset.match(/^-(\d+)M$/);
  if (!m) return offset;
  return `開校 ${m[1]}ヶ月前目安`;
}
