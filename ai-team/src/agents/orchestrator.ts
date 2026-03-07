import { Team, ExecutionPlan } from '@/agents/types';
import { generateText } from '@/lib/gemini';
import { extractJson } from '@/lib/json-extract';

/**
 * オーケストレーター: ユーザーの依頼をPMエージェントに渡し、
 * 実行プランを生成する
 */
export async function createExecutionPlan(
  team: Team,
  userMessage: string
): Promise<ExecutionPlan> {
  const pmAgent = team.agents.find(a => a.id === 'pm');
  if (!pmAgent) {
    throw new Error('PMエージェントがチームに見つかりません');
  }

  const response = await generateText(pmAgent.systemPrompt, userMessage);

  try {
    const plan = extractJson<ExecutionPlan>(response);

    // バリデーション: タスクが存在するか確認
    if (!plan.tasks || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
      throw new Error('実行プランにタスクが含まれていません');
    }

    // チームに存在するエージェントのみフィルタ
    const agentIds = new Set(team.agents.map(a => a.id));
    plan.tasks = plan.tasks.filter(t => agentIds.has(t.agentId));

    if (plan.tasks.length === 0) {
      throw new Error('有効なタスクがありません');
    }

    return plan;
  } catch {
    // JSONパースに失敗した場合、デフォルトプランを返す
    console.error('実行プランのパースに失敗:', response);
    return {
      summary: userMessage,
      tasks: [
        {
          agentId: 'writer',
          instruction: `以下のユーザーの依頼に対応してください:\n${userMessage}`,
        },
      ],
    };
  }
}
