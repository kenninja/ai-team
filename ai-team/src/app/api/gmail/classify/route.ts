import { NextResponse } from 'next/server';
import { runGmailClassifyJob } from '@/lib/gmail-classify';

export async function POST() {
  try {
    const result = await runGmailClassifyJob();
    const { results } = result;
    console.log('[gmail-classify] 分類結果:', JSON.stringify(results, null, 2));
    console.log(
      '[gmail-classify] タスク登録対象:',
      results.filter((r) => r.category !== 'other'),
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    console.error('[api/gmail/classify]', e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        fetched: 0,
        classified: 0,
        tasksCreated: 0,
        slackAlerts: 0,
        results: [],
      },
      { status: 500 }
    );
  }
}
