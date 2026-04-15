/**
 * Server-side database client — direct MSSQL connection.
 *
 * Uses the `mssql` package for direct database access in API routes and
 * server components.
 *
 * Configure via environment variables:
 *   DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT
 */

import sql from 'mssql';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'storage', 'install-config.json');

function getDbConfig() {
  let fileConfig: any = {};
  try {
    if (fs.existsSync(configPath)) {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}

  return {
    DB_HOST: fileConfig.DB_HOST || process.env.DB_HOST || '',
    DB_PORT: fileConfig.DB_PORT || process.env.DB_PORT || '10002',
    DB_NAME: fileConfig.DB_NAME || process.env.DB_NAME || '',
    DB_USER: fileConfig.DB_USER || process.env.DB_USER || '',
    DB_PASSWORD: fileConfig.DB_PASSWORD || process.env.DB_PASSWORD || '',
    DATABASE_SSL: fileConfig.DATABASE_SSL || process.env.DATABASE_SSL || 'false',
  };
}

let pool: sql.ConnectionPool | null = null;

function getMssqlConfig(): sql.config {
  const cfg = getDbConfig();
  return {
    server: cfg.DB_HOST,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    port: parseInt(cfg.DB_PORT || '10002', 10),
    options: {
      encrypt: cfg.DATABASE_SSL === 'true',
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;

  const cfg = getMssqlConfig();
  if (!cfg.server || !cfg.database || !cfg.user) {
    throw new Error(
      'MSSQL connection not configured. Set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT environment variables.'
    );
  }

  pool = await new sql.ConnectionPool(cfg).connect();
  return pool;
}

// ─── Query Builder (server-side, uses mssql directly) ────────────────────────

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

  private buildWhereClause(request: sql.Request, paramIndex: { i: number }): string {
    if (this.filters.length === 0) return '';
    const clauses = this.filters.map((f) => {
      if (f.operator === 'IN') {
        const vals = f.value as unknown[];
        const placeholders = vals.map((v, idx) => {
          const pname = `p${paramIndex.i++}`;
          request.input(pname, v);
          return `@${pname}`;
        }).join(', ');
        return `[${f.column}] IN (${placeholders})`;
      }
      if (f.operator === 'IS') {
        return `[${f.column}] IS ${f.value === null ? 'NULL' : f.value ? '1' : '0'}`;
      }
      const pname = `p${paramIndex.i++}`;
      request.input(pname, f.value);
      return `[${f.column}] ${f.operator} @${pname}`;
    });
    return `WHERE ${clauses.join(' AND ')}`;
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    try {
      const p = await getPool();

      if (this.method === 'SELECT' || this.headOnly) {
        const req = p.request();
        const paramIndex = { i: 0 };
        const where = this.buildWhereClause(req, paramIndex);
        const orderBy = this.orders.length
          ? `ORDER BY ${this.orders.map(o => `[${o.column}] ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
          : '';

        if (this.headOnly && this.countMode === 'exact') {
          const result = await req.query(`SELECT COUNT(*) as [count] FROM [${this.table}] ${where}`);
          const count = result.recordset[0]?.count ?? 0;
          return { data: null, error: null, count: parseInt(String(count)) };
        }

        const cols = this.selectCols === '*' ? '*' : this.selectCols;

        // MSSQL uses TOP / OFFSET-FETCH for pagination
        let selectSql: string;
        if (this.offsetVal !== null && this.limitVal !== null) {
          const safeOrder = orderBy || 'ORDER BY (SELECT NULL)';
          selectSql = `SELECT ${cols} FROM [${this.table}] ${where} ${safeOrder} OFFSET ${this.offsetVal} ROWS FETCH NEXT ${this.limitVal} ROWS ONLY`;
        } else if (this.limitVal !== null) {
          selectSql = `SELECT TOP ${this.limitVal} ${cols} FROM [${this.table}] ${where} ${orderBy}`;
        } else {
          selectSql = `SELECT ${cols} FROM [${this.table}] ${where} ${orderBy}`;
        }

        if (this.countMode === 'exact') {
          const countReq = p.request();
          const countParamIndex = { i: 0 };
          const countWhere = this.buildWhereClause(countReq, countParamIndex);
          const countResult = await countReq.query(`SELECT COUNT(*) as [count] FROM [${this.table}] ${countWhere}`);
          const count = parseInt(String(countResult.recordset[0]?.count ?? 0));
          const dataResult = await req.query(selectSql);
          const rows = dataResult.recordset;
          if (this.singleRow) return { data: rows[0] ?? null, error: null, count };
          if (this.maybeSingleRow) return { data: rows[0] ?? null, error: null, count };
          return { data: rows, error: null, count };
        }

        const result = await req.query(selectSql);
        const rows = result.recordset;
        if (this.singleRow) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'No rows found' } };
        if (this.maybeSingleRow) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.method === 'INSERT') {
        const rowsToInsert = Array.isArray(this.bodyData) ? this.bodyData : [this.bodyData];
        const inserted: any[] = [];
        for (const row of rowsToInsert) {
          const req = p.request();
          const keys = Object.keys(row as object);
          const cols = keys.map(k => `[${k}]`).join(', ');
          const placeholders = keys.map((k, i) => { req.input(`v${i}`, (row as any)[k]); return `@v${i}`; }).join(', ');
          const insertSql = `INSERT INTO [${this.table}] (${cols}) OUTPUT INSERTED.* VALUES (${placeholders})`;
          const result = await req.query(insertSql);
          if (result.recordset && result.recordset[0]) {
            inserted.push(result.recordset[0]);
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
        const req = p.request();
        const setClauses = keys.map((k, i) => { req.input(`u${i}`, data[k]); return `[${k}] = @u${i}`; });
        const paramIndex = { i: keys.length };
        const where = this.buildWhereClause(req, paramIndex);
        const updateSql = `UPDATE [${this.table}] SET ${setClauses.join(', ')} OUTPUT INSERTED.* ${where}`;
        const result = await req.query(updateSql);
        const rows = result.recordset ?? [];
        if (this.singleRow) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.method === 'UPSERT') {
        const rowsToUpsert = Array.isArray(this.bodyData) ? this.bodyData : [this.bodyData];
        const upserted: any[] = [];
        const conflictCol = this.upsertConflict || 'id';
        for (const row of rowsToUpsert) {
          const req = p.request();
          const keys = Object.keys(row as object);
          keys.forEach((k, i) => req.input(`m${i}`, (row as any)[k]));
          const srcCols = keys.map((k, i) => `@m${i} AS [${k}]`).join(', ');
          const matchCond = `target.[${conflictCol}] = source.[${conflictCol}]`;
          const updateSet = keys.filter(k => k !== conflictCol).map((k, i) => `target.[${k}] = source.[${k}]`).join(', ');
          const insertCols = keys.map(k => `[${k}]`).join(', ');
          const insertVals = keys.map(k => `source.[${k}]`).join(', ');
          const mergeSql = `
            MERGE [${this.table}] AS target
            USING (SELECT ${srcCols}) AS source
            ON ${matchCond}
            WHEN MATCHED THEN UPDATE SET ${updateSet || `target.[${conflictCol}] = source.[${conflictCol}]`}
            WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals})
            OUTPUT INSERTED.*;
          `;
          const result = await req.query(mergeSql);
          if (result.recordset && result.recordset[0]) {
            upserted.push(result.recordset[0]);
          } else {
            upserted.push(row);
          }
        }
        if (this.singleRow) return { data: upserted[0] ?? null, error: null };
        return { data: upserted, error: null };
      }

      if (this.method === 'DELETE') {
        const req = p.request();
        const paramIndex = { i: 0 };
        const where = this.buildWhereClause(req, paramIndex);
        const deleteSql = `DELETE FROM [${this.table}] OUTPUT DELETED.* ${where}`;
        const result = await req.query(deleteSql);
        return { data: result.recordset ?? [], error: null };
      }

      return { data: null, error: { message: 'Unknown method' } };
    } catch (err: any) {
      console.error(`[DB Server] Query error on table "${this.table}":`, err.message);
      return { data: null, error: { message: err.message || 'Database error' } };
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
