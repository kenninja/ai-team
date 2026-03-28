# AI Team

バックオフィス業務を効率化するための業務ハブアプリ。
毎朝このアプリを開くだけで「今日やること」が分かる状態を目指している。

---

## 概要

- **作成日**：2026年3月
- **技術スタック**：Next.js 14 / React 18 / TypeScript / better-sqlite3 / Firebase / Tailwind CSS
- **起動ポート**：3000
- **起動コマンド**：`cd ai-team && npm run dev`

---

## 機能一覧

### ホーム画面（/）
- 時間帯別挨拶 + 日付表示
- Gmail / Slack / Calendar 連携状態表示
- 月次締め進捗カード（残り営業日・進捗バー・ステータスバッジ）
- TODAY'S TASKS（Firebaseから今日・明日期限のタスクをリアルタイム表示）
- 期限が近い請求書のアラート表示
- 今月のサマリー（未払い請求書件数・合計・科目未入力件数）

### タスク管理（/tasks）
- Firebase Firestoreでリアルタイム同期
- Slack・メール・その他でソース分類
- 期限・優先度・繰り返し・アラート設定
- 期限超過タスクを上部に赤く表示
- デバイス間同期（同期コード方式）
- エクスポート・インポート機能

### メール（/mail）
- Gmail OAuth2.0連携
- メール一覧表示・詳細閲覧
- AI分析（要返信判定・緊急度・返信案生成）
- Slack経由でワンクリック返信・返信不要マーク
- 未返信メールの定期リマインド（毎時・Slack DM）

### Slack（/slack）
- Slack Socket Mode連携
- チャンネルメッセージ取得・表示
- メンション検出
- AI返信案の生成

### 請求書管理（/mail/invoices）
- 手入力フォームで請求書を登録
- ステータス管理：未処理（pending）→ CSV出力待ち（ready）→ MF登録済み（exported）
- MF支払先マスタCSVインポート・自動マッチング（登録済み/スポット判定）
- MFクラウド債務支払い専用CSV出力（1クリック）
- CSV出力後に自動でステータスをexportedに更新

### 履歴（/history）
- チャットセッションの処理履歴

---

## 自動処理（node-cron / instrumentation.ts で起動時に開始）

| 処理 | スケジュール | 内容 |
|---|---|---|
| メール取得・AI分析 | 10分毎 | 新着メールを取得し、要返信判定・請求書検出 |
| 未返信リマインド | 毎時0分 | 2時間以上未返信のメールをSlack DMに通知（対応済み/返信不要ボタン付き） |
| 日次サマリー | 毎朝9:00 JST | 未返信メール・Slack・タスクのサマリーをSlack DMに送信 |
| 支払期限アラート | 毎朝9:00 JST | 支払期限3日前・前日の請求書をSlack DMに通知 |

---

## 技術構成

### フロントエンド
- Next.js 14 (App Router) / React 18 / TypeScript
- Tailwind CSS

### バックエンド
- Next.js API Routes
- better-sqlite3（ローカルDB: `data/ai-team.db`）
- node-cron（定期処理）
- instrumentation.ts（サーバー起動時にcron・Slack接続を初期化）

### 外部サービス連携
- **Gmail API**（メール取得・返信送信・請求書PDF検出）
- **Slack API**（Socket Mode通知・DM送信・ボタンアクション）
- **Google Calendar API**（予定取得）
- **Firebase Firestore**（タスク同期・リアルタイム更新）
- **Gemini API**（メールAI分析・要返信判定・返信案生成）
- **マネーフォワードクラウド債務支払い**（CSV連携）

---

## 環境変数（.env.local）

※値は各自設定。以下はキー名の一覧。

```
GEMINI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_MY_USER_ID=
FIREBASE_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_SYNC_CODE=
```

---

## DBテーブル構成

### sessions（チャットセッション）
| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT | 主キー |
| team_id | TEXT | チームID |
| title | TEXT | セッションタイトル |
| created_at | INTEGER | 作成日時 |

### messages（チャットメッセージ）
| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT | 主キー |
| session_id | TEXT | セッションID（FK） |
| role | TEXT | user / assistant / agent |
| agent_id | TEXT | エージェントID |
| content | TEXT | メッセージ内容 |
| timestamp | INTEGER | タイムスタンプ |

### gmail_tokens（Gmail認証トークン）
| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT | 主キー（default） |
| access_token | TEXT | アクセストークン |
| refresh_token | TEXT | リフレッシュトークン |
| expiry_date | INTEGER | 有効期限 |

