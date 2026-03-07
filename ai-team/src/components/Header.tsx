'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <h1 className="text-xl font-bold text-gray-900">AI Team</h1>
        </Link>
        <nav className="flex gap-4">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === '/'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            ホーム
          </Link>
          <Link
            href="/mail"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname?.startsWith('/mail')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            メール
          </Link>
          <Link
            href="/slack"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname?.startsWith('/slack')
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Slack
          </Link>
          <Link
            href="/mail/invoices"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === '/mail/invoices'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            請求書
          </Link>
          <Link
            href="/history"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === '/history'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            履歴
          </Link>
        </nav>
      </div>
    </header>
  );
}
