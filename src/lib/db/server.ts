/**
 * Server-side database client — direct PostgreSQL connection.
 *
 * Uses the `pg` package for direct database access in API routes and
 * server components. Provides the same query builder interface as the
 * browser client for consistency.
 *
 * Configure via environment variables:
 *   DATABASE_URL  — PostgreSQL connection string
 *                   e.g. postgresql://user:pass@host:5432/dbname
 *                   or   mysql://user:pass@host:3306/dbname (for MySQL via mysql2)
 */

import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
      'Set it to your PostgreSQL connection string, e.g.: '+ 'postgresql://user:password@host:5432/database'
    );
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error:', err.message);
  });

  return pool;
}

// ─── Query Builder (server-side, uses pg directly) ────────────────────────────

interface Filter {
  column: string;
  operator: string;
  value: unknown;
}

interface OrderClause {
  column: string;
  ascending: boolean;
}

type Method = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';

class ServerQueryBuilder {
  private table: string;
  private selectCols: string = '*';
  private filters: Filter[] = [];
  private orders: OrderClause[] = [];
  private limitVal: number | null = null;
  private offsetVal: number | null = null;
  private singleRow = false;
  private maybeSingleRow = false;
  private countMode: 'exact' | null = null;
  private headOnly = false;
  private method: Method = 'SELECT';
  private bodyData: unknown = null;
  private upsertConflict: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    this.selectCols = columns;
    if (opts?.count === 'exact') this.countMode = 'exact';
    if (opts?.head) this.headOnly = true;
    return this;
  }

  insert(data: unknown): this {
    this.method = 'INSERT';
    this.bodyData = data;
    return this;
  }

  update(data: unknown): this {
    this.method = 'UPDATE';
    this.bodyData = data;
    return this;
  }

  upsert(data: unknown, opts?: { onConflict?: string }): this {
    this.method = 'UPSERT';
    this.bodyData = data;
    if (opts?.onConflict) this.upsertConflict = opts.onConflict;
    return this;
  }

  delete(): this {
    this.method = 'DELETE';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, operator: '=', value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, operator: '!=', value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, operator: '>', value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, operator: '>=', value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, operator: '<', value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, operator: '<=', value });
    return this;
  }

  like(column: string, value: string): this {
    this.filters.push({ column, operator: 'LIKE', value });
    return this;
  }

  ilike(column: string, value: string): this {
    this.filters.push({ column, operator: 'ILIKE', value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, operator: 'IN', value: values });
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.filters.push({ column, operator: 'IS', value });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetVal = from;
    this.limitVal = to - from + 1;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this.singleRow = true;
    return this.execute();
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this.maybeSingleRow = true;
    this.limitVal = 1;
    return this.execute();
  }

  then<T>(resolve: (value: { data: any; error: any; count?: number | null }) => T): Promise<T> {
    return this.execute().then(resolve);
  }

  private buildWhereClause(params: unknown[]): string {
    if (this.filters.length === 0) return '';
    const clauses = this.filters.map((f) => {
      if (f.operator === 'IN') {
        const vals = f.value as unknown[];
        const placeholders = vals.map((_, i) => `$${params.length + i + 1}`).join(', ');
        params.push(...vals);
        return `"${f.column}" IN (${placeholders})`;
      }
      if (f.operator === 'IS') {
        return `"${f.column}" IS ${f.value === null ? 'NULL' : f.value ? 'TRUE' : 'FALSE'}`;
      }
      params.push(f.value);
      return `"${f.column}" ${f.operator} $${params.length}`;
    });
    return `WHERE ${clauses.join(' AND ')}`;
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const params: unknown[] = [];

      if (this.method === 'SELECT' || this.headOnly) {
        const where = this.buildWhereClause(params);
        const orderBy = this.orders.length
          ? `ORDER BY ${this.orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
          : '';
        const limitClause = this.limitVal !== null ? `LIMIT ${this.limitVal}` : '';
        const offsetClause = this.offsetVal !== null ? `OFFSET ${this.offsetVal}` : '';

        if (this.headOnly && this.countMode === 'exact') {
          const sql = `SELECT COUNT(*) FROM "${this.table}" ${where}`;
          const res = await client.query(sql, params);
          return { data: null, error: null, count: parseInt(res.rows[0].count) };
        }

        const cols = this.selectCols === '*' ? '*' : this.selectCols;
        let sql = `SELECT ${cols} FROM "${this.table}" ${where} ${orderBy} ${limitClause} ${offsetClause}`.trim();

        if (this.countMode === 'exact') {
          const countSql = `SELECT COUNT(*) FROM "${this.table}" ${where}`;
          const countRes = await client.query(countSql, params);
          const count = parseInt(countRes.rows[0].count);
          const dataRes = await client.query(sql, params);
          const rows = dataRes.rows;
          if (this.singleRow) return { data: rows[0] ?? null, error: null, count };
          if (this.maybeSingleRow) return { data: rows[0] ?? null, error: null, count };
          return { data: rows, error: null, count };
        }

        const res = await client.query(sql, params);
        const rows = res.rows;
        if (this.singleRow) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'No rows found' } };
        if (this.maybeSingleRow) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.method === 'INSERT') {
        const rows = Array.isArray(this.bodyData) ? this.bodyData : [this.bodyData];
        const inserted: any[] = [];
        for (const row of rows) {
          const keys = Object.keys(row as object);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const cols = keys.map(k => `"${k}"`).join(', ');
          const vals = keys.map(k => (row as any)[k]);
          const sql = `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders}) RETURNING *`;
          const res = await client.query(sql, vals);
          inserted.push(...res.rows);
        }
        if (this.singleRow) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }

      if (this.method === 'UPDATE') {
        const data = this.bodyData as Record<string, unknown>;
        const keys = Object.keys(data);
        const setClauses = keys.map((k, i) => { params.push(data[k]); return `"${k}" = $${params.length}`; });
        const where = this.buildWhereClause(params);
        const sql = `UPDATE "${this.table}" SET ${setClauses.join(', ')} ${where} RETURNING *`;
        const res = await client.query(sql, params);
        if (this.singleRow) return { data: res.rows[0] ?? null, error: null };
        return { data: res.rows, error: null };
      }

      if (this.method === 'UPSERT') {
        const rows = Array.isArray(this.bodyData) ? this.bodyData : [this.bodyData];
        const upserted: any[] = [];
        for (const row of rows) {
          const keys = Object.keys(row as object);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const cols = keys.map(k => `"${k}"`).join(', ');
          const vals = keys.map(k => (row as any)[k]);
          const conflictCol = this.upsertConflict || 'id';
          const updateSet = keys
            .filter(k => k !== conflictCol)
            .map(k => `"${k}" = EXCLUDED."${k}"`)
            .join(', ');
          const sql = `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateSet} RETURNING *`;
          const res = await client.query(sql, vals);
          upserted.push(...res.rows);
        }
        if (this.singleRow) return { data: upserted[0] ?? null, error: null };
        return { data: upserted, error: null };
      }

      if (this.method === 'DELETE') {
        const where = this.buildWhereClause(params);
        const sql = `DELETE FROM "${this.table}" ${where} RETURNING *`;
        const res = await client.query(sql, params);
        return { data: res.rows, error: null };
      }

      return { data: null, error: { message: 'Unknown method' } };
    } catch (err: any) {
      console.error(`[DB Server] Query error on table "${this.table}":`, err.message);
      return { data: null, error: { message: err.message || 'Database error' } };
    } finally {
      client?.release();
    }
  }
}

// ─── Server DB Client ─────────────────────────────────────────────────────────

export interface ServerDbClient {
  from: (table: string) => ServerQueryBuilder;
}

export async function createClient(): Promise<ServerDbClient> {
  return {
    from: (table: string) => new ServerQueryBuilder(table),
  };
}

export { getPool };
