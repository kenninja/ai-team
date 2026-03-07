import { Team } from '@/agents/types';
import { businessTeam } from './business-team';

// 全チーム登録
const teams: Map<string, Team> = new Map();
teams.set(businessTeam.id, businessTeam);

export function getTeam(id: string): Team | undefined {
  return teams.get(id);
}

export function getAllTeams(): Team[] {
  return Array.from(teams.values());
}
