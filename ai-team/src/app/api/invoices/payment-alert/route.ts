import { NextResponse } from 'next/server';
import { checkPaymentAlerts } from '@/lib/payment-alert';

export async function POST() {
  try {
    const result = await checkPaymentAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[PaymentAlert] テスト実行エラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'エラーが発生しました' },
      { status: 500 }
    );
  }
}
