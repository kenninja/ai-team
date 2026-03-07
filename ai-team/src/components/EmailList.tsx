'use client';

interface EmailItem {
  messageId: string;
  subject: string;
  from: string;
  fromEmail: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
  isUnread: boolean;
  isProcessed: boolean;
  // AI分析結果（処理済みの場合）
  needsReply?: boolean;
  replyUrgency?: string;
  hasInvoice?: boolean;
  summary?: string;
  replySent?: boolean;
}

interface EmailListProps {
  emails: EmailItem[];
  selectedId?: string;
  onSelect: (messageId: string) => void;
  onProcessAll: () => void;
  isProcessing: boolean;
}

export default function EmailList({ emails, selectedId, onSelect, onProcessAll, isProcessing }: EmailListProps) {
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return dateStr;
    }
  };

  const unprocessedCount = emails.filter(e => !e.isProcessed).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-bold text-gray-900">受信メール</h2>
        <button
          onClick={onProcessAll}
          disabled={isProcessing || unprocessedCount === 0}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? 'AI分析中...' : `AI分析 (${unprocessedCount}件)`}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {emails.map((email) => (
          <button
            key={email.messageId}
            onClick={() => onSelect(email.messageId)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
              selectedId === email.messageId ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
            } ${email.isUnread ? 'bg-white' : 'bg-gray-50/50'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm truncate ${email.isUnread ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                {email.from}
              </span>
              <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(email.date)}</span>
            </div>
            <div className={`text-sm truncate mb-1 ${email.isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
              {email.subject}
            </div>
            <div className="text-xs text-gray-400 truncate mb-1.5">{email.snippet}</div>
            <div className="flex gap-1.5 flex-wrap">
              {email.hasAttachments && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">📎 添付</span>
              )}
              {email.isProcessed && email.needsReply && !email.replySent && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  email.replyUrgency === 'high' ? 'bg-red-100 text-red-700' :
                  email.replyUrgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  要返信
                </span>
              )}
              {email.isProcessed && email.replySent && (
                <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">返信済</span>
              )}
              {email.isProcessed && email.hasInvoice && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">請求書</span>
              )}
              {email.isProcessed && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">AI済</span>
              )}
            </div>
          </button>
        ))}
        {emails.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            メールがありません
          </div>
        )}
      </div>
    </div>
  );
}
