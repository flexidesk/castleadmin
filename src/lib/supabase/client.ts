import { createBrowserClient } from '@supabase/ssr';

const PFX = 'sb_';

const isSecureContext = typeof window !== 'undefined' && window.location.protocol === 'https:';

const canUseCookies = (() => {
  let cache: boolean | null = null;
  return () => {
    if (typeof document === 'undefined') return false;
    if (cache !== null) return cache;
    const k = '__sb_test__';
    document.cookie = isSecureContext
      ? `${k}=1; Path=/; SameSite=None; Secure`
      : `${k}=1; Path=/; SameSite=Lax`;
    cache = document.cookie.includes(k);
    document.cookie = isSecureContext
      ? `${k}=; Path=/; Max-Age=0; SameSite=None; Secure`
      : `${k}=; Path=/; Max-Age=0`;
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
  let s = `${name}=${encodeURIComponent(value)}; Path=${options?.path || '/'}`;
  if (isSecureContext) {
    s += '; SameSite=None; Secure';
  } else {
    s += '; SameSite=Lax';
  }
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
      (msg.includes('AuthApiError') && msg.includes('400')) ||
      (msg.includes('AbortError') && msg.includes('steal')) ||
      msg.includes('Lock broken by another request')
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
      reason.name === 'AbortError' && (reason.message?.includes('steal') || reason.message?.includes('Lock broken'))
    ) {
      event.preventDefault();
    }
  });
}

let _supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

// Use globalThis so the singleton survives React Strict Mode double-invocation
const GLOBAL_KEY = '__supabaseClientSingleton__';

export function createClient() {
  if (typeof globalThis !== 'undefined' && (globalThis as any)[GLOBAL_KEY]) {
    return (globalThis as any)[GLOBAL_KEY] as ReturnType<typeof createBrowserClient>;
  }
  if (_supabaseClient) {
    if (typeof globalThis !== 'undefined') (globalThis as any)[GLOBAL_KEY] = _supabaseClient;
    return _supabaseClient;
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        lock: async (name, acquireTimeout, fn) => {
          // Use Web Locks API if available, otherwise fall back to direct execution
          if (typeof navigator !== 'undefined' && navigator.locks) {
            return navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
              if (!lock) {
                // Lock not available, execute without lock to avoid steal conflicts
                return fn();
              }
              return fn();
            });
          }
          return fn();
        },
      },
      cookies: {
        getAll: () => (canUseCookies() ? fromCookies() : fromStorage()),
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return;
          const clearStr = isSecureContext
            ? '; Path=/; Max-Age=0; SameSite=None; Secure' :'; Path=/; Max-Age=0';
          if (canUseCookies()) {
            cookiesToSet.forEach(({ name, value, options }) =>
              value
                ? setCookie(name, value, options)
                : (document.cookie = `${name}=${clearStr}`)
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
                  document.cookie.split(';').forEach((c) => {
                    const name = c.trim().split('=')[0];
                    if (name.startsWith('sb-') || name.includes('auth-token') || name.includes('supabase')) {
                      document.cookie = isSecureContext
                        ? `${name}=; Path=/; Max-Age=0; SameSite=None; Secure`
                        : `${name}=; Path=/; Max-Age=0`;
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
  if (typeof globalThis !== 'undefined') {
    (globalThis as any)[GLOBAL_KEY] = client;
  }
  return client;
}
