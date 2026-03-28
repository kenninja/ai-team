import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { saveGmailToken, getGmailToken } from './db';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * OAuth認証URLを生成
 */
export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * 認証コードからトークンを取得して保存
 */
export async function handleCallback(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  saveGmailToken({
    accessToken: tokens.access_token || '',
    refreshToken: tokens.refresh_token || '',
    expiryDate: tokens.expiry_date || 0,
  });

  return tokens;
}

/**
 * 認証済みのOAuth2クライアントを取得
 */
export function getAuthenticatedClient() {
  const token = getGmailToken();
  if (!token) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate,
  });

  // トークン更新時に自動保存
  oauth2Client.on('tokens', (newTokens) => {
    const current = getGmailToken();
    saveGmailToken({
      accessToken: newTokens.access_token || current?.accessToken || '',
      refreshToken: newTokens.refresh_token || current?.refreshToken || '',
      expiryDate: newTokens.expiry_date || current?.expiryDate || 0,
    });
  });

  return oauth2Client;
}

/**
 * Gmail接続済みかチェック
 */
export function isGmailConnected(): boolean {
  return !!getGmailToken();
}

const FILE_AUTH_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const CREDENTIALS_JSON_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_JSON_PATH = path.join(process.cwd(), 'token.json');

/**
 * Gmail API v1 クライアント（分類ジョブ等）
 * - ルートに credentials.json がある場合: ファイル OAuth（token.json）
 * - ない場合: 既存の DB 保存トークン（Gmail 連携UI）
 */
export async function getGmailClient() {
  if (fs.existsSync(CREDENTIALS_JSON_PATH)) {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_JSON_PATH, 'utf8'));
    const c = raw.installed ?? raw.web;
    if (!c?.client_id || !c.client_secret) {
      throw new Error('credentials.json に client_id / client_secret がありません');
    }
    const redirectUri =
      (Array.isArray(c.redirect_uris) && c.redirect_uris[0]) || 'http://localhost';
    const oauth2 = new OAuth2Client(c.client_id, c.client_secret, redirectUri);

    if (fs.existsSync(TOKEN_JSON_PATH)) {
      oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_JSON_PATH, 'utf8')));
    } else {
      const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: [FILE_AUTH_READONLY_SCOPE],
        prompt: 'consent',
      });
      console.log('[gmail-auth] token.json がありません。ブラウザで次のURLを開いて認証してください:\n', authUrl);
      const code = process.env.GMAIL_OAUTH_CODE?.trim();
      if (!code) {
        throw new Error(
          '認証後、リダイレクトURLの code= を環境変数 GMAIL_OAUTH_CODE に設定して再実行するか、token.json を手動で配置してください'
        );
      }
      const { tokens } = await oauth2.getToken(code);
      oauth2.setCredentials(tokens);
      fs.writeFileSync(TOKEN_JSON_PATH, JSON.stringify(tokens, null, 2), 'utf8');
      console.log('[gmail-auth] token.json を保存しました');
    }

    oauth2.on('tokens', (t) => {
      try {
        const cur = fs.existsSync(TOKEN_JSON_PATH)
          ? JSON.parse(fs.readFileSync(TOKEN_JSON_PATH, 'utf8'))
          : {};
        fs.writeFileSync(TOKEN_JSON_PATH, JSON.stringify({ ...cur, ...t }, null, 2), 'utf8');
      } catch {
        /* ignore */
      }
    });

    return google.gmail({ version: 'v1', auth: oauth2 });
  }

  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error(
      'Gmail未接続です。Gmail連携を完了するか、credentials.json + token.json をプロジェクトルートに配置してください。'
    );
  }
  return google.gmail({ version: 'v1', auth });
}
