'use client';

import { useEffect, useRef } from 'react';
import AgentMessage from './AgentMessage';

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

interface ChatPanelProps {
  messages: DisplayMessage[];
  planSummary?: string;
}

export default function ChatPanel({ messages, planSummary }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-4xl mx-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
            <span className="text-6xl mb-4">🤖</span>
            <p className="text-lg font-medium">AIチームに何でも聞いてください</p>
            <p className="text-sm mt-2">複数のエージェントが協力して回答します</p>
          </div>
        )}

        {planSummary && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-1">
              📋 実行プラン
            </div>
            <p className="text-sm text-blue-600">{planSummary}</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end mb-3">
                <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            );
          }

          return (
            <AgentMessage
              key={msg.id}
              agentName={msg.agentName || 'Agent'}
              agentIcon={msg.agentIcon}
              agentColor={msg.agentColor}
              content={msg.content}
              isStreaming={msg.isStreaming}
            />
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