### processed_emails（処理済みメール）
| カラム | 型 | 説明 |
|---|---|---|
| message_id | TEXT | 主キー |
| thread_id | TEXT | スレッドID |
| subject | TEXT | 件名 |
| sender | TEXT | 送信者名 |
| sender_email | TEXT | 送信者メールアドレス |
| body_text | TEXT | 本文 |
| received_at | INTEGER | 受信日時 |
| needs_reply | INTEGER | 要返信フラグ（0/1） |
| reply_urgency | TEXT | 緊急度（high/medium/low） |
| reply_draft | TEXT | AI返信案 |
| reply_sent | INTEGER | 返信済みフラグ（0/1） |
| has_invoice | INTEGER | 請求書有無 |
| summary | TEXT | AI要約 |

### invoices（請求書）
| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER | 主キー（自動採番） |
| email_message_id | TEXT | 元メールID |
| file_path | TEXT | ファイルパス |
| vendor_name | TEXT | 取引先名 |
| invoice_date | TEXT | 請求日（YYYY-MM-DD） |
| due_date | TEXT | 支払期日（YYYY-MM-DD） |
| total_amount | INTEGER | 税込合計金額 |
| tax_amount | INTEGER | 消費税額 |
| description | TEXT | 摘要 |
| account_title | TEXT | 勘定科目 |
| sub_account | TEXT | 補助科目 |
| status | TEXT | pending / ready / exported |

### vendors（ベンダーマスタ）
| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER | 主キー |
| vendor_name | TEXT | 取引先名 |
| account_title | TEXT | 勘定科目 |
| sub_account | TEXT | 補助科目 |
| tax_category | TEXT | 税区分 |
| department | TEXT | 部門 |

### mf_vendors（MF支払先マスタ）
| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER | 主キー |
| vendor_name | TEXT | 取引先名（正式名称） |
| vendor_name_short | TEXT | 支払先名（略称） |
| vendor_code | TEXT | 支払先コード |
| vendor_unique_key | TEXT | MFユニークキー |
| default_account_item | TEXT | デフォルト経費科目 |

### slack_messages（Slack処理済みメッセージ）
| カラム | 型 | 説明 |
|---|---|---|
| channel_id + message_ts | TEXT | 複合主キー |
| channel_name | TEXT | チャンネル名 |
| user_name | TEXT | 送信者名 |
| text | TEXT | メッセージ本文 |
| needs_reply | INTEGER | 要返信フラグ |
| reply_sent | INTEGER | 返信済みフラグ |
| mentioned_me | INTEGER | メンションフラグ |

### auto_tasks（自動生成タスク追跡）
| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT | 主キー |
| source | TEXT | タスク元（mail/slack/calendar） |
| source_id | TEXT | 元メッセージ等のID |
| task_title | TEXT | タスクタイトル |
| firebase_synced | INTEGER | Firebase同期済みフラグ |

---

## ファイル構成

