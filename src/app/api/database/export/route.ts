import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/db/server';

const EXPORT_TABLES = [
  'orders', 'drivers', 'customers', 'vehicles', 'driver_locations',
  'driver_performance_logs', 'driver_shifts', 'driver_documents',
  'driver_cash_allocations', 'driver_cash_collections', 'driver_pay_rates',
  'driver_payments', 'driver_zones', 'driver_inspection_schedules',
  'driver_inspection_logs', 'vehicle_inspections', 'vehicle_inspection_items',
  'vehicle_incidents', 'vehicle_incident_images', 'vehicle_insurance',
  'vehicle_tax', 'vehicle_documents', 'delivery_zones', 'message_templates',
  'notifications', 'activity_logs', 'email_alert_logs', 'sms_alert_logs',
  'woocommerce_sync_log', 'woocommerce_webhook_log', 'fleet_config',
  'notification_preferences', 'user_roles', 'system_integrations',
  'driver_rate_settings', 'alert_thresholds', 'company_profile',
  'shift_templates', 'woocommerce_settings', 'system_config', 'api_keys',
  'push_subscriptions', 'driver_pod_submissions',
];

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const db = await createClient();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const table = searchParams.get('table');

    if (table) {
      if (!EXPORT_TABLES.includes(table)) {
        return NextResponse.json({ error: 'Table not allowed for export' }, { status: 400 });
      }
      const { data, error } = await db.from(table).select('*');
      if (error) throw new Error(error.message);
      const rows = data || [];

      if (format === 'csv') {
        const csv = toCSV(rows as Record<string, unknown>[]);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${table}_${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      return new NextResponse(JSON.stringify({ table, rows, exported_at: new Date().toISOString() }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${table}_${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    const backup: Record<string, unknown[]> = {};
    const errors: string[] = [];

    for (const t of EXPORT_TABLES) {
      try {
        const { data, error } = await db.from(t).select('*');
        if (error) {
          errors.push(`${t}: ${error.message}`);
          backup[t] = [];
        } else {
          backup[t] = data || [];
        }
      } catch {
        errors.push(`${t}: fetch failed`);
        backup[t] = [];
      }
    }

    const payload = {
      exported_at: new Date().toISOString(),
      tables: EXPORT_TABLES,
      errors: errors.length > 0 ? errors : undefined,
      data: backup,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="castle_admin_backup_${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
