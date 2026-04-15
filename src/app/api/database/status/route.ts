import { NextResponse } from 'next/server';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const configPath = path.join(process.cwd(), 'storage', 'install-config.json');

const EXPECTED_TABLES = [
  'drivers',
  'orders',
  'vehicles',
  'customers',
  'delivery_zones',
  'message_templates',
  'notifications',
  'activity_logs',
  'driver_locations',
  'driver_earnings',
  'driver_documents',
  'driver_performance',
  'settings',
  'fleet_config',
];

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

export async function GET() {
  let masterPool: sql.ConnectionPool | null = null;
  let dbPool: sql.ConnectionPool | null = null;
  const startTime = Date.now();

  try {
    const cfg = getDbConfig();

    const requiredKeys = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
    const missingKeys = requiredKeys.filter((key) => !cfg[key]);

    if (missingKeys.length > 0) {
      return NextResponse.json(
        {
          status: 'error',
          error: `Missing required config: ${missingKeys.join(', ')}. Set them via the installer form or environment variables.`,
        },
        { status: 500 }
      );
    }

    // Connect to master to check connectivity and database existence
    masterPool = await new sql.ConnectionPool(getMssqlConfig('master')).connect();
    const connectMs = Date.now() - startTime;
    const dbName = cfg.DB_NAME as string;

    const dbCheckResult = await masterPool.request()
      .input('dbName', sql.NVarChar, dbName)
      .query(`SELECT name FROM sys.databases WHERE name = @dbName`);

    const databaseExists = dbCheckResult.recordset.length > 0;

    if (!databaseExists) {
      return NextResponse.json({
        status: 'connected',
        database: dbName,
        host: cfg.DB_HOST,
        connectTimeMs: connectMs,
        databaseExists: false,
        tableCount: 0,
        tables: [],
        schemaVerification: {
          valid: false,
          expectedTableCount: EXPECTED_TABLES.length,
          foundCount: 0,
          missingTables: EXPECTED_TABLES,
          details: EXPECTED_TABLES.map((table) => ({ table, exists: false })),
        },
        sampleDataCounts: {},
      });
    }

    // Connect to the actual database
    dbPool = await new sql.ConnectionPool(getMssqlConfig(dbName)).connect();

    const tableResult = await dbPool.request().query(
      `SELECT TABLE_NAME as table_name, NULL as table_rows, NULL as create_time, NULL as update_time
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`
    );

    const existingTableNames = tableResult.recordset.map((r: any) => r.table_name as string);
    const tableCount = existingTableNames.length;

    const schemaVerification = EXPECTED_TABLES.map((name) => ({
      table: name,
      exists: existingTableNames.includes(name),
    }));

    const missingTables = schemaVerification.filter((t) => !t.exists).map((t) => t.table);
    const schemaValid = missingTables.length === 0;

    const sampleTables = ['drivers', 'orders', 'customers', 'vehicles', 'delivery_zones', 'notifications'];
    const sampleDataCounts: Record<string, number> = {};

    for (const table of sampleTables) {
      if (existingTableNames.includes(table)) {
        try {
          const countResult = await dbPool.request().query(
            `SELECT COUNT(*) AS cnt FROM [${table}]`
          );
          sampleDataCounts[table] = Number(countResult.recordset[0]?.cnt ?? 0);
        } catch {
          sampleDataCounts[table] = -1;
        }
      }
    }

    return NextResponse.json({
      status: 'connected',
      database: dbName,
      host: cfg.DB_HOST,
      connectTimeMs: connectMs,
      databaseExists: true,
      tableCount,
      tables: tableResult.recordset.map((r: any) => ({
        name: r.table_name,
        estimatedRows: r.table_rows ?? 0,
        createdAt: r.create_time ?? null,
        updatedAt: r.update_time ?? null,
      })),
      schemaVerification: {
        valid: schemaValid,
        expectedTableCount: EXPECTED_TABLES.length,
        foundCount: EXPECTED_TABLES.filter((t) => existingTableNames.includes(t)).length,
        missingTables,
        details: schemaVerification,
      },
      sampleDataCounts,
    });
  } catch (err: any) {
    console.error('[/api/database/status] Error:', err);
    const cfg = getDbConfig();

    return NextResponse.json(
      {
        status: 'error',
        database: cfg.DB_NAME,
        host: cfg.DB_HOST,
        error: err?.message || 'Unknown database error',
        code: err?.code || null,
      },
      { status: 500 }
    );
  } finally {
    if (dbPool) {
      try { await dbPool.close(); } catch {}
    }
    if (masterPool) {
      try { await masterPool.close(); } catch {}
    }
  }
}
