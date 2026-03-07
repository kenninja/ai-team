'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import SlackConnect from '@/components/SlackConnect';
import SlackMessageList from '@/components/SlackMessageList';
import SlackMessageDetail from '@/components/SlackMessageDetail';

interface SlackMessage {
  message_ts: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  text: string;
  thread_ts: string | null;
  needs_reply: number;
  reply_urgency: string;
  reply_draft: string | null;
  reply_sent: number;
  summary: string;
  task_created: number;
  processed_at: number;
}

export default function SlackPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [selectedMessage, setSelectedMessage] = useState<SlackMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/slack/messages');
      const data = await res.json();
      setConnected(data.connected);
      setMessages(data.messages || []);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    // 30秒ごとに自動更新
    const interval = setInterval(fetchMessages, 30000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSelect = async (channelId: string, messageTs: string) => {
    const key = `${channelId}:${messageTs}`;
    setSelectedKey(key);
    try {
      const res = await fetch(`/api/slack/messages/${channelId}/${messageTs}`);
      const data = await res.json();
      setSelectedMessage(data.message);
    } catch {
      setSelectedMessage(null);
    }
  };

  const handleSendReply = async (channelId: string, messageTs: string, text: string, threadTs?: string) => {
    setIsSending(true);
    try {
      await fetch('/api/slack/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, messageTs, replyText: text, threadTs }),
      });
      await handleSelect(channelId, messageTs);
      await fetchMessages();
    } catch (error) {
      console.error('Reply error:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-gray-400">読み込み中...</div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <main className="flex-1 p-8">
          <SlackConnect />
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-96 border-r border-gray-200 bg-white">
          <SlackMessageList
            messages={messages}
            selectedKey={selectedKey}
            onSelect={handleSelect}
          />
        </div>
        <SlackMessageDetail
          message={selectedMessage}
          onSendReply={handleSendReply}
          isSending={isSending}
        />
      </div>
    </div>
  );
}
