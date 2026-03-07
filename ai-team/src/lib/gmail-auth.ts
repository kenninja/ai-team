import { google } from 'googleapis';
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
