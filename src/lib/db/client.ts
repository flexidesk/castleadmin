/**
 * Self-hosted database client — PostgREST-compatible REST API wrapper.
 *
 * Drop-in replacement for @supabase/supabase-js browser client.
 * Works with PostgREST, Hasura, or any REST API that follows the same
 * query-parameter conventions.
 *
 * Configure via environment variables:
 *   DB_REST_URL   — e.g. http://localhost:3000  (PostgREST base URL)
 *   DB_API_KEY    — API key / Bearer token (optional)
 */

const DB_REST_URL =
  (typeof window !== 'undefined'
    ? (window as any).__DB_REST_URL__
    : undefined) ||
  process.env.NEXT_PUBLIC_DB_REST_URL ||
  process.env.DB_REST_URL ||
  '';

const DB_API_KEY =
  (typeof window !== 'undefined'
    ? (window as any).__DB_API_KEY__
    : undefined) ||
  process.env.NEXT_PUBLIC_DB_API_KEY ||
  process.env.DB_API_KEY ||
  '';

// ─── Auth token storage (replaces Supabase session) ──────────────────────────

const AUTH_TOKEN_KEY = 'castleadmin-auth-token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {}
}

// ─── Query Builder ────────────────────────────────────────────────────────────

type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

interface Filter {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

interface OrderClause {
  column: string;
  ascending: boolean;
}

interface QueryState {
  table: string;
  selectColumns: string;
  filters: Filter[];
  orders: OrderClause[];
  limitVal: number | null;
  offsetVal: number | null;
  singleRow: boolean;
  maybeSingleRow: boolean;
  countMode: 'exact' | null;
  headOnly: boolean;
  upsertConflict: string | null;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'UPSERT';
  body: unknown;
}

function buildQueryString(state: QueryState): string {
  const params = new URLSearchParams();

  if (state.selectColumns && state.selectColumns !== '*') {
    params.set('select', state.selectColumns);
  } else if (state.selectColumns === '*') {
    // PostgREST default — no need to set
  }

  for (const f of state.filters) {
    let val: string;
    if (f.operator === 'in') {
      val = `in.(${(f.value as unknown[]).join(',')})`;
    } else if (f.operator === 'is') {
      val = `is.${f.value}`;
    } else {
      val = `${f.operator}.${f.value}`;
    }
    params.append(f.column, val);
  }

  for (const o of state.orders) {
    params.append('order', `${o.column}.${o.ascending ? 'asc' : 'desc'}`);
  }

  if (state.limitVal !== null) params.set('limit', String(state.limitVal));
  if (state.offsetVal !== null) params.set('offset', String(state.offsetVal));

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
  if (DB_API_KEY) {
    headers['apikey'] = DB_API_KEY;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function executeQuery(state: QueryState): Promise<{ data: any; error: any; count?: number | null }> {
  if (!DB_REST_URL) {
    console.error('[DB] DB_REST_URL is not configured. Set NEXT_PUBLIC_DB_REST_URL in your .env file.');
    return { data: null, error: { message: 'Database not configured. Set NEXT_PUBLIC_DB_REST_URL.' } };
  }

  const qs = buildQueryString(state);
  const url = `${DB_REST_URL}/${state.table}${qs}`;

  const extraHeaders: Record<string, string> = {};

  if (state.singleRow) {
    extraHeaders['Accept'] = 'application/vnd.pgrst.object+json';
  }

  if (state.countMode === 'exact') {
    extraHeaders['Prefer'] = 'count=exact';
  }

  if (state.headOnly) {
    try {
      const res = await fetch(url, { method: 'HEAD', headers: getHeaders(extraHeaders) });
      const countHeader = res.headers.get('Content-Range');
      let count: number | null = null;
      if (countHeader) {
        const match = countHeader.match(/\/(\d+)$/);
        if (match) count = parseInt(match[1]);
      }
      return { data: null, error: null, count };
    } catch (err: any) {
      return { data: null, error: { message: err.message }, count: null };
    }
  }

  let method = 'GET';
  let body: string | undefined;

  switch (state.method) {
    case 'POST':
      method = 'POST';
      extraHeaders['Prefer'] = 'return=representation';
      body = JSON.stringify(state.body);
      break;
    case 'PATCH':
      method = 'PATCH';
      extraHeaders['Prefer'] = 'return=representation';
      body = JSON.stringify(state.body);
      break;
    case 'DELETE':
      method = 'DELETE';
      extraHeaders['Prefer'] = 'return=representation';
      break;
    case 'UPSERT':
      method = 'POST';
      extraHeaders['Prefer'] = state.upsertConflict
        ? `resolution=merge-duplicates,return=representation`
        : 'return=representation';
      if (state.upsertConflict) {
        extraHeaders['on-conflict'] = state.upsertConflict;
      }
      body = JSON.stringify(state.body);
      break;
  }

  try {
    const res = await fetch(url, {
      method,
      headers: getHeaders(extraHeaders),
      body,
    });

    // Count from Content-Range header
    let count: number | null = null;
    const contentRange = res.headers.get('Content-Range');
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) count = parseInt(match[1]);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      let errObj: any = { message: errText, status: res.status };
      try { errObj = { ...JSON.parse(errText), status: res.status }; } catch {}
      return { data: null, error: errObj, count };
    }

    // 204 No Content
    if (res.status === 204) {
      return { data: state.singleRow ? null : [], error: null, count };
    }

    const text = await res.text();
    if (!text) return { data: state.singleRow ? null : [], error: null, count };

    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return { data: null, error: { message: 'Invalid JSON response' }, count };
    }

    if (state.maybeSingleRow) {
      return { data: Array.isArray(parsed) ? (parsed[0] ?? null) : parsed, error: null, count };
    }

    return { data: parsed, error: null, count };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error' } };
  }
}

