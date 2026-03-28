export type MailCategory =
  | 'invoice' // 請求書・領収書
  | 'requires_reply' // 要返信
  | 'supplier_chase' // 業者からの督促・確認
  | 'internal' // 社内問い合わせ
  | 'other'; // その他

export interface ClassifiedMail {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  receivedAt: string;
  category: MailCategory;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: string;
}
