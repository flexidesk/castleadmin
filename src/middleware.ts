import { NextResponse, type NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'castleadmin-jwt-secret-change-in-production';

/**
 * Decode a JWT payload without verifying the signature.
 * Safe for middleware auth-gating — actual verification happens in API routes.
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
 * Extract and validate the JWT from the Authorization header or
 * the castleadmin-auth-token cookie.
 */
function getSessionFromRequest(request: NextRequest): { user: any } | null {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = decodeJwtPayload(token);
    if (payload) {
      const now = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp > now) {
        return { user: payload };
      }
    }
  }

  // Check cookie (set by client-side localStorage sync or explicit cookie)
  const tokenCookie = request.cookies.get('castleadmin-auth-token');
  if (tokenCookie?.value) {
    const payload = decodeJwtPayload(tokenCookie.value);
    if (payload) {
      const now = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp > now) {
        return { user: payload };
      }
    }
  }

  // Also check legacy Supabase cookies for backward compatibility during transition
  const allCookies = request.cookies.getAll();
  const authCookies = allCookies.filter((c) => c.name.includes('auth-token'));
  for (const cookie of authCookies) {
    try {
      let value = cookie.value;
      try { value = decodeURIComponent(value); } catch {}
      if (value.startsWith('base64-')) {
        const base64 = value.slice('base64-'.length).replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        value = atob(padded);
      }
      const parsed = JSON.parse(value);
      const accessToken = parsed?.access_token || (Array.isArray(parsed) ? parsed[0] : null);
      if (accessToken) {
        const payload = decodeJwtPayload(accessToken);
        if (payload) {
          const now = Math.floor(Date.now() / 1000);
          if (!payload.exp || payload.exp > now) {
            return { user: payload };
          }
        }
      }
    } catch {}
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // Emergency cookie-clear endpoint
  if (pathname === '/api/clear-cookies') {
    const response = NextResponse.json({ cleared: true });
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-') || name.includes('auth-token') || name.includes('supabase')) {
        response.cookies.set(name, '', { maxAge: 0, path: '/' });
      }
    });
    return response;
  }

  // Driver portal is publicly accessible
  if (pathname.startsWith('/driver-portal')) {
    return NextResponse.next({ request });
  }

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isPublicPage =
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/track') ||
    pathname.startsWith('/install') ||
    pathname.startsWith('/auth');
  const isPublicApi =
    pathname.startsWith('/api/woocommerce/webhook') ||
    pathname.startsWith('/api/webhook-test') ||
    pathname.startsWith('/api/webhooks/fire') ||
    pathname.startsWith('/api/drivers/portal-login') ||
    pathname.startsWith('/api/push/vapid-public-key') ||
    pathname.startsWith('/api/database/') ||
    pathname.startsWith('/api/install/') ||
    pathname.startsWith('/api/auth/');

  if (isPublicPage || isPublicApi) {
    return NextResponse.next({ request });
  }

  const sessionData = getSessionFromRequest(request);
  const isAuthenticated = !!sessionData;

  if (isAuthenticated) {
    if (isAuthPage) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/orders-dashboard';
      return NextResponse.redirect(dashboardUrl);
    }
    return NextResponse.next({ request });
  }

  if (isAuthPage) {
    return NextResponse.next({ request });
  }

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