import { NextResponse } from 'next/server';
import { getAllTeams } from '@/teams';

export async function GET() {
  const teams = getAllTeams();
  // エージェントのsystemPromptは除外して返す（セキュリティ）
  const safeTeams = teams.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    agents: t.agents.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      color: a.color,
    })),
  }));
  return NextResponse.json(safeTeams);
}
