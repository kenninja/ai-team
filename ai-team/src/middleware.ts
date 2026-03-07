import { NextRequest, NextResponse } from 'next/server';

/**
 * APIルートへのリクエストを保護するミドルウェア
 * - CSRF対策: POSTリクエストのOriginヘッダーを検証
 * - 外部からのAPI呼び出しを遮断
 */
export function middleware(request: NextRequest) {
  // APIルートのPOST/PUT/DELETEリクエストのみ検証
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)
  ) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // ブラウザからのリクエストはOriginヘッダーが必ず付く
    // Originがない場合はサーバーサイド呼び出し（cron等）なので許可
    if (origin) {
      const allowedOrigin = `http://${host}`;
      if (origin !== allowedOrigin && origin !== `https://${host}`) {
        return NextResponse.json(
          { error: 'Forbidden: invalid origin' },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
