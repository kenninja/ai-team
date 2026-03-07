export async function register() {
  // サーバーサイドでのみ開始（Edge Runtimeでは実行しない）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMailCron } = await import('./lib/mail-cron');
    startMailCron();

    // Slack Socket Mode接続
    const { initSlackApp } = await import('./lib/slack');
    initSlackApp().catch(err => {
      console.error('[instrumentation] Slack初期化エラー:', err);
    });

    // 日次サマリー通知
    const { startSummaryCron } = await import('./lib/summary-cron');
    startSummaryCron();
  }
}
