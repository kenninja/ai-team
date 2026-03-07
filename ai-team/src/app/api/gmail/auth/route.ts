import { NextResponse } from 'next/server';
import { getAuthUrl, isGmailConnected } from '@/lib/gmail-auth';
import { deleteGmailToken } from '@/lib/db';

export async function GET() {
  // 既に接続済みかチェック
  if (isGmailConnected()) {
    return NextResponse.json({ connected: true });
  }

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}

/**
 * POST: トークンを削除して再認証URLを返す（スコープ変更時に使用）
 */
export async function POST() {
  deleteGmailToken();
  const url = getAuthUrl();
  return NextResponse.json({ authUrl: url });
}
