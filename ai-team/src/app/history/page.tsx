'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

interface SessionItem {
  id: string;
  teamId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

const TEAM_ICONS: Record<string, string> = {
  business: '💼',
};

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions')
      .then((res) => res.json())
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">チャット履歴</h1>
          {loading ? (
            <div className="text-center text-gray-400 py-12">読み込み中...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="text-lg mb-2">まだ履歴がありません</p>
              <button
                onClick={() => router.push('/')}
                className="text-blue-600 hover:underline text-sm"
              >
                チームを選んでチャットを始める
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:border-gray-300 transition-colors"
                >
                  <button
                    onClick={() => router.push(`/chat/${s.id}`)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span>{TEAM_ICONS[s.teamId] || '🤖'}</span>
                      <span className="font-medium text-gray-900">
                        {s.title || '新しいチャット'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 ml-7">
                      {formatDate(s.createdAt)}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="text-gray-400 hover:text-red-500 text-sm px-2 py-1 transition-colors"
                    title="削除"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
