import { NextRequest, NextResponse } from 'next/server';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const configPath = path.join(process.cwd(), 'storage', 'install-config.json');

function getDbConfig() {
  let fileConfig: any = {};
  try {
    if (fs.existsSync(configPath)) {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}

  return {
    DB_HOST: fileConfig.DB_HOST || process.env.DB_HOST,
    DB_PORT: fileConfig.DB_PORT || process.env.DB_PORT || '10002',
    DB_NAME: fileConfig.DB_NAME || process.env.DB_NAME,
    DB_USER: fileConfig.DB_USER || process.env.DB_USER,
    DB_PASSWORD: fileConfig.DB_PASSWORD || process.env.DB_PASSWORD,
    DATABASE_SSL: fileConfig.DATABASE_SSL || process.env.DATABASE_SSL || 'false',
  };
}

function getMssqlConfig(): sql.config {
  const cfg = getDbConfig();
  return {
    server: cfg.DB_HOST!,
    database: cfg.DB_NAME!,
    user: cfg.DB_USER!,
    password: cfg.DB_PASSWORD!,
    port: parseInt(cfg.DB_PORT || '10002', 10),
    options: {
      encrypt: cfg.DATABASE_SSL === 'true',
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

function getQueryType(sqlText: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER' {
  const trimmed = sqlText.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('EXEC') || trimmed.startsWith('EXECUTE') || trimmed.startsWith('WITH')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  return 'OTHER';
}

export async function POST(req: NextRequest) {
  let pool: sql.ConnectionPool | null = null;

  try {
    const body = await req.json();
    const { sql: sqlText } = body;

    if (!sqlText || typeof sqlText !== 'string' || !sqlText.trim()) {
      return NextResponse.json({ error: 'No SQL query provided.' }, { status: 400 });
    }

    const trimmedSql = sqlText.trim();
    const queryType = getQueryType(trimmedSql);

    // Block dangerous DDL operations
    const upperSql = trimmedSql.toUpperCase();
    const blocked = ['DROP DATABASE', 'DROP SCHEMA', 'TRUNCATE', 'DROP TABLE', 'ALTER TABLE', 'CREATE DATABASE'];
    const isBlocked = blocked.some((b) => upperSql.includes(b));
    if (isBlocked) {
      return NextResponse.json(
        { error: 'This query type is blocked for safety. DROP DATABASE, DROP TABLE, TRUNCATE, and ALTER TABLE are not permitted via the query tool.' },
        { status: 403 }
      );
    }

    pool = await new sql.ConnectionPool(getMssqlConfig()).connect();

    const startTime = Date.now();
    const result = await pool.request().query(trimmedSql);
    const execTimeMs = Date.now() - startTime;

    if (queryType === 'SELECT') {
      const rows = result.recordset ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return NextResponse.json({
        type: 'SELECT',
        columns,
        rows,
        rowCount: rows.length,
        execTimeMs,
      });
    } else {
      const rowsAffected = result.rowsAffected?.[0] ?? 0;
      return NextResponse.json({
        type: queryType,
        affectedRows: rowsAffected,
        insertId: null,
        changedRows: rowsAffected,
        execTimeMs,
        message: `Query executed successfully. Affected rows: ${rowsAffected}`,
      });
    }
  } catch (err: any) {
    console.error('[/api/database/query] Error:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Query execution failed',
        code: err?.code || null,
        sqlState: err?.state || null,
      },
      { status: 500 }
    );
  } finally {
    if (pool) {
      try { await pool.close(); } catch {}
    }
  }
}
