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

function getConnection() {
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
  let conn: mysql.Connection | null = null;
  const startTime = Date.now();

  try {
    conn = await getConnection();

    // 1. Verify connectivity with a ping
    await conn.ping();
    const connectMs = Date.now() - startTime;

    // 2. Get all tables in the schema
    const [tableRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT table_name, table_rows, create_time, update_time
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name`,
      [process.env.DB_NAME]
    );

    const existingTableNames = tableRows.map((r) => r.table_name as string);
    const tableCount = existingTableNames.length;

    // 3. Schema verification — check which expected tables are present/missing
    const schemaVerification = EXPECTED_TABLES.map((name) => ({
      table: name,
      exists: existingTableNames.includes(name),
    }));
    const missingTables = schemaVerification.filter((t) => !t.exists).map((t) => t.table);
    const schemaValid = missingTables.length === 0;

    // 4. Sample data counts for key tables that exist
    const sampleTables = ['drivers', 'orders', 'customers', 'vehicles', 'delivery_zones', 'notifications'];
    const sampleDataCounts: Record<string, number> = {};

    for (const table of sampleTables) {
      if (existingTableNames.includes(table)) {
        try {
          const [countRows] = await conn.execute<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) AS cnt FROM \`${table}\``
          );
          sampleDataCounts[table] = countRows[0]?.cnt ?? 0;
        } catch {
          sampleDataCounts[table] = -1; // query failed
        }
      }
    }

    return NextResponse.json({
      status: 'connected',
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      connectTimeMs: connectMs,
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
        error: err.message,
        code: err.code ?? null,
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