// ─── Query Builder Class ──────────────────────────────────────────────────────

class QueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = {
      table,
      selectColumns: '*',
      filters: [],
      orders: [],
      limitVal: null,
      offsetVal: null,
      singleRow: false,
      maybeSingleRow: false,
      countMode: null,
      headOnly: false,
      upsertConflict: null,
      method: 'GET',
      body: null,
    };
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    this.state.selectColumns = columns;
    if (opts?.count === 'exact') this.state.countMode = 'exact';
    if (opts?.head) this.state.headOnly = true;
    return this;
  }

  insert(data: unknown): this {
    this.state.method = 'POST';
    this.state.body = data;
    return this;
  }

  update(data: unknown): this {
    this.state.method = 'PATCH';
    this.state.body = data;
    return this;
  }

  upsert(data: unknown, opts?: { onConflict?: string }): this {
    this.state.method = 'UPSERT';
    this.state.body = data;
    if (opts?.onConflict) this.state.upsertConflict = opts.onConflict;
    return this;
  }

  delete(): this {
    this.state.method = 'DELETE';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.state.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.state.filters.push({ column, operator: 'neq', value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.state.filters.push({ column, operator: 'gt', value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.state.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.state.filters.push({ column, operator: 'lt', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.state.filters.push({ column, operator: 'lte', value });
    return this;
  }

  like(column: string, value: string): this {
    this.state.filters.push({ column, operator: 'like', value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.state.filters.push({ column, operator: 'ilike', value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.state.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.state.filters.push({ column, operator: 'is', value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.state.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.state.limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this.state.offsetVal = from;
    this.state.limitVal = to - from + 1;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.state.singleRow = true;
    return executeQuery(this.state);
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this.state.maybeSingleRow = true;
    this.state.limitVal = 1;
    return executeQuery(this.state);
  }

  then<T>(resolve: (value: { data: any; error: any; count?: number | null }) => T): Promise<T> {
    return executeQuery(this.state).then(resolve);
  }
}

// ─── No-op Realtime stub (replaces Supabase Realtime) ────────────────────────

class NoopChannel {
  on(_event: string, _filter: unknown, _callback?: unknown): this { return this; }
  subscribe(_callback?: (status: string) => void): this {
    _callback?.('SUBSCRIBED');
    return this;
  }
  unsubscribe(): Promise<void> { return Promise.resolve(); }
}

// ─── Auth stub (replaced by custom JWT auth) ──────────────────────────────────

export const dbAuth = {
  async signInWithPassword(credentials: { email: string; password: string }) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      setAuthToken(data.token);
      return { data: { user: data.user, session: { access_token: data.token } }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  },

  async signUp(credentials: { email: string; password: string; options?: any }) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          full_name: credentials.options?.data?.full_name || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setAuthToken(data.token);
      return { data: { user: data.user, session: { access_token: data.token } }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  },

  async signOut() {
    setAuthToken(null);
    // Clear all auth-related storage
    try {
      Object.keys(localStorage)
        .filter(k => k.includes('castleadmin') || k.includes('auth'))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
    return { error: null };
  },

  async getUser() {
    const token = getAuthToken();
    if (!token) return { data: { user: null }, error: null };
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setAuthToken(null);
        return { data: { user: null }, error: null };
      }
      const user = await res.json();
      return { data: { user }, error: null };
    } catch {
      return { data: { user: null }, error: null };
    }
  },

  async getSession() {
    const token = getAuthToken();
    if (!token) return { data: { session: null }, error: null };
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setAuthToken(null);
        return { data: { session: null }, error: null };
      }
      const user = await res.json();
      return { data: { session: { access_token: token, user } }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async updateUser(updates: { password?: string; email?: string }) {
    const token = getAuthToken();
    if (!token) return { data: null, error: { message: 'Not authenticated' } };
    try {
      const res = await fetch('/api/auth/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: { message: data.error || 'Update failed' } };
      return { data: { user: data.user }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  },

  async resetPasswordForEmail(email: string, opts?: { redirectTo?: string }) {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo: opts?.redirectTo }),
      });
      const data = await res.json();
      if (!res.ok) return { error: { message: data.error || 'Failed to send reset email' } };
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message } };
    }
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    // Fire INITIAL_SESSION on mount
    const token = getAuthToken();
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(user => {
          if (user) {
            callback('INITIAL_SESSION', { access_token: token, user });
          } else {
            setAuthToken(null);
            callback('INITIAL_SESSION', null);
          }
        })
        .catch(() => {
          callback('INITIAL_SESSION', null);
        });
    } else {
      setTimeout(() => callback('INITIAL_SESSION', null), 0);
    }

    // Listen for storage changes (cross-tab logout)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AUTH_TOKEN_KEY && !e.newValue) {
        callback('SIGNED_OUT', null);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            if (typeof window !== 'undefined') {
              window.removeEventListener('storage', handleStorage);
            }
          },
        },
      },
    };
  },
};

// ─── Main DB Client ───────────────────────────────────────────────────────────

export interface DbClient {
  from: (table: string) => QueryBuilder;
  auth: typeof dbAuth;
  channel: (name: string) => NoopChannel;
  removeChannel: (channel: NoopChannel) => void;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: File | Blob) => Promise<{ data: any; error: any }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ error: any }>;
    };
  };
}

