'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import TeamSelector from '@/components/TeamSelector';

interface TeamInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  agents: { id: string; name: string; description: string; icon: string; color: string }[];
}

export default function Home() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<{ gmail: boolean; slack: boolean; calendar: boolean }>({
    gmail: false, slack: false, calendar: false,
  });

  useEffect(() => {
    fetch('/api/teams')
      .then((res) => res.json())
      .then((data) => {
        setTeams(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // 連携状態を取得
    Promise.all([
      fetch('/api/gmail/auth').then(r => r.json()).catch(() => ({ connected: false })),
      fetch('/api/slack/status').then(r => r.json()).catch(() => ({ connected: false })),
      fetch('/api/calendar/status').then(r => r.json()).catch(() => ({ connected: false })),
    ]).then(([gmail, slack, calendar]) => {
      setStatuses({
        gmail: gmail.connected,
        slack: slack.connected,
        calendar: calendar.connected,
      });
    });
  }, []);

  const handleReauth = async () => {
    const res = await fetch('/api/gmail/auth', { method: 'POST' });
    const data = await res.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    }
  };

  const handleSelectTeam = async (teamId: string) => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    });
    const session = await res.json();
    router.push(`/chat/${session.id}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">AI Team</h1>
            <p className="text-gray-600">
              チームを選んで、複数のAIエージェントに仕事を任せましょう
            </p>
          </div>
          {/* 連携状態 */}
          <div className="flex justify-center gap-3 mb-8">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              statuses.gmail ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${statuses.gmail ? 'bg-green-500' : 'bg-gray-300'}`} />
              Gmail
              {statuses.gmail && (
                <button
                  onClick={handleReauth}
                  className="ml-1 text-blue-500 hover:text-blue-700 text-[10px] underline"
                >
                  再認証
                </button>
              )}
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              statuses.slack ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${statuses.slack ? 'bg-green-500' : 'bg-gray-300'}`} />
              Slack
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              statuses.calendar ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${statuses.calendar ? 'bg-green-500' : 'bg-gray-300'}`} />
              Calendar
            </div>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">読み込み中...</div>
          ) : (
            <TeamSelector teams={teams} onSelect={handleSelectTeam} />
          )}
        </div>
      </main>
    </div>
  );
}
