import { NextRequest, NextResponse } from 'next/server';
import { sendOrderStatusEmail } from '@/lib/emailService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerEmail, customerName, orderId, status, bookingDate, deliveryWindow } = body;

    if (!customerEmail || !customerName || !orderId || !status) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: customerEmail, customerName, orderId, status' },
        { status: 400 }
      );
    }

    const result = await sendOrderStatusEmail({
      customerEmail,
      customerName,
      orderId,
      status,
      bookingDate,
      deliveryWindow,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('send-status-email route error:', err?.message ?? err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
