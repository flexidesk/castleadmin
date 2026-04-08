import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    multipleStatements: true,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
}

function splitStatements(sql: string): string[] {
  // Split on semicolons but respect strings and comments
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Handle line comments
    if (!inString && ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }

    // Handle string literals
    if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
      inString = true;
      stringChar = ch;
      current += ch;
      i++;
      continue;
    }
    if (inString && ch === stringChar) {
      // Check for escaped quote
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
      if (trimmed.length > 0) {
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
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements.filter(s => s.length > 0 && !s.startsWith('--'));
}

export async function POST() {
  let conn: mysql.Connection | null = null;

  try {
    const sqlPath = path.join(process.cwd(), 'scripts', 'mysql-setup.sql');
    
    if (!fs.existsSync(sqlPath)) {
      return NextResponse.json({ error: 'Migration file not found at scripts/mysql-setup.sql' }, { status: 404 });
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    const statements = splitStatements(sqlContent);

    conn = await getConnection();

    const results: { statement: string; status: 'ok' | 'error'; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of statements) {
      try {
        await conn.execute(stmt);
        successCount++;
        results.push({ statement: stmt.substring(0, 80) + (stmt.length > 80 ? '...' : ''), status: 'ok' });
      } catch (err: any) {
        // Ignore "already exists" type errors for idempotency
        const ignorable = [
          'already exists',
          'Duplicate entry',
          'ER_DUP_ENTRY',
          'ER_TABLE_EXISTS_ERROR',
          'ER_DUP_KEYNAME',
        ];
        const isIgnorable = ignorable.some(msg => err.message?.includes(msg) || err.code === msg);

        if (isIgnorable) {
          successCount++;
          results.push({ statement: stmt.substring(0, 80) + '...', status: 'ok' });
        } else {
          errorCount++;
          results.push({
            statement: stmt.substring(0, 80) + (stmt.length > 80 ? '...' : ''),
            status: 'error',
            error: err.message,
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
      errors: results.filter(r => r.status === 'error'),
    });
  } catch (err: any) {
    console.error('Database setup error:', err);
    return NextResponse.json(
      { error: 'Database connection failed', details: err.message },
      { status: 500 }
    );
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

export async function GET() {
  // Check which tables exist
  let conn: mysql.Connection | null = null;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(
      `SELECT table_name, table_rows 
       FROM information_schema.tables 
       WHERE table_schema = ? 
       ORDER BY table_name`,
      [process.env.DB_NAME]
    );
    return NextResponse.json({ tables: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}
