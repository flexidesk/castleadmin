import { createBrowserClient } from '@supabase/ssr';

const PFX = 'sb_';

const canUseCookies = (() => {
  let cache: boolean | null = null;
  return () => {
    if (typeof document === 'undefined') return false;
    if (cache !== null) return cache;
    const k = '__sb_test__';
    document.cookie = `${k}=1; Path=/; SameSite=None; Secure; Partitioned`;
    cache = document.cookie.includes(k);
    document.cookie = `${k}=; Path=/; Max-Age=0; SameSite=None; Secure`;
    return cache;
  };
})();

const fromCookies = () =>
  typeof document === 'undefined'
    ? []
    : document.cookie
        .split(';')
        .filter(Boolean)
        .map((c) => {
          const [name, ...rest] = c.trim().split('=');
          return { name: name.trim(), value: decodeURIComponent(rest.join('=')) };
        })
        .filter((c) => c.name);

const fromStorage = () => {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PFX))
      .map((k) => ({ name: k.slice(PFX.length), value: localStorage.getItem(k) || '' }));
  } catch {
    return [];
  }
};

const setCookie = (name: string, value: string, options?: any) => {
  let s = `${name}=${encodeURIComponent(value)}; Path=${options?.path || '/'}; SameSite=None; Secure; Partitioned`;
  if (options?.maxAge) s += `; Max-Age=${options.maxAge}`;
  if (options?.domain) s += `; Domain=${options.domain}`;
  if (options?.expires) s += `; Expires=${new Date(options.expires).toUTCString()}`;
  document.cookie = s;
};

const getToken = () =>
  (canUseCookies() ? fromCookies() : fromStorage()).find((c) =>
    c.name.includes('auth-token')
  )?.value ?? null;

if (typeof window !== 'undefined' && !(window as any).__sb_patched__) {
  (window as any).__sb_patched__ = true;

  // Suppress Supabase internal console.error for stale refresh token errors
  const _origConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : a?.message ?? a?.code ?? JSON.stringify(a) ?? '')).join(' ');
    if (
      msg.includes('refresh_token_not_found') ||
      msg.includes('Refresh Token Not Found') ||
      msg.includes('Invalid Refresh Token') ||
      (msg.includes('AuthApiError') && msg.includes('400'))
    ) {
      return; // suppress
    }
    _origConsoleError(...args);
  };

  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const token = getToken();
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (token && (url.startsWith('/') || url.startsWith(window.location.origin))) {
      init = {
        ...(init || {}),
        headers: { ...(init?.headers || {}), 'x-sb-token': token },
      };
    }
    return orig(input, init);
  };

  // Suppress non-fatal "Lock broken by another request with the 'steal' option" AbortErrors
  const origAddEventListener = window.addEventListener.bind(window);
  origAddEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    if (
      reason instanceof Error &&
      reason.name === 'AbortError' && reason.message?.includes('steal')
    ) {
      event.preventDefault();
    }
  });
}

let _supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (typeof window !== 'undefined' && (window as any).__supabaseClient) {
    return (window as any).__supabaseClient as ReturnType<typeof createBrowserClient>;
  }
  if (_supabaseClient) return _supabaseClient;

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storageKey: 'castleadmin-auth',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      cookies: {
        getAll: () => (canUseCookies() ? fromCookies() : fromStorage()),
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return;
          if (canUseCookies()) {
            cookiesToSet.forEach(({ name, value, options }) =>
              value
                ? setCookie(name, value, options)
                : (document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=None; Secure`)
            );
          } else {
            cookiesToSet.forEach(({ name, value, options }) => {
              try {
                value
                  ? localStorage.setItem(`${PFX}${name}`, value)
                  : localStorage.removeItem(`${PFX}${name}`);
              } catch {}
              if (value) setCookie(name, value, options);
            });
          }
        },
      },
      global: {
        fetch: (...args) => {
          return fetch(...args).then(async (res) => {
            if (res.status === 400) {
              const clone = res.clone();
              try {
                const body = await clone.json();
                if (
                  body?.error_code === 'refresh_token_not_found' ||
                  body?.code === 'refresh_token_not_found'|| body?.message?.includes('Refresh Token Not Found')
                ) {
                  // Clear all stored auth tokens
                  try {
                    Object.keys(localStorage)
                      .filter((k) =>
                        k.startsWith(PFX) ||
                        k.startsWith('sb-') ||
                        k.includes('castleadmin-auth') ||
                        k.includes('supabase')
                      )
                      .forEach((k) => localStorage.removeItem(k));
                  } catch {}
                  // Clear auth cookies
                  document.cookie.split(';').forEach((c) => {
                    const name = c.trim().split('=')[0];
                    if (name.startsWith('sb-') || name.includes('auth-token') || name.includes('supabase')) {
                      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=None; Secure`;
                    }
                  });
                  // Redirect to login
                  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                    window.location.href = '/login';
                  }
                }
              } catch {}
            }
            return res;
          });
        },
      },
    }
  );

  _supabaseClient = client;
  if (typeof window !== 'undefined') {
    (window as any).__supabaseClient = client;
  }
  return client;
}
