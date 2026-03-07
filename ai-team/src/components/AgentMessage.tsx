'use client';

const AGENT_COLORS: Record<string, string> = {
  blue: 'border-blue-400 bg-blue-50',
  green: 'border-green-400 bg-green-50',
  purple: 'border-purple-400 bg-purple-50',
  orange: 'border-orange-400 bg-orange-50',
  red: 'border-red-400 bg-red-50',
};

const AGENT_BADGE_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
};

interface AgentMessageProps {
  agentName: string;
  agentIcon?: string;
  agentColor?: string;
  content: string;
  isStreaming?: boolean;
}

export default function AgentMessage({
  agentName,
  agentIcon,
  agentColor = 'blue',
  content,
  isStreaming = false,
}: AgentMessageProps) {
  const borderColor = AGENT_COLORS[agentColor] || AGENT_COLORS.blue;
  const badgeColor = AGENT_BADGE_COLORS[agentColor] || AGENT_BADGE_COLORS.blue;

  return (
    <div className={`border-l-4 rounded-r-lg p-4 mb-3 ${borderColor}`}>
      <div className="flex items-center gap-2 mb-2">
        {agentIcon && <span className="text-lg">{agentIcon}</span>}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {agentName}
        </span>
        {isStreaming && (
          <span className="text-xs text-gray-400 animate-pulse">回答中...</span>
        )}
      </div>
      <div className={`prose text-sm ${isStreaming ? 'streaming-cursor' : ''}`}>
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}
