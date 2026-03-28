import { NextRequest, NextResponse } from 'next/server';
import {
  getOpeningPropertyMeta,
  listOpeningDocumentsForProperty,
  updateOpeningDocument,
} from '@/lib/db';
import type { OpeningDocument } from '@/types/opening';

function mapRowToDoc(row: {
  id: number;
  property_id: number;
  category: string;
  doc_name: string;
  is_required: number;
  submitted: number;
  deadline_offset: string | null;
  memo: string | null;
}): OpeningDocument {
  return {
    id: row.id,
    property_id: row.property_id,
    category: row.category,
    doc_name: row.doc_name,
    is_required: row.is_required === 1,
    submitted: row.submitted === 1,
    deadline_offset: row.deadline_offset,
    memo: row.memo,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const propertyId = Number(params.id);
    if (!Number.isFinite(propertyId) || propertyId < 1) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 });
    }

    const property = getOpeningPropertyMeta(propertyId);
    if (!property) {
      return NextResponse.json({ error: '物件が見つかりません' }, { status: 404 });
    }

    const rows = listOpeningDocumentsForProperty(propertyId);
    const documents = rows.map(mapRowToDoc);

    return NextResponse.json({ property, documents });
  } catch (e) {
    console.error('[opening documents GET]', e);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

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
    const { document_id, submitted, memo } = body as {
      document_id?: number;
      submitted?: boolean;
      memo?: string | null;
    };

    if (!document_id || !Number.isFinite(document_id)) {
      return NextResponse.json({ error: 'document_id が必要です' }, { status: 400 });
    }
    if (typeof submitted !== 'boolean') {
      return NextResponse.json({ error: 'submitted は boolean です' }, { status: 400 });
    }

    const hasMemo = Object.prototype.hasOwnProperty.call(body, 'memo');
    const ok = updateOpeningDocument(propertyId, document_id, {
      submitted,
      ...(hasMemo ? { memo: memo ?? null } : {}),
    });

    if (!ok) {
      return NextResponse.json({ error: '書類が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[opening documents PATCH]', e);
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
  }
}
