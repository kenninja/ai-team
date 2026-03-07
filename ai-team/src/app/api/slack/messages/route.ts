import { NextResponse } from 'next/server';
import { getSlackMessages } from '@/lib/db';
import { isSlackConnected } from '@/lib/slack';

export async function GET() {
  const connected = isSlackConnected();
  const messages = getSlackMessages();
  return NextResponse.json({ connected, messages });
}
