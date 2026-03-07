'use client';

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface AgentStatusProps {
  agents: AgentInfo[];
  activeAgentId?: string;
  completedAgentIds: string[];
}

const STATUS_STYLES: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-500',
  active: 'bg-blue-100 text-blue-700 ring-2 ring-blue-300 animate-pulse',
  done: 'bg-green-100 text-green-700',
};

export default function AgentStatus({ agents, activeAgentId, completedAgentIds }: AgentStatusProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 overflow-x-auto">
      <span className="text-xs text-gray-500 font-medium shrink-0">チーム:</span>
      {agents.filter(a => a.id !== 'pm').map((agent) => {
        let status = 'idle';
        if (agent.id === activeAgentId) status = 'active';
        else if (completedAgentIds.includes(agent.id)) status = 'done';

        return (
          <div
            key={agent.id}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${STATUS_STYLES[status]}`}
          >
            <span>{agent.icon}</span>
            <span>{agent.name}</span>
            {status === 'done' && <span>&#10003;</span>}
          </div>
        );
      })}
    </div>
  );
}
