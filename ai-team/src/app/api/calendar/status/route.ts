import { NextResponse } from 'next/server';
import { isCalendarConnected } from '@/lib/google-calendar';

export async function GET() {
  return NextResponse.json({ connected: isCalendarConnected() });
}
