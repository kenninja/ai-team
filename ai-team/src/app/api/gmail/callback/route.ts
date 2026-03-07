import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/gmail-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/mail?error=no_code', request.url));
  }

  try {
    await handleCallback(code);
    return NextResponse.redirect(new URL('/mail?connected=true', request.url));
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    return NextResponse.redirect(new URL('/mail?error=auth_failed', request.url));
  }
}
