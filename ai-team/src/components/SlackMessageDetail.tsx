'use client';

import { useState } from 'react';

interface SlackMessageInfo {
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

interface SlackMessageDetailProps {
  message: SlackMessageInfo | null;
  onSendReply: (channelId: string, messageTs: string, text: string, threadTs?: string) => Promise<void>;
  isSending: boolean;
}

export default function SlackMessageDetail({ message, onSendReply, isSending }: SlackMessageDetailProps) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <span className="text-4xl block mb-3">💬</span>
          <p>メッセージを選択してください</p>
        </div>
      </div>
    );
  }

  const handleSendClick = () => {
    if (!replyText.trim()) return;
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirm(false);
    await onSendReply(
      message.channel_id,
      message.message_ts,
      replyText,
      message.thread_ts || undefined
    );
    setReplyText('');
    setShowReply(false);
  };

  const handleStartReply = () => {
    if (message.reply_draft && !replyText) {
      setReplyText(message.reply_draft);
    }
    setShowReply(true);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-purple-600">#{message.channel_name}</span>
            <span className="text-sm font-bold text-gray-900">{message.user_name}</span>
          </div>
          <span className="text-xs text-gray-400">{formatTime(message.processed_at)}</span>
        </div>
      </div>

      {/* AI分析結果 */}
      {message.summary && (
        <div className="px-6 py-3 bg-purple-50 border-b border-purple-100">
          <div className="text-xs font-medium text-purple-700 mb-1">AI分析結果</div>
          <p className="text-sm text-purple-600">{message.summary}</p>
          <div className="flex gap-2 mt-2">
            {message.needs_reply === 1 && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                message.reply_urgency === 'high' ? 'bg-red-100 text-red-700' :
                message.reply_urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                要返信（{message.reply_urgency === 'high' ? '緊急' : message.reply_urgency === 'medium' ? '中' : '低'}）
              </span>
            )}
            {message.reply_sent === 1 && (
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">返信送信済み</span>
            )}
            {message.task_created === 1 && (
              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">タスク作成済</span>
            )}
          </div>
        </div>
      )}

      {/* 本文 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {message.text}
        </div>
      </div>

      {/* 返信エリア */}
      <div className="border-t border-gray-200 bg-white px-6 py-3">
        {!showReply ? (
          <button
            onClick={handleStartReply}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
          >
            {message.reply_draft ? 'AIドラフトで返信' : '返信'}
          </button>
        ) : (
          <div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none mb-2"
              placeholder="返信内容を入力..."
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowReply(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSendClick}
                disabled={isSending || !replyText.trim()}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? '送信中...' : '送信確認'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 送信確認ダイアログ */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">送信内容の確認</h3>

            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">送信先</div>
                <div className="text-sm font-medium text-gray-900">
                  #{message.channel_name}（{message.thread_ts ? 'スレッド返信' : 'チャンネル返信'}）
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">元メッセージ（{message.user_name}）</div>
                <div className="text-sm text-gray-500 truncate">{message.text}</div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">返信内容</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {replyText}
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
              >
                戻って編集
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={isSending}
                className="px-6 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition-colors"
              >
                {isSending ? '送信中...' : 'この内容で送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
