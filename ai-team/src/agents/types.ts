// エージェントの役割定義
export interface AgentRole {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  icon: string;
  color: string; // TailwindCSS color class
}

// チーム定義
export interface Team {
  id: string;
  name: string;
  description: string;
  icon: string;
  agents: AgentRole[];
  orchestratorPrompt: string;
}

// メッセージ
export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  content: string;
  timestamp: number;
}

// オーケストレーターが生成するタスク
export interface AgentTask {
  agentId: string;
  instruction: string;
}

// 実行プラン
export interface ExecutionPlan {
  summary: string;
  tasks: AgentTask[];
}

// セッション
export interface Session {
  id: string;
  teamId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

// SSEイベント
export interface SSEEvent {
  type: 'agent_start' | 'agent_chunk' | 'agent_end' | 'plan' | 'done' | 'error';
  agentId?: string;
  agentName?: string;
  content?: string;
  plan?: ExecutionPlan;
}
