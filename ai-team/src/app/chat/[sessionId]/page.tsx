'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ChatPanel from '@/components/ChatPanel';
import InputBar from '@/components/InputBar';
import AgentStatus from '@/components/AgentStatus';
import { SSEEvent } from '@/agents/types';

interface DisplayMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  agentIcon?: string;
  agentColor?: string;
  content: string;
  isStreaming?: boolean;
}

interface SessionItem {
  id: string;
  teamId: string;
  title: string | null;
  createdAt: number;
}

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

interface TeamInfo {
  id: string;
  name: string;
  agents: AgentInfo[];
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [completedAgentIds, setCompletedAgentIds] = useState<string[]>([]);
  const [planSummary, setPlanSummary] = useState<string | undefined>();

  // セッション情報とメッセージ履歴を読み込み
  useEffect(() => {
    const loadSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          router.push('/');
          return;
        }
        const data = await res.json();

        // チーム情報を取得
        const teamsRes = await fetch('/api/teams');
        const teams = await teamsRes.json();
        const team = teams.find((t: TeamInfo) => t.id === data.session.teamId);
        setTeamInfo(team || null);

        // メッセージを復元
        const restored: DisplayMessage[] = data.messages.map((m: {
          id: string; role: string; agent_id?: string; agentId?: string;
          agent_name?: string; agentName?: string; content: string;
        }) => {
          const agentId = m.agentId || m.agent_id;
          const agentName = m.agentName || m.agent_name;
          const agent = team?.agents.find((a: AgentInfo) => a.id === agentId);
          return {
            id: m.id,
            role: m.role as DisplayMessage['role'],
            agentId,
            agentName,
            agentIcon: agent?.icon,
            agentColor: agent?.color,
            content: m.content,
          };
        });
        setMessages(restored);
      } catch {
        router.push('/');
      }
    };
    loadSession();
  }, [sessionId, router]);

  // セッション一覧を読み込み
  useEffect(() => {
    fetch('/api/sessions')
      .then((res) => res.json())
      .then(setSessions)
      .catch(() => {});
  }, [messages]);

  const handleSend = useCallback(async (message: string) => {
    if (isProcessing || !teamInfo) return;
    setIsProcessing(true);
    setActiveAgentId(undefined);
    setCompletedAgentIds([]);
    setPlanSummary(undefined);

    // ユーザーメッセージをUIに追加
    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });

      if (!res.ok || !res.body) {
        throw new Error('チャットAPIの呼び出しに失敗しました');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // ストリーミング中のエージェントメッセージを管理
      let currentStreamingId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event: SSEEvent = JSON.parse(jsonStr);

            switch (event.type) {
              case 'plan':
                if (event.plan) {
                  setPlanSummary(event.plan.summary);
                }
                break;

              case 'agent_start': {
                setActiveAgentId(event.agentId);
                const agent = teamInfo.agents.find((a) => a.id === event.agentId);
                currentStreamingId = `agent-${event.agentId}-${Date.now()}`;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: currentStreamingId!,
                    role: 'agent',
                    agentId: event.agentId,
                    agentName: event.agentName,
                    agentIcon: agent?.icon,
                    agentColor: agent?.color,
                    content: '',
                    isStreaming: true,
                  },
                ]);
                break;
              }

              case 'agent_chunk': {
                if (currentStreamingId && event.content) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentStreamingId
                        ? { ...m, content: m.content + event.content }
                        : m
                    )
                  );
                }
                break;
              }

              case 'agent_end': {
                if (currentStreamingId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentStreamingId
                        ? { ...m, isStreaming: false }
                        : m
                    )
                  );
                }
                if (event.agentId) {
                  setCompletedAgentIds((prev) => [...prev, event.agentId!]);
                }
                setActiveAgentId(undefined);
                currentStreamingId = null;
                break;
              }

              case 'done':
                setIsProcessing(false);
                setActiveAgentId(undefined);
                break;

              case 'error':
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `error-${Date.now()}`,
                    role: 'system',
                    content: `エラー: ${event.content || '不明なエラー'}`,
                    agentName: 'System',
                    agentIcon: '⚠️',
                    agentColor: 'red',
                  },
                ]);
                setIsProcessing(false);
                break;
            }
          } catch {
            // JSONパースエラーは無視
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `エラー: ${error instanceof Error ? error.message : '通信エラー'}`,
          agentName: 'System',
          agentIcon: '⚠️',
          agentColor: 'red',
        },
      ]);
    } finally {
      setIsProcessing(false);
      setActiveAgentId(undefined);
    }
  }, [isProcessing, teamInfo, sessionId]);

  const handleNewChat = async () => {
    if (!teamInfo) return;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: teamInfo.id }),
    });
    const session = await res.json();
    router.push(`/chat/${session.id}`);
  };

  const handleDeleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === sessionId) {
      router.push('/');
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <Header />
      {teamInfo && (
        <AgentStatus
          agents={teamInfo.agents}
          activeAgentId={activeAgentId}
          completedAgentIds={completedAgentIds}
        />
      )}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          sessions={sessions}
          currentSessionId={sessionId}
          onNewChat={handleNewChat}
          onDelete={handleDeleteSession}
        />
        <div className="flex-1 flex flex-col">
          <ChatPanel messages={messages} planSummary={planSummary} />
          <InputBar
            onSend={handleSend}
            disabled={isProcessing}
            placeholder={isProcessing ? 'エージェントが処理中...' : 'メッセージを入力...'}
          />
        </div>
      </div>
    </div>
  );
}
