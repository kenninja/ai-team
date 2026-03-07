import { NextResponse } from 'next/server';
import { isSlackConnected } from '@/lib/slack';

export async function GET() {
  return NextResponse.json({ connected: isSlackConnected() });
}
