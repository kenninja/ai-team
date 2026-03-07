'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import GmailConnect from '@/components/GmailConnect';
import EmailList from '@/components/EmailList';
import EmailDetail from '@/components/EmailDetail';

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
}

export default function MailPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [emailDetail, setEmailDetail] = useState<{
    email: { messageId: string; subject: string; from: string; fromEmail: string; date: string; bodyText: string; attachments: { filename: string; mimeType: string; size: number }[] } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processed: any;
  }>({ email: null, processed: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // メール一覧を取得
  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/emails');
      const data = await res.json();
      if (data.connected === false) {
        setConnected(false);
        return;
      }
      setConnected(true);

      // 処理済みメール情報を結合
      const processedRes = await fetch('/api/gmail/emails?q=in:inbox');
      const processedData = await processedRes.json();
      setEmails(processedData.emails || data.emails || []);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // メール詳細を取得
  const handleSelect = async (messageId: string) => {
    setSelectedId(messageId);
    try {
      const res = await fetch(`/api/gmail/emails/${messageId}`);
      const data = await res.json();
      setEmailDetail({ email: data.email, processed: data.processed });
    } catch {
      setEmailDetail({ email: null, processed: null });
    }
  };

  // 全件AI分析
  const handleProcessAll = async () => {
    const unprocessed = emails.filter(e => !e.isProcessed);
    if (unprocessed.length === 0) return;

    setIsProcessing(true);
    try {
      const res = await fetch('/api/gmail/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: unprocessed.map(e => e.messageId) }),
      });
      await res.json();

      // メール一覧を再取得
      await fetchEmails();

      // 選択中のメールの詳細も再取得
      if (selectedId) {
        await handleSelect(selectedId);
      }
    } catch (error) {
      console.error('Process error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // 返信送信
  const handleSendReply = async (messageId: string, text: string) => {
    setIsSending(true);
    try {
      await fetch('/api/gmail/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, replyText: text }),
      });

      // 詳細を再取得
      await handleSelect(messageId);
      await fetchEmails();
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
          <GmailConnect />
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* メール一覧 */}
        <div className="w-96 border-r border-gray-200 bg-white">
          <EmailList
            emails={emails}
            selectedId={selectedId}
            onSelect={handleSelect}
            onProcessAll={handleProcessAll}
            isProcessing={isProcessing}
          />
        </div>

        {/* メール詳細 */}
        <EmailDetail
          email={emailDetail.email}
          processed={emailDetail.processed}
          onSendReply={handleSendReply}
          isSending={isSending}
        />
      </div>
    </div>
  );
}
