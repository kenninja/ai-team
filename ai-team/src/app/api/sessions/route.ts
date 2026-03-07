import { NextRequest, NextResponse } from 'next/server';
import { createSession, listSessions } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId') || undefined;
  const sessions = listSessions(teamId);
  return NextResponse.json(sessions);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { teamId } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamIdが必要です' }, { status: 400 });
  }

  const id = uuidv4();
  const session = createSession(id, teamId);
  return NextResponse.json(session);
}
