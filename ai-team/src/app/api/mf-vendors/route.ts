import { NextResponse } from 'next/server';
import { getMFVendorCount } from '@/lib/db';

export async function GET() {
  return NextResponse.json({ count: getMFVendorCount() });
}
