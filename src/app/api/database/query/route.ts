import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
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
    DB_PORT: fileConfig.DB_PORT || process.env.DB_PORT || '3306',
    DB_NAME: fileConfig.DB_NAME || process.env.DB_NAME,
    DB_USER: fileConfig.DB_USER || process.env.DB_USER,
    DB_PASSWORD: fileConfig.DB_PASSWORD || process.env.DB_PASSWORD,
    DATABASE_SSL: fileConfig.DATABASE_SSL || process.env.DATABASE_SSL || 'false',
  };
}

function getDatabaseConnection() {
  const cfg = getDbConfig();
  return mysql.createConnection({
    host: cfg.DB_HOST,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    port: parseInt(cfg.DB_PORT || '3306', 10),
    multipleStatements: false,
    ssl: cfg.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10000,
  });
}

function getQueryType(sql: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER' {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('SHOW') || trimmed.startsWith('DESCRIBE') || trimmed.startsWith('EXPLAIN')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  return 'OTHER';
}

export async function POST(req: NextRequest) {
  let conn: mysql.Connection | null = null;

  try {
    const body = await req.json();
    const { sql } = body;

    if (!sql || typeof sql !== 'string' || !sql.trim()) {
      return NextResponse.json({ error: 'No SQL query provided.' }, { status: 400 });
    }

    const trimmedSql = sql.trim();
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

    conn = await getDatabaseConnection();

    const startTime = Date.now();
    const [result] = await conn.query(trimmedSql);
    const execTimeMs = Date.now() - startTime;

    if (queryType === 'SELECT') {
      const rows = result as mysql.RowDataPacket[];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return NextResponse.json({
        type: 'SELECT',
        columns,
        rows,
        rowCount: rows.length,
        execTimeMs,
      });
    } else {
      const okPacket = result as mysql.ResultSetHeader;
      return NextResponse.json({
        type: queryType,
        affectedRows: okPacket.affectedRows ?? 0,
        insertId: okPacket.insertId ?? null,
        changedRows: (okPacket as any).changedRows ?? 0,
        execTimeMs,
        message: `Query executed successfully. Affected rows: ${okPacket.affectedRows ?? 0}`,
      });
    }
  } catch (err: any) {
    console.error('[/api/database/query] Error:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Query execution failed',
        code: err?.code || null,
        sqlState: err?.sqlState || null,
      },
      { status: 500 }
    );
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
  }
}
