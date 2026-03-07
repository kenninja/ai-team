'use client';

import { useState } from 'react';

interface ProcessedInfo {
  needs_reply: number;
  reply_urgency: string;
  reply_draft: string;
  reply_sent: number;
  has_invoice: number;
  invoice_id: number | null;
  summary: string;
}

interface EmailDetailProps {
  email: {
    messageId: string;
    subject: string;
    from: string;
    fromEmail: string;
    date: string;
    bodyText: string;
    attachments: { filename: string; mimeType: string; size: number }[];
  } | null;
  processed: ProcessedInfo | null;
  onSendReply: (messageId: string, text: string) => Promise<void>;
  isSending: boolean;
}

export default function EmailDetail({ email, processed, onSendReply, isSending }: EmailDetailProps) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <span className="text-4xl block mb-3">📬</span>
          <p>メールを選択してください</p>
        </div>
      </div>
    );
  }

  // 送信ボタン → 確認ダイアログを表示
  const handleSendClick = () => {
    if (!replyText.trim()) return;
    setShowConfirm(true);
  };

  // 確認後に実際に送信
  const handleConfirmSend = async () => {
    setShowConfirm(false);
    await onSendReply(email.messageId, replyText);
    setReplyText('');
    setShowReply(false);
  };

  // 処理済みの場合、AIドラフトをセット
  const handleStartReply = () => {
    if (processed?.reply_draft && !replyText) {
      setReplyText(processed.reply_draft);
    }
    setShowReply(true);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-bold text-gray-900 mb-2">{email.subject}</h2>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-700">{email.from}</span>
            <span className="text-sm text-gray-400 ml-2">&lt;{email.fromEmail}&gt;</span>
          </div>
          <span className="text-xs text-gray-400">{email.date}</span>
        </div>
        {email.attachments.length > 0 && (
          <div className="flex gap-2 mt-2">
            {email.attachments.map((att, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                📎 {att.filename}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI分析結果 */}
      {processed && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <div className="text-xs font-medium text-blue-700 mb-1">🤖 AI分析結果</div>
          <p className="text-sm text-blue-600">{processed.summary}</p>
          <div className="flex gap-2 mt-2">
            {processed.needs_reply === 1 && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                processed.reply_urgency === 'high' ? 'bg-red-100 text-red-700' :
                processed.reply_urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                要返信（{processed.reply_urgency === 'high' ? '緊急' : processed.reply_urgency === 'medium' ? '中' : '低'}）
              </span>
            )}
            {processed.has_invoice === 1 && (
              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                請求書検出 {processed.invoice_id ? `(ID: ${processed.invoice_id})` : ''}
              </span>
            )}
            {processed.reply_sent === 1 && (
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">返信送信済み</span>
            )}
          </div>
        </div>
      )}

      {/* 本文 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {email.bodyText || '(テキスト本文なし)'}
        </div>
      </div>

      {/* 返信エリア */}
      <div className="border-t border-gray-200 bg-white px-6 py-3">
        {!showReply ? (
          <div className="flex gap-2">
            <button
              onClick={handleStartReply}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              {processed?.reply_draft ? '📝 AIドラフトで返信' : '返信'}
            </button>
            {processed?.has_invoice === 1 && processed?.invoice_id && (
              <a
                href="/mail/invoices"
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
              >
                📄 請求書を確認
              </a>
            )}
          </div>
        ) : (
          <div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-2"
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
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
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
                  {email.from} &lt;{email.fromEmail}&gt;
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">件名</div>
                <div className="text-sm text-gray-900">Re: {email.subject}</div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">本文</div>
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
