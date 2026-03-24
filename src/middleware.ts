import { NextResponse, type NextRequest } from 'next/server';

function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}

/**
 * Decode a JWT payload without verifying the signature.
 * This is safe for middleware auth-gating because:
 * - We only use it to decide whether to redirect to /login
 * - The actual token is validated by Supabase on real API calls
 * - This avoids making ANY network call to Supabase on every request,
 *   which was the root cause of the rate limit errors.
 */
function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if the Supabase session cookie contains a valid, non-expired JWT.
 * Returns the user object from the JWT payload, or null if not authenticated.
 * No network calls are made.
 */
function getSessionFromCookies(request: NextRequest): { user: any } | null {
  // Supabase stores the session in a cookie named like:
  // sb-<project-ref>-auth-token or sb-<project-ref>-auth-token.0
  const cookies = request.cookies.getAll();

  for (const cookie of cookies) {
    if (!cookie.name.includes('auth-token')) continue;

    let rawValue = cookie.value;

    // The cookie value may be URL-encoded JSON
    try {
      rawValue = decodeURIComponent(rawValue);
    } catch {}

    // Try parsing as JSON (Supabase stores session as JSON in the cookie)
    let accessToken: string | null = null;
    try {
      const parsed = JSON.parse(rawValue);
      // Format: [accessToken, refreshToken] or { access_token, refresh_token }
      if (Array.isArray(parsed) && parsed[0]) {
        accessToken = parsed[0];
      } else if (parsed?.access_token) {
        accessToken = parsed.access_token;
      }
    } catch {
      // Maybe the cookie value IS the access token directly
      if (rawValue.split('.').length === 3) {
        accessToken = rawValue;
      }
    }

    if (!accessToken) continue;

    const payload = decodeJwtPayload(accessToken);
    if (!payload) continue;

    // Check expiry — exp is in seconds
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) continue;

    // Valid, non-expired session found
    return { user: payload };
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secure = isSecureRequest(request);

  // Serve SVG fallback for PWA icon requests
  if (pathname.startsWith('/icons/icon-') && pathname.endsWith('.png')) {
    const sizeMatch = pathname.match(/icon-(\d+)x(\d+)\.png/);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1]);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#1e40af"/>
  <text x="50%" y="54%" font-family="sans-serif" font-size="${Math.round(size * 0.45)}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">C</text>
</svg>`;
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  }

  // Driver portal is publicly accessible — skip auth check entirely
  if (pathname.startsWith('/driver-portal')) {
    return NextResponse.next({ request });
  }

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isPublicPage =
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/track') ||
    pathname.startsWith('/auth');

  // Fully public pages that never need auth checking
  if (isPublicPage) {
    return NextResponse.next({ request });
  }

  // Check session from cookies — NO network call, NO rate limit risk
  const sessionData = getSessionFromCookies(request);
  const isAuthenticated = !!sessionData;

  if (isAuthenticated) {
    // Redirect authenticated users away from login/register
    if (isAuthPage) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/orders-dashboard';
      return NextResponse.redirect(dashboardUrl);
    }
    return NextResponse.next({ request });
  }

  // --- User is NOT authenticated ---

  // Allow unauthenticated access to login/register
  if (isAuthPage) {
    return NextResponse.next({ request });
  }

  // Unauthenticated on a protected route — redirect to login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/icons/:path*',
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml|txt|woff|woff2|ttf|eot|map)$).*)',
  ],
};