import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Driver portal is publicly accessible — skip auth check
  if (pathname.startsWith('/driver-portal')) {
    return NextResponse.next({ request });
  }

  // Public routes — skip auth check
  if (pathname.startsWith('/login') || pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password') || pathname.startsWith('/register') || pathname.startsWith('/track') || pathname.startsWith('/auth')) {
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
              sameSite: 'none',
              secure: true,
            })
          );
        },
      },
      auth: {
        // Suppress automatic error logging for stale refresh tokens
        debug: false,
      },
    }
  );

  let error: any = null;
  try {
    const result = await supabase.auth.getUser();
    error = result.error;
  } catch (e: any) {
    error = e;
  }

  // If refresh token is invalid/not found, clear all auth cookies and redirect to login
  if (
    error &&
    ((error as any)?.code === 'refresh_token_not_found' || error.message?.includes('Refresh Token Not Found') ||
      error.message?.includes('refresh_token_not_found'))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';

    const redirectResponse = NextResponse.redirect(loginUrl);

    // Clear all Supabase auth cookies
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
          sameSite: 'none',
          secure: true,
        });
      }
    });

    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/icons/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};