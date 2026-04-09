import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export const dynamic = 'force-dynamic';

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

function getServerConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10000,
  });
}

function getDatabaseConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10000,
  });
}

export async function GET() {
  let serverConn: mysql.Connection | null = null;
  let conn: mysql.Connection | null = null;
  const startTime = Date.now();

  try {
    const requiredEnv = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missingEnv = requiredEnv.filter((key) => !process.env[key]);

    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          status: 'error',
          error: `Missing environment variables: ${missingEnv.join(', ')}`,
        },
        { status: 500 }
      );
    }

    serverConn = await getServerConnection();
    await serverConn.ping();

    const connectMs = Date.now() - startTime;
    const dbName = process.env.DB_NAME as string;

    const [dbRows] = await serverConn.query<mysql.RowDataPacket[]>(
      `SELECT SCHEMA_NAME
       FROM INFORMATION_SCHEMA.SCHEMATA
       WHERE SCHEMA_NAME = ?`,
      [dbName]
    );

    const databaseExists = dbRows.length > 0;

    if (!databaseExists) {
      return NextResponse.json({
        status: 'connected',
        database: dbName,
        host: process.env.DB_HOST,
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

    conn = await getDatabaseConnection();
    await conn.ping();

    const [tableRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT table_name, table_rows, create_time, update_time
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name`,
      [dbName]
    );

    const existingTableNames = tableRows.map((r) => r.table_name as string);
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
          const [countRows] = await conn.query<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) AS cnt FROM \`${table}\``
          );
          sampleDataCounts[table] = Number(countRows[0]?.cnt ?? 0);
        } catch {
          sampleDataCounts[table] = -1;
        }
      }
    }

    return NextResponse.json({
      status: 'connected',
      database: dbName,
      host: process.env.DB_HOST,
      connectTimeMs: connectMs,
      databaseExists: true,
      tableCount,
      tables: tableRows.map((r) => ({
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

    return NextResponse.json(
      {
        status: 'error',
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        error: err?.message || 'Unknown database error',
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
