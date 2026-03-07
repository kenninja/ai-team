'use client';

import { useState } from 'react';

interface SlackMessage {
  message_ts: string;
  channel_id: string;
  channel_name: string;
  user_name: string;
  text: string;
  needs_reply: number;
  reply_urgency: string;
  reply_sent: number;
  task_created: number;
  mentioned_me: number;
  summary: string;
  processed_at: number;
}

interface SlackMessageListProps {
  messages: SlackMessage[];
  selectedKey?: string;
  onSelect: (channelId: string, messageTs: string) => void;
}

type FilterType = 'all' | 'mentioned' | 'unreplied' | 'replied' | 'task';
type SortType = 'newest' | 'urgency';

const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

export default function SlackMessageList({ messages, selectedKey, onSelect }: SlackMessageListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // フィルター
  const filtered = messages.filter((msg) => {
    switch (filter) {
      case 'mentioned':
        return msg.mentioned_me === 1;
      case 'unreplied':
        return msg.needs_reply === 1 && msg.reply_sent === 0;
      case 'replied':
        return msg.reply_sent === 1;
      case 'task':
        return msg.task_created === 1;
      default:
        return true;
    }
  });

  // ソート
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'urgency') {
      const ua = URGENCY_ORDER[a.reply_urgency] ?? 3;
      const ub = URGENCY_ORDER[b.reply_urgency] ?? 3;
      if (ua !== ub) return ua - ub;
    }
    return b.processed_at - a.processed_at;
  });

  const mentionedCount = messages.filter(m => m.mentioned_me === 1).length;
  const unrepliedCount = messages.filter(m => m.needs_reply === 1 && m.reply_sent === 0).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-gray-900">Slackメッセージ</h2>
          <span className="text-xs text-gray-400">{sorted.length}/{messages.length}件</span>
        </div>
        {/* フィルターボタン */}
        <div className="flex gap-1.5 flex-wrap mb-2">
          <button
            onClick={() => setFilter('all')}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              filter === 'all'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setFilter('mentioned')}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              filter === 'mentioned'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
            }`}
          >
            自分宛て {mentionedCount > 0 && `(${mentionedCount})`}
          </button>
          <button
            onClick={() => setFilter('unreplied')}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              filter === 'unreplied'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            未返信 {unrepliedCount > 0 && `(${unrepliedCount})`}
          </button>
          <button
            onClick={() => setFilter('replied')}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              filter === 'replied'
                ? 'bg-green-600 text-white'
                : 'bg-green-50 text-green-600 hover:bg-green-100'
            }`}
          >
            返信済
          </button>
          <button
            onClick={() => setFilter('task')}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              filter === 'task'
                ? 'bg-orange-600 text-white'
                : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
            }`}
          >
            タスク有
          </button>
        </div>
        {/* ソート */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setSort('newest')}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              sort === 'newest'
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            新しい順
          </button>
          <button
            onClick={() => setSort('urgency')}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              sort === 'urgency'
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            緊急度順
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.map((msg) => {
          const key = `${msg.channel_id}:${msg.message_ts}`;
          return (
            <button
              key={key}
              onClick={() => onSelect(msg.channel_id, msg.message_ts)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedKey === key ? 'bg-purple-50 border-l-2 border-l-purple-500' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-purple-600">#{msg.channel_name}</span>
                  {msg.mentioned_me === 1 && (
                    <span className="text-xs px-1 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">@自分</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{formatTime(msg.processed_at)}</span>
              </div>
              <div className="text-sm font-medium text-gray-900 mb-0.5">{msg.user_name}</div>
              <div className="text-xs text-gray-500 truncate mb-1.5">{msg.text}</div>
              <div className="flex gap-1.5 flex-wrap">
                {msg.needs_reply === 1 && msg.reply_sent === 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    msg.reply_urgency === 'high' ? 'bg-red-100 text-red-700' :
                    msg.reply_urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    要返信{msg.reply_urgency === 'high' ? '(急)' : msg.reply_urgency === 'medium' ? '(中)' : ''}
                  </span>
                )}
                {msg.reply_sent === 1 && (
                  <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">返信済</span>
                )}
                {msg.task_created === 1 && (
                  <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">タスク作成済</span>
                )}
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {filter === 'mentioned' ? '自分宛てメッセージはありません' :
             filter === 'unreplied' ? '未返信メッセージはありません' :
             filter === 'replied' ? '返信済メッセージはありません' :
             filter === 'task' ? 'タスク付きメッセージはありません' :
             'メッセージがありません'}
          </div>
        )}
      </div>
    </div>
  );
}
