import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/orders-dashboard';
  // With custom auth, there's no OAuth callback — redirect to login
  return NextResponse.redirect(`${origin}/login`);
}
