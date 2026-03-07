import { NextRequest } from 'next/server';
import { getSession, addMessage, updateSessionTitle } from '@/lib/db';
import { getTeam } from '@/teams';
import { createExecutionPlan } from '@/agents/orchestrator';
import { executeTeamWorkflow } from '@/agents/executor';
import { SSEEvent } from '@/agents/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, message } = body;

  if (!sessionId || !message) {
    return new Response(JSON.stringify({ error: 'sessionIdとmessageが必要です' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'セッションが見つかりません' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const team = getTeam(session.teamId);
  if (!team) {
    return new Response(JSON.stringify({ error: 'チームが見つかりません' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ユーザーメッセージを保存
  addMessage({
    id: uuidv4(),
    sessionId,
    role: 'user',
    content: message,
  });

  // セッションタイトルが未設定なら、最初のメッセージから設定
  if (!session.title) {
    const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
    updateSessionTitle(sessionId, title);
  }

  // SSEストリームを作成
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // オーケストレーターで実行プランを生成
        const plan = await createExecutionPlan(team, message);

        // エージェントワークフローを実行
        const workflow = executeTeamWorkflow(team, plan, message);

        for await (const event of workflow) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // エージェント終了時にメッセージをDBに保存
          if (event.type === 'agent_end' && event.content) {
            addMessage({
              id: uuidv4(),
              sessionId,
              role: 'agent',
              agentId: event.agentId,
              agentName: event.agentName,
              content: event.content,
            });
          }
        }
      } catch (error) {
        const errorEvent: SSEEvent = {
          type: 'error',
          content: error instanceof Error ? error.message : 'エラーが発生しました',
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
