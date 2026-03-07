import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession, getMessages } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }
  const messages = getMessages(params.id);
  return NextResponse.json({ session, messages });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  deleteSession(params.id);
  return NextResponse.json({ success: true });
}
