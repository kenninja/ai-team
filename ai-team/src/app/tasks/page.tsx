'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';

export default function TasksPage() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    fetch('/task-manager.html')
      .then(r => r.text())
      .then(setHtml)
      .catch(() => setHtml(null));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div style={{ flex: 1, width: '100%' }}>
        {html ? (
          <iframe
            srcDoc={html}
            style={{ width: '100%', height: 'calc(100vh - 53px)', border: 'none' }}
            title="タスク管理"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            読み込み中...
          </div>
        )}
      </div>
    </div>
  );
}
