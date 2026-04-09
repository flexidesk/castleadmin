import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function getServerConnection() {
  const cfg = getDbConfig();

  return mysql.createConnection({
    host: cfg.DB_HOST,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    port: parseInt(cfg.DB_PORT || '3306', 10),
    multipleStatements: false,
    ssl: cfg.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10000,
  });
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

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (!inString && ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }

    if (!inString && ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
      inString = true;
      stringChar = ch;
      current += ch;
      i++;
      continue;
    }

    if (inString && ch === stringChar) {
      if (sql[i + 1] === stringChar) {
        current += ch + ch;
        i += 2;
        continue;
      }
      inString = false;
      current += ch;
      i++;
      continue;
    }

    if (!inString && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements.filter((s) => {
    const clean = s.trim();
    if (!clean) return false;
    const lines = clean.split('\n').filter((l) => l.trim().length > 0);
    return lines.some((l) => !l.trim().startsWith('--'));
  });
}

function getSqlFile(): { sql: string | null; checkedPaths: string[] } {
  const checkedPaths = [
    path.join(process.cwd(), 'scripts', 'mysql-setup.sql'),
    path.join(process.cwd(), 'castleadmin', 'scripts', 'mysql-setup.sql'),
    path.join(path.resolve(process.cwd(), '..'), 'scripts', 'mysql-setup.sql'),
  ];

  for (const sqlPath of checkedPaths) {
    if (fs.existsSync(sqlPath)) {
      return { sql: fs.readFileSync(sqlPath, 'utf-8'), checkedPaths };
    }
  }

  return { sql: null, checkedPaths };
}

export async function POST() {
  let serverConn: mysql.Connection | null = null;
  let conn: mysql.Connection | null = null;

  try {
    const cfg = getDbConfig();
    const dbName = cfg.DB_NAME;
    if (!dbName) {
      return NextResponse.json(
        { error: 'DB_NAME is not configured in environment variables or install config.' },
        { status: 500 }
      );
    }

    const { sql, checkedPaths } = getSqlFile();
    if (!sql) {
      return NextResponse.json(
        {
          error: 'Migration file not found.',
          details: `Checked: ${checkedPaths.join(' | ')}`,
        },
        { status: 404 }
      );
    }

    const statements = splitStatements(sql);
    if (statements.length === 0) {
      return NextResponse.json(
        { error: 'Migration file was found, but no SQL statements were parsed.' },
        { status: 500 }
      );
    }

    serverConn = await getServerConnection();

    await serverConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    conn = await getDatabaseConnection();

    await conn.query(`SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'`);

    const results: { statement: string; status: 'ok' | 'error'; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of statements) {
      const preview = stmt.substring(0, 120) + (stmt.length > 120 ? '...' : '');

      try {
        await conn.query(stmt);
        successCount++;
        results.push({ statement: preview, status: 'ok' });
      } catch (err: any) {
        const ignorable = [
          'already exists',
          'Duplicate entry',
          'ER_DUP_ENTRY',
          'ER_TABLE_EXISTS_ERROR',
          'ER_DUP_KEYNAME',
          'Duplicate key name',
        ];

        const isIgnorable = ignorable.some(
          (msg) => err?.message?.includes(msg) || err?.code === msg
        );

        if (isIgnorable) {
          successCount++;
          results.push({ statement: preview, status: 'ok' });
        } else {
          errorCount++;
          results.push({
            statement: preview,
            status: 'error',
            error: err?.message || 'Unknown SQL error',
          });
        }
      }
    }

    return NextResponse.json({
      success: errorCount === 0,
      message: `Migration complete: ${successCount} statements succeeded, ${errorCount} failed`,
      totalStatements: statements.length,
      successCount,
      errorCount,
      errors: results.filter((r) => r.status === 'error'),
    });
  } catch (err: any) {
    console.error('Database setup error:', err);

    return NextResponse.json(
      {
        error: 'Database setup failed',
        details: err?.message || 'Unknown error',
        code: err?.code || null,
      },
      { status: 500 }
    );
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }

    if (serverConn) {
      try {
        await serverConn.end();
      } catch {}
    }
  }
}

export async function GET() {
  let conn: mysql.Connection | null = null;

  try {
    const cfg = getDbConfig();
    conn = await getDatabaseConnection();

    const [rows] = await conn.query(
      `SELECT table_name, table_rows
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name`,
      [cfg.DB_NAME]
    );

    return NextResponse.json({ tables: rows });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Failed to read database tables',
        code: err?.code || null,
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
