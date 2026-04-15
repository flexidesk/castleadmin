import { NextResponse } from 'next/server';
import sql from 'mssql';
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
    DB_PORT: fileConfig.DB_PORT || process.env.DB_PORT || '10002',
    DB_NAME: fileConfig.DB_NAME || process.env.DB_NAME,
    DB_USER: fileConfig.DB_USER || process.env.DB_USER,
    DB_PASSWORD: fileConfig.DB_PASSWORD || process.env.DB_PASSWORD,
    DATABASE_SSL: fileConfig.DATABASE_SSL || process.env.DATABASE_SSL || 'false',
  };
}

function getMssqlConfig(dbName?: string): sql.config {
  const cfg = getDbConfig();
  return {
    server: cfg.DB_HOST!,
    database: dbName || cfg.DB_NAME!,
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

function splitStatements(sqlText: string): string[] {
  // Split on GO or semicolons for MSSQL
  const byGo = sqlText.split(/^\s*GO\s*$/im);
  const statements: string[] = [];

  for (const block of byGo) {
    const parts = block.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
      const hasContent = lines.some((l) => !l.trim().startsWith('--'));
      if (hasContent) statements.push(trimmed);
    }
  }

  return statements;
}

function getSqlFile(): { sql: string | null; checkedPaths: string[] } {
  const checkedPaths = [
    path.join(process.cwd(), 'scripts', 'mssql-setup.sql'),
    path.join(process.cwd(), 'scripts', 'mysql-setup.sql'),
    path.join(process.cwd(), 'castleadmin', 'scripts', 'mssql-setup.sql'),
    path.join(path.resolve(process.cwd(), '..'), 'scripts', 'mssql-setup.sql'),
  ];

  for (const sqlPath of checkedPaths) {
    if (fs.existsSync(sqlPath)) {
      return { sql: fs.readFileSync(sqlPath, 'utf-8'), checkedPaths };
    }
  }

  return { sql: null, checkedPaths };
}

export async function POST() {
  let pool: sql.ConnectionPool | null = null;

  try {
    const cfg = getDbConfig();
    const dbName = cfg.DB_NAME;
    if (!dbName) {
      return NextResponse.json(
        { error: 'DB_NAME is not configured in environment variables or install config.' },
        { status: 500 }
      );
    }

    const { sql: sqlText, checkedPaths } = getSqlFile();
    if (!sqlText) {
      return NextResponse.json(
        {
          error: 'Migration file not found.',
          details: `Checked: ${checkedPaths.join(' | ')}`,
        },
        { status: 404 }
      );
    }

    const statements = splitStatements(sqlText);
    if (statements.length === 0) {
      return NextResponse.json(
        { error: 'Migration file was found, but no SQL statements were parsed.' },
        { status: 500 }
      );
    }

    // Connect to master first to ensure DB exists
    const masterConfig = getMssqlConfig('master');
    pool = await new sql.ConnectionPool(masterConfig).connect();

    await pool.request().query(
      `IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${dbName}') CREATE DATABASE [${dbName}]`
    );

    await pool.close();

    // Now connect to the target database
    pool = await new sql.ConnectionPool(getMssqlConfig(dbName)).connect();

    const results: { statement: string; status: 'ok' | 'error'; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const stmt of statements) {
      const preview = stmt.substring(0, 120) + (stmt.length > 120 ? '...' : '');

      try {
        await pool.request().query(stmt);
        successCount++;
        results.push({ statement: preview, status: 'ok' });
      } catch (err: any) {
        const ignorable = [
          'already exists',
          'Duplicate entry',
          'There is already an object named',
          'Column names in each table must be unique',
        ];

        const isIgnorable = ignorable.some((msg) => err?.message?.includes(msg));

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
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}

export async function GET() {
  let pool: sql.ConnectionPool | null = null;

  try {
    pool = await new sql.ConnectionPool(getMssqlConfig()).connect();

    const result = await pool.request().query(
      `SELECT TABLE_NAME as table_name, NULL as table_rows
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`
    );

    return NextResponse.json({ tables: result.recordset });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || 'Failed to read database tables',
        code: err?.code || null,
      },
      { status: 500 }
    );
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}