let _dbClient: DbClient | null = null;

export function createClient(): DbClient {
  if (_dbClient) return _dbClient;

  _dbClient = {
    from: (table: string) => new QueryBuilder(table),
    auth: dbAuth,
    channel: (_name: string) => new NoopChannel(),
    removeChannel: (_channel: NoopChannel) => {},
    storage: {
      from: (bucket: string) => ({
        async upload(path: string, file: File | Blob) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('bucket', bucket);
            formData.append('path', path);
            const token = getAuthToken();
            const res = await fetch('/api/storage/upload', {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });
            const data = await res.json();
            if (!res.ok) return { data: null, error: { message: data.error || 'Upload failed' } };
            return { data, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err.message } };
          }
        },
        getPublicUrl(path: string) {
          const base = process.env.NEXT_PUBLIC_STORAGE_URL || '/api/storage';
          return { data: { publicUrl: `${base}/${bucket}/${path}` } };
        },
        async remove(paths: string[]) {
          try {
            const token = getAuthToken();
            const res = await fetch('/api/storage/delete', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ bucket, paths }),
            });
            if (!res.ok) return { error: { message: 'Delete failed' } };
            return { error: null };
          } catch (err: any) {
            return { error: { message: err.message } };
          }
        },
      }),
    },
  };

  return _dbClient;
}
