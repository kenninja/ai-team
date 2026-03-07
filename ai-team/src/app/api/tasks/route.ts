import { NextResponse } from 'next/server';
import { getAutoTasks } from '@/lib/db';

export async function GET() {
  const tasks = getAutoTasks();
  return NextResponse.json({ tasks });
}
