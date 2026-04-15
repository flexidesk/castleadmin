import { NextResponse } from 'next/server';

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey || publicKey === 'your-vapid-public-key-here' || publicKey?.trim() === '') {
    return NextResponse?.json(
      { error: 'VAPID public key not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in your environment variables.' },
      { status: 503 }
    );
  }
  return NextResponse?.json({ publicKey });
}
