'use client';

export default function SlackConnect() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="text-6xl mb-6">💬</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-3">Slackを接続</h2>
      <p className="text-gray-600 mb-6 max-w-md">
        Socket Modeを使用してSlackと接続します。
        以下の手順で設定してください。
      </p>

      <div className="text-left max-w-lg bg-gray-50 rounded-xl p-6 space-y-4">
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
          <div>
            <p className="text-sm font-medium text-gray-900">Slack Appを作成</p>
            <p className="text-xs text-gray-500 mt-0.5">
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                api.slack.com/apps
              </a>
              {' '}で「Create New App」→「From scratch」
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
          <div>
            <p className="text-sm font-medium text-gray-900">Socket Modeを有効化</p>
            <p className="text-xs text-gray-500 mt-0.5">
              「Socket Mode」→ 有効化 → App-Level Token作成（connections:writeスコープ）
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
          <div>
            <p className="text-sm font-medium text-gray-900">Bot Token Scopesを追加</p>
            <p className="text-xs text-gray-500 mt-0.5">
              OAuth & Permissions → channels:history, channels:read, chat:write, users:read
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">4</span>
          <div>
            <p className="text-sm font-medium text-gray-900">Event Subscriptionsを設定</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Event Subscriptions → 有効化 → Subscribe to bot events → message.channels
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">5</span>
          <div>
            <p className="text-sm font-medium text-gray-900">.env.localにトークンを設定</p>
            <p className="text-xs text-gray-500 mt-0.5 font-mono bg-gray-100 p-2 rounded">
              SLACK_BOT_TOKEN=xoxb-...<br/>
              SLACK_APP_TOKEN=xapp-...<br/>
              SLACK_SIGNING_SECRET=...
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">6</span>
          <div>
            <p className="text-sm font-medium text-gray-900">サーバーを再起動</p>
            <p className="text-xs text-gray-500 mt-0.5">
              npm run dev を再実行すると自動的に接続されます
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
