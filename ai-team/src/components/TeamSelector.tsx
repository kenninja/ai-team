'use client';

interface TeamInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  agents: { id: string; name: string; description: string; icon: string; color: string }[];
}

export default function TeamSelector({
  teams,
  onSelect,
}: {
  teams: TeamInfo[];
  onSelect: (teamId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((team) => (
        <button
          key={team.id}
          onClick={() => onSelect(team.id)}
          className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-blue-300 hover:shadow-lg transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{team.icon}</span>
            <h2 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              {team.name}
            </h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">{team.description}</p>
          <div className="flex flex-wrap gap-2">
            {team.agents.map((agent) => (
              <span
                key={agent.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-700"
              >
                <span>{agent.icon}</span>
                {agent.name}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
