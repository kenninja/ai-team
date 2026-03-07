import { Team, ExecutionPlan, SSEEvent } from '@/agents/types';
import { generateTextStream } from '@/lib/gemini';

/**
 * エージェント実行エンジン
 * 実行プランに従って各エージェントを順次実行し、SSEイベントを生成する
 */
export async function* executeTeamWorkflow(
  team: Team,
  plan: ExecutionPlan,
  userMessage: string
): AsyncGenerator<SSEEvent> {
  // プランをUIに送信
  yield { type: 'plan', plan };

  // 各エージェントの出力を蓄積（後続エージェントへのコンテキスト）
  const agentOutputs: { agentName: string; output: string }[] = [];

  // タスクを順次実行
  for (const task of plan.tasks) {
    const agent = team.agents.find(a => a.id === task.agentId);
    if (!agent) continue;

    // エージェント開始通知
    yield { type: 'agent_start', agentId: agent.id, agentName: agent.name };

    // これまでの他エージェントの出力をコンテキストとして渡す
    const context = agentOutputs.length > 0
      ? agentOutputs.map(o => `【${o.agentName}の成果】\n${o.output}`).join('\n\n---\n\n')
      : undefined;

    // エージェント実行（ストリーミング）
    let fullOutput = '';
    try {
      const stream = generateTextStream(agent.systemPrompt, task.instruction, context);
      for await (const chunk of stream) {
        fullOutput += chunk;
        yield { type: 'agent_chunk', agentId: agent.id, agentName: agent.name, content: chunk };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'エラーが発生しました';
      fullOutput = `[エラー] ${errorMsg}`;
      yield { type: 'agent_chunk', agentId: agent.id, agentName: agent.name, content: fullOutput };
    }

    // 出力を蓄積
    agentOutputs.push({ agentName: agent.name, output: fullOutput });

    // エージェント終了通知
    yield { type: 'agent_end', agentId: agent.id, agentName: agent.name, content: fullOutput };
  }

  // レビュアーによる最終統合
  const reviewer = team.agents.find(a => a.id === 'reviewer');
  if (reviewer && agentOutputs.length > 1) {
    yield { type: 'agent_start', agentId: reviewer.id, agentName: reviewer.name };

    const allOutputs = agentOutputs
      .map(o => `【${o.agentName}の成果】\n${o.output}`)
      .join('\n\n---\n\n');

    const reviewInstruction = `ユーザーの元の依頼: ${userMessage}\n\n以下のチームメンバーの成果物をレビューし、最終回答としてまとめてください。`;

    let reviewOutput = '';
    try {
      const stream = generateTextStream(reviewer.systemPrompt, reviewInstruction, allOutputs);
      for await (const chunk of stream) {
        reviewOutput += chunk;
        yield { type: 'agent_chunk', agentId: reviewer.id, agentName: reviewer.name, content: chunk };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'レビューエラー';
      reviewOutput = `[エラー] ${errorMsg}`;
      yield { type: 'agent_chunk', agentId: reviewer.id, agentName: reviewer.name, content: reviewOutput };
    }

    yield { type: 'agent_end', agentId: reviewer.id, agentName: reviewer.name, content: reviewOutput };
  }

  // 完了通知
  yield { type: 'done' };
}
