/**
 * Server-side database client — direct MySQL connection.
 *
 * Uses the `mysql2` package for direct database access in API routes and
 * server components. Provides the same query builder interface as the
 * browser client for consistency.
 *
 * Configure via environment variables:
 *   DATABASE_URL  — MySQL connection string
 *                   e.g. mysql://user:pass@host:3306/dbname
 *   or individual vars: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT
 */

import mysql, { Pool, PoolConnection } from 'mysql2/promise';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (connectionString && connectionString.startsWith('mysql://')) {
    pool = mysql.createPool(connectionString + '?waitForConnections=true&connectionLimit=10&queueLimit=0');
  } else {
    const host = process.env.DB_HOST;
    const database = process.env.DB_NAME;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const port = parseInt(process.env.DB_PORT || '3306', 10);

    if (!host || !database || !user) {
      throw new Error(
        'MySQL connection not configured. Set DATABASE_URL=mysql://user:pass@host:3306/dbname ' +
        'or set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT environment variables.'
      );
    }

    pool = mysql.createPool({
      host,
      database,
      user,
      password,
      port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

// ─── Query Builder (server-side, uses mysql2 directly) ────────────────────────

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
    // MySQL LIKE is case-insensitive by default on most collations
    this.filters.push({ column, operator: 'LIKE', value });
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
        const placeholders = vals.map(() => '?').join(', ');
        params.push(...vals);
        return `\`${f.column}\` IN (${placeholders})`;
      }
      if (f.operator === 'IS') {
        return `\`${f.column}\` IS ${f.value === null ? 'NULL' : f.value ? 'TRUE' : 'FALSE'}`;
      }
      params.push(f.value);
      return `\`${f.column}\` ${f.operator} ?`;
    });
    return `WHERE ${clauses.join(' AND ')}`;
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    let conn: PoolConnection | null = null;
    try {
      conn = await getPool().getConnection();
      const params: unknown[] = [];

      if (this.method === 'SELECT' || this.headOnly) {
        const where = this.buildWhereClause(params);
        const orderBy = this.orders.length
          ? `ORDER BY ${this.orders.map(o => `\`${o.column}\` ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
          : '';
        const limitClause = this.limitVal !== null ? `LIMIT ${this.limitVal}` : '';
        const offsetClause = this.offsetVal !== null ? `OFFSET ${this.offsetVal}` : '';

        if (this.headOnly && this.countMode === 'exact') {
          const sql = `SELECT COUNT(*) as count FROM \`${this.table}\` ${where}`;
          const [rows] = await conn.query(sql, params);
          const count = (rows as any[])[0]?.count ?? 0;
          return { data: null, error: null, count: parseInt(String(count)) };
        }

        const cols = this.selectCols === '*' ? '*' : this.selectCols;
        const sql = `SELECT ${cols} FROM \`${this.table}\` ${where} ${orderBy} ${limitClause} ${offsetClause}`.trim();

        if (this.countMode === 'exact') {
          const countSql = `SELECT COUNT(*) as count FROM \`${this.table}\` ${where}`;
          const [countRows] = await conn.query(countSql, params);
          const count = parseInt(String((countRows as any[])[0]?.count ?? 0));
          const [dataRows] = await conn.query(sql, params);
          const rows = dataRows as any[];
          if (this.singleRow) return { data: rows[0] ?? null, error: null, count };
          if (this.maybeSingleRow) return { data: rows[0] ?? null, error: null, count };
          return { data: rows, error: null, count };
        }

        const [rows] = await conn.query(sql, params);
        const rowArr = rows as any[];
        if (this.singleRow) return { data: rowArr[0] ?? null, error: rowArr[0] ? null : { message: 'No rows found' } };
        if (this.maybeSingleRow) return { data: rowArr[0] ?? null, error: null };
        return { data: rowArr, error: null };
      }

      if (this.method === 'INSERT') {
        const rowsToInsert = Array.isArray(this.bodyData) ? this.bodyData : [this.bodyData];
        const inserted: any[] = [];
        for (const row of rowsToInsert) {
          const keys = Object.keys(row as object);
          const cols = keys.map(k => `\`${k}\``).join(', ');
          const placeholders = keys.map(() => '?').join(', ');
          const vals = keys.map(k => (row as any)[k]);
          const sql = `INSERT INTO \`${this.table}\` (${cols}) VALUES (${placeholders})`;
          const [result] = await conn.query(sql, vals);
          const insertId = (result as any).insertId;
          if (insertId) {
            const [selectRows] = await conn.query(`SELECT * FROM \`${this.table}\` WHERE id = ?`, [insertId]);
            const found = (selectRows as any[])[0];
            if (found) inserted.push(found);
            else inserted.push({ ...row, id: insertId });
          } else {
            inserted.push(row);
          }
        }
        if (this.singleRow) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }

      if (this.method === 'UPDATE') {
        const data = this.bodyData as Record<string, unknown>;
        const keys = Object.keys(data);
        const setClauses = keys.map(k => { params.push(data[k]); return `\`${k}\` = ?`; });
        const where = this.buildWhereClause(params);
        const sql = `UPDATE \`${this.table}\` SET ${setClauses.join(', ')} ${where}`;
        await conn.query(sql, params);
        // Fetch updated rows
        const selectParams: unknown[] = [];
        const selectWhere = this.buildWhereClause(selectParams);
        const [updatedRows] = await conn.query(`SELECT * FROM \`${this.table}\` ${selectWhere}`, selectParams);
        const rows = updatedRows as any[];
        if (this.singleRow) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.method === 'UPSERT') {
        const rowsToUpsert = Array.isArray(this.bodyData) ? this.bodyData : [this.bodyData];
        const upserted: any[] = [];
        for (const row of rowsToUpsert) {
          const keys = Object.keys(row as object);
          const cols = keys.map(k => `\`${k}\``).join(', ');
          const placeholders = keys.map(() => '?').join(', ');
          const vals = keys.map(k => (row as any)[k]);
          const updateSet = keys.map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');
          const sql = `INSERT INTO \`${this.table}\` (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateSet}`;
          const [result] = await conn.query(sql, vals);
          const insertId = (result as any).insertId;
          if (insertId) {
            const [selectRows] = await conn.query(`SELECT * FROM \`${this.table}\` WHERE id = ?`, [insertId]);
            const found = (selectRows as any[])[0];
            if (found) upserted.push(found);
            else upserted.push({ ...row, id: insertId });
          } else {
            upserted.push(row);
          }
        }
        if (this.singleRow) return { data: upserted[0] ?? null, error: null };
        return { data: upserted, error: null };
      }

      if (this.method === 'DELETE') {
        // Fetch rows before deleting
        const selectParams: unknown[] = [];
        const selectWhere = this.buildWhereClause(selectParams);
        const [beforeRows] = await conn.query(`SELECT * FROM \`${this.table}\` ${selectWhere}`, selectParams);
        const where = this.buildWhereClause(params);
        await conn.query(`DELETE FROM \`${this.table}\` ${where}`, params);
        return { data: beforeRows as any[], error: null };
      }

      return { data: null, error: { message: 'Unknown method' } };
    } catch (err: any) {
      console.error(`[DB Server] Query error on table "${this.table}":`, err.message);
      return { data: null, error: { message: err.message || 'Database error' } };
    } finally {
      conn?.release();
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