```
ai-team/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # ホーム画面
│   │   ├── layout.tsx                      # ルートレイアウト
│   │   ├── tasks/page.tsx                  # タスク管理（iframe埋込）
│   │   ├── mail/page.tsx                   # メール一覧
│   │   ├── mail/invoices/page.tsx          # 請求書管理
│   │   ├── slack/page.tsx                  # Slackメッセージ
│   │   ├── history/page.tsx                # 履歴
│   │   ├── chat/[sessionId]/page.tsx       # チャットセッション
│   │   └── api/
│   │       ├── dashboard/                  # ホーム用データAPI
│   │       ├── invoices/                   # 請求書CRUD・CSV出力
│   │       ├── mf-vendors/                 # MF支払先マスタ
│   │       ├── gmail/                      # Gmail認証・メール取得・返信
│   │       ├── slack/                      # Slackメッセージ・返信
│   │       ├── calendar/                   # カレンダー状態
│   │       ├── tasks/                      # タスクAPI
│   │       ├── summary/test/               # 日次サマリーテスト送信
│   │       ├── sessions/                   # チャットセッション
│   │       ├── chat/                       # チャットAPI
│   │       └── teams/                      # チーム設定
│   ├── lib/
│   │   ├── db.ts                           # SQLiteデータベース管理
│   │   ├── gmail.ts                        # Gmailメール取得・送信
│   │   ├── gmail-auth.ts                   # Gmail OAuth2.0認証
│   │   ├── slack.ts                        # Slack Socket Mode・ボタンハンドラー
│   │   ├── gemini.ts                       # Gemini API呼び出し
│   │   ├── firebase.ts                     # Firebase Admin設定
│   │   ├── firebase-client.ts              # Firebase Client SDK設定
│   │   ├── google-calendar.ts              # Google Calendar API
│   │   ├── mail-cron.ts                    # メール定期処理・リマインド
│   │   ├── summary-cron.ts                 # 日次サマリー通知
│   │   ├── payment-alert.ts               # 支払期限アラート
│   │   ├── csv-export.ts                   # MF用CSV生成
│   │   ├── business-days.ts               # 営業日計算
│   │   ├── task-creator.ts                # タスク自動生成
│   │   ├── rate-limiter.ts                # API 429リトライ
│   │   └── json-extract.ts                # JSON抽出ユーティリティ
│   ├── components/
│   │   ├── Header.tsx                      # 共通ヘッダー・ナビゲーション
│   │   ├── invoice/InvoiceForm.tsx         # 請求書入力フォーム
│   │   ├── EmailList.tsx / EmailDetail.tsx  # メール表示
│   │   ├── SlackMessageList.tsx / SlackMessageDetail.tsx  # Slack表示
│   │   ├── GmailConnect.tsx / SlackConnect.tsx  # 連携設定
│   │   └── ChatPanel.tsx / InputBar.tsx / Sidebar.tsx  # チャットUI
│   ├── hooks/
│   │   └── useTodayTasks.ts               # Firebaseタスク取得フック
│   ├── agents/                            # AIエージェント
│   │   ├── orchestrator.ts                # オーケストレーター
│   │   ├── executor.ts                    # エグゼキューター
│   │   └── types.ts                       # 型定義
│   ├── teams/                             # チーム設定
│   ├── instrumentation.ts                 # 起動時初期化（cron・Slack）
│   └── middleware.ts                      # ミドルウェア
├── public/
│   ├── task-manager.html                   # タスク管理HTML（iframe用）
│   └── uploads/                            # アップロードファイル
├── data/
│   └── ai-team.db                          # SQLiteデータベース
├── .env.local                              # 環境変数（Git管理外）
├── next.config.mjs                         # Next.js設定
├── package.json
└── tailwind.config.ts
```

---

## 今後の予定

### フェーズ2（次に作るもの）
- [ ] SlackメンションをFirebaseに自動追加してタスク化
- [ ] Gmail要返信メールをFirebaseに自動追加してタスク化
- [ ] Googleカレンダーをホームに表示

### 将来的に
- [ ] 総務業務の統合（契約書・備品・申請管理）
- [ ] 月次レポートの自動生成
- [ ] MF API連携（プラン変更時）

---

## 運用メモ

### 毎朝の使い方
1. AI Teamを開く（http://localhost:3000）
2. ホームで月次締め残り日数・今日のタスクを確認
3. Slack DMのサマリー通知で未返信メール・タスクを確認
4. タスクタブで詳細確認・完了チェック
5. 必要に応じて請求書タブでMF用CSV出力

### MF請求書処理の流れ
1. 請求書タブで手動登録（取引先・金額・期日・勘定科目）
2. ステータスを「CSV出力待ち」に変更
3. 「MF用CSV出力」ボタンでCSVダウンロード → MFにインポート
4. 出力後、自動的に「MF登録済み」に更新

### Slack通知の動作
- 未返信リマインド：毎時0分に2時間以上放置メールを通知（ボタンで対応済み/返信不要を選択可能）
- 日次サマリー：毎朝9時に全体サマリーをDM送信
- 支払期限アラート：毎朝9時に期限が近い請求書を通知
- AI Team起動中のみ動作（node-cron）

---

## トラブルシューティング

### Gemini APIエラー（429 RESOURCE_EXHAUSTED）
→ 無料枠の上限に達している。モデルは`gemini-2.0-flash`を使用。自動リトライ機能あり（最大2回、15秒間隔）。

### Slackアラートが届かない
→ `.env.local` の `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_SIGNING_SECRET` を確認。AI Teamが起動しているか確認。

### タスクページが真っ白
→ `public/task-manager.html` が存在するか確認。devサーバーを再起動。

### Gmail連携が切れた
→ http://localhost:3000/mail から再認証。トークンはDBの`gmail_tokens`テーブルに保存。
