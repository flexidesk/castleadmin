import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function isSecureRequest(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
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

  // Supabase auth session refresh
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              sameSite: secure ? 'none' : 'lax',
              secure,
            })
          );
        },
      },
      auth: {
        debug: false,
      },
    }
  );

  let user: any = null;
  let error: any = null;
  try {
    const result = await supabase.auth.getSession();
    user = result.data?.session?.user ?? null;
    error = result.error;
  } catch (e: any) {
    error = e;
  }

  const isStaleRefreshToken =
    error &&
    (error?.code === 'refresh_token_not_found' || error?.message?.includes('Refresh Token Not Found') ||
      error?.message?.includes('refresh_token_not_found'));

  const isAuthenticated = !!user && !isStaleRefreshToken;

  if (isAuthenticated) {
    // Redirect authenticated users away from login/register
    if (isAuthPage) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/orders-dashboard';
      return NextResponse.redirect(dashboardUrl);
    }
    return supabaseResponse;
  }

  // --- User is NOT authenticated ---

  // Allow unauthenticated access to login/register (they need to see these pages)
  if (isAuthPage) {
    return supabaseResponse;
  }

  // Unauthenticated on a protected route — redirect to login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  const redirectResponse = NextResponse.redirect(loginUrl);

  if (isStaleRefreshToken) {
    request.cookies.getAll().forEach(({ name }) => {
      if (
        name.startsWith('sb-') ||
        name.includes('auth-token') ||
        name.includes('supabase') ||
        name.includes('castleadmin-auth')
      ) {
        redirectResponse.cookies.set(name, '', {
          maxAge: 0,
          path: '/',
          sameSite: secure ? 'none' : 'lax',
          secure,
        });
      }
    });
  }

  return redirectResponse;
}

export const config = {
  matcher: [
    '/icons/:path*',
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml|txt|woff|woff2|ttf|eot|map)$).*)',
  ],
};