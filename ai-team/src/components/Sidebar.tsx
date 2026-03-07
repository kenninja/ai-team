'use client';

import Link from 'next/link';

interface SessionItem {
  id: string;
  teamId: string;
  title: string | null;
  createdAt: number;
}

interface SidebarProps {
  sessions: SessionItem[];
  currentSessionId?: string;
  onNewChat: () => void;
  onDelete?: (id: string) => void;
}

export default function Sidebar({ sessions, currentSessionId, onNewChat, onDelete }: SidebarProps) {
  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 新しいチャット
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {sessions.map((s) => (
          <div key={s.id} className="group relative">
            <Link
              href={`/chat/${s.id}`}
              className={`block px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                s.id === currentSessionId
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="truncate">{s.title || '新しいチャット'}</div>
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(s.createdAt)}</div>
            </Link>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(s.id);
                }}
                className="absolute right-2 top-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                title="削除"
              >
                &#10005;
              </button>
            )}
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">
            まだチャット履歴がありません
          </div>
        )}
      </div>
    </aside>
  );
}
