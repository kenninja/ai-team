---
name: ai-team-server
description: AI Teamサーバーを起動する。Slack/Gmail/Calendar連携、日次サマリー、メール即時通知、ワンクリック返信が全て有効になる。
allowed-tools: Bash(taskkill *), Bash(cd * && npm run dev), Bash(curl *)
argument-hint: "[start|stop|restart|status]"
---

# AI Team サーバー管理スキル

AI Teamアプリ（Next.js）のdev serverを起動・停止・再起動する。

## 起動時に有効になる機能

| 機能 | スケジュール | 説明 |
|---|---|---|
| メール自動チェック | 5分ごと | 新着メールをAI分析、返信必要なものだけSlack DMに通知 |
| 未返信リマインダー | 毎時 | 2時間以上放置された未返信メールをSlack DMでリマインド |
| 日次サマリー | 毎朝9:00 JST | 未返信メール/Slack件数・タスク一覧をSlack DMに送信 |
| Slack監視 | リアルタイム | Socket Modeでメッセージ受信、AI分析、タスク自動作成 |
| メール返信ボタン | Slack DM内 | 「このまま送信」「編集して送信」ボタンでSlackから直接返信 |
| カレンダー連携 | タスク作成時 | 期限付きタスクをGoogleカレンダーに自動登録 |

## コマンド

引数: $ARGUMENTS

### start（デフォルト）
```bash
cd "c:/Users/kenta/Downloads/プログラミング用/ai-team" && npm run dev
```
バックグラウンドで起動する。

### stop
```bash
taskkill //F //IM node.exe
```

### restart
stopしてからstartする。

### status
```bash
curl -s http://127.0.0.1:3000/api/slack/status
```
`{"connected":true}` が返ればOK。

## PC起動時の自動起動

Windowsスタートアップに登録済み:
- スクリプト: `ai-team/start-ai-team.vbs`
- 登録先: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\start-ai-team.vbs`
- PC起動時にウィンドウなしでバックグラウンド実行される
- 解除: `Win + R` → `shell:startup` → `start-ai-team.vbs` を削除

## テスト用エンドポイント

- `http://localhost:3000/api/summary/test` — 日次サマリーを即時送信（開発環境のみ）

## 必要な環境変数（ai-team/.env.local）

```
GEMINI_API_KEY=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
SLACK_MY_USER_ID=...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
FIREBASE_API_KEY=...
FIREBASE_PROJECT_ID=...
```

## アーキテクチャ

```
instrumentation.ts（サーバー起動時）
  ├─ startMailCron()    → 5分ごとメールチェック + 毎時リマインダー
  ├─ initSlackApp()     → Socket Mode接続 + ボタン/モーダルハンドラー
  └─ startSummaryCron() → 毎朝9:00 JSTサマリー送信
```

## 主要ファイル

| ファイル | 役割 |
|---|---|
| `ai-team/src/lib/slack.ts` | Slack接続、メッセージ処理、返信ボタン/モーダル |
| `ai-team/src/lib/mail-cron.ts` | メール自動チェック、即時通知、リマインダー |
| `ai-team/src/lib/summary-cron.ts` | 日次サマリー組み立て・送信 |
| `ai-team/src/lib/task-creator.ts` | AI分析→タスク自動作成→Firestore |
| `ai-team/src/lib/google-calendar.ts` | カレンダーイベント作成 |
| `ai-team/src/lib/db.ts` | SQLite DB（メール/Slack/タスク管理） |
| `ai-team/src/lib/firebase.ts` | Firestoreタスク同期 |
