import { NextRequest, NextResponse } from 'next/server';
import { updateOpeningPhaseCompleted } from '@/lib/db';
import { PHASE_KEYS, type PhaseKey } from '@/types/opening';

const ALLOWED_KEYS = new Set<string>(PHASE_KEYS.map((p) => p.key));

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const propertyId = Number(params.id);
    if (!Number.isFinite(propertyId) || propertyId < 1) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 });
    }

    const body = await req.json();
    const { phase_key, completed } = body as { phase_key?: string; completed?: boolean };

    if (!phase_key || !ALLOWED_KEYS.has(phase_key)) {
      return NextResponse.json({ error: '無効なフェーズです' }, { status: 400 });
    }
    if (typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'completed は boolean です' }, { status: 400 });
    }

    updateOpeningPhaseCompleted(propertyId, phase_key as PhaseKey, completed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[opening phase PATCH]', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
