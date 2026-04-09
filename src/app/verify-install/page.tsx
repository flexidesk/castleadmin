'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Table2,
  BarChart3,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Clock,
  Server,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

interface TableDetail {
  name: string;
  estimatedRows: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface SchemaVerificationDetail {
  table: string;
  exists: boolean;
}

interface StatusResult {
  status: 'connected' | 'error';
  database?: string;
  host?: string;
  connectTimeMs?: number;
  tableCount: number;
  tables: TableDetail[];
  schemaVerification: {
    valid: boolean;
    expectedTableCount: number;
    foundCount: number;
    missingTables: string[];
    details: SchemaVerificationDetail[];
  };
  sampleDataCounts: Record<string, number>;
  error?: string;
}

const CRITICAL_TABLES = [
  { name: 'drivers', label: 'Drivers', icon: '🚗' },
  { name: 'orders', label: 'Orders', icon: '📦' },
  { name: 'vehicles', label: 'Vehicles', icon: '🚙' },
  { name: 'customers', label: 'Customers', icon: '👥' },
  { name: 'delivery_zones', label: 'Delivery Zones', icon: '🗺️' },
  { name: 'message_templates', label: 'Message Templates', icon: '✉️' },
  { name: 'notifications', label: 'Notifications', icon: '🔔' },
  { name: 'activity_logs', label: 'Activity Logs', icon: '📋' },
  { name: 'driver_locations', label: 'Driver Locations', icon: '📍' },
  { name: 'driver_earnings', label: 'Driver Earnings', icon: '💷' },
  { name: 'driver_documents', label: 'Driver Documents', icon: '📄' },
  { name: 'driver_performance', label: 'Driver Performance', icon: '📈' },
  { name: 'settings', label: 'Settings', icon: '⚙️' },
  { name: 'fleet_config', label: 'Fleet Config', icon: '🏢' },
];

const SAMPLE_DATA_TABLES = [
  { name: 'drivers', label: 'Drivers' },
  { name: 'orders', label: 'Orders' },
  { name: 'customers', label: 'Customers' },
  { name: 'vehicles', label: 'Vehicles' },
  { name: 'delivery_zones', label: 'Delivery Zones' },
  { name: 'notifications', label: 'Notifications' },
];

export default function VerifyInstallPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showAllTables, setShowAllTables] = useState(false);
  const [showMissingTables, setShowMissingTables] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/database/status');
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Ensure the API route is accessible.`);
      }
      if (data.status === 'error') throw new Error(data.error || 'Database check failed');
      setResult(data);
      setLastChecked(new Date());
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const connectionOk = result?.status === 'connected';
  const schemaOk = result?.schemaVerification?.valid ?? false;
  const sampleDataOk = Object.values(result?.sampleDataCounts ?? {}).some((v) => v > 0);

  const overallStatus = !result
    ? 'unknown'
    : !connectionOk
    ? 'error'
    : !schemaOk
    ? 'warning' :'ok';

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl p-2"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <AppLogo size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                Post-Install Verification
              </h1>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Database health check &amp; schema validation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <Clock size={12} />
                {lastChecked.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={runCheck}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                backgroundColor: 'hsl(var(--card))',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && !result && (
          <div
            className="rounded-2xl border p-12 text-center"
            style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
          >
            <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: 'hsl(var(--primary))' }} />
            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              Checking database…
            </p>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Connecting and validating schema
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            className="rounded-2xl border p-6 mb-6"
            style={{
              backgroundColor: 'hsl(var(--destructive) / 0.06)',
              borderColor: 'hsl(var(--destructive) / 0.3)',
            }}
          >
            <div className="flex items-start gap-3">
              <WifiOff size={20} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--destructive))' }} />
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: 'hsl(var(--destructive))' }}>
                  Connection Failed
                </p>
                <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {result && !loading && (
          <>
            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {/* Connection Status */}
              <div
                className="rounded-2xl border p-5"
                style={{
                  backgroundColor: connectionOk
                    ? 'hsl(142 76% 36% / 0.06)'
                    : 'hsl(var(--destructive) / 0.06)',
                  borderColor: connectionOk
                    ? 'hsl(142 76% 36% / 0.25)'
                    : 'hsl(var(--destructive) / 0.25)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  {connectionOk ? (
                    <Wifi size={18} style={{ color: 'hsl(142 76% 36%)' }} />
                  ) : (
                    <WifiOff size={18} style={{ color: 'hsl(var(--destructive))' }} />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Connection
                  </span>
                </div>
                <p
                  className="text-lg font-bold mb-0.5"
                  style={{ color: connectionOk ? 'hsl(142 76% 36%)' : 'hsl(var(--destructive))' }}
                >
                  {connectionOk ? 'Connected' : 'Failed'}
                </p>
                {connectionOk && (
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {result.connectTimeMs}ms · {result.database}
                  </p>
                )}
              </div>

              {/* Schema Status */}
              <div
                className="rounded-2xl border p-5"
                style={{
                  backgroundColor: schemaOk
                    ? 'hsl(142 76% 36% / 0.06)'
                    : 'hsl(38 92% 50% / 0.06)',
                  borderColor: schemaOk
                    ? 'hsl(142 76% 36% / 0.25)'
                    : 'hsl(38 92% 50% / 0.25)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Table2
                    size={18}
                    style={{ color: schemaOk ? 'hsl(142 76% 36%)' : 'hsl(38 92% 50%)' }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Schema
                  </span>
                </div>
                <p
                  className="text-lg font-bold mb-0.5"
                  style={{ color: schemaOk ? 'hsl(142 76% 36%)' : 'hsl(38 92% 50%)' }}
                >
                  {schemaOk ? 'Valid' : 'Incomplete'}
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {result.schemaVerification.foundCount}/{result.schemaVerification.expectedTableCount} critical tables
                </p>
              </div>

              {/* Total Tables */}
              <div
                className="rounded-2xl border p-5"
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Server size={18} style={{ color: 'hsl(var(--primary))' }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Total Tables
                  </span>
                </div>
                <p className="text-lg font-bold mb-0.5" style={{ color: 'hsl(var(--foreground))' }}>
                  {result.tableCount}
                </p>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  tables in {result.database}
                </p>
              </div>
            </div>

            {/* ── Critical Tables Schema Check ── */}
            <div
              className="rounded-2xl border mb-6 overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center gap-2">
                  <Table2 size={16} style={{ color: 'hsl(var(--primary))' }} />
                  <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                    Critical Tables
                  </h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: schemaOk ? 'hsl(142 76% 36% / 0.1)' : 'hsl(38 92% 50% / 0.1)',
                      color: schemaOk ? 'hsl(142 76% 36%)' : 'hsl(38 92% 50%)',
                    }}
                  >
                    {result.schemaVerification.foundCount}/{result.schemaVerification.expectedTableCount}
                  </span>
                </div>
                {schemaOk ? (
                  <CheckCircle2 size={16} style={{ color: 'hsl(142 76% 36%)' }} />
                ) : (
                  <AlertTriangle size={16} style={{ color: 'hsl(38 92% 50%)' }} />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: 'hsl(var(--border))' }}>
                {/* Left column */}
                <div>
                  {CRITICAL_TABLES.slice(0, Math.ceil(CRITICAL_TABLES.length / 2)).map((ct, idx) => {
                    const exists = result.schemaVerification.details?.find((d) => d.table === ct.name)?.exists ?? false;
                    return (
                      <div
                        key={ct.name}
                        className="flex items-center justify-between px-5 py-3 border-b last:border-b-0"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{ct.icon}</span>
                          <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                            {ct.label}
                          </span>
                          <code
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: 'hsl(var(--muted) / 0.5)',
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {ct.name}
                          </code>
                        </div>
                        {exists ? (
                          <CheckCircle2 size={16} style={{ color: 'hsl(142 76% 36%)' }} />
                        ) : (
                          <XCircle size={16} style={{ color: 'hsl(var(--destructive))' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Right column */}
                <div>
                  {CRITICAL_TABLES.slice(Math.ceil(CRITICAL_TABLES.length / 2)).map((ct) => {
                    const exists = result.schemaVerification.details?.find((d) => d.table === ct.name)?.exists ?? false;
                    return (
                      <div
                        key={ct.name}
                        className="flex items-center justify-between px-5 py-3 border-b last:border-b-0"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{ct.icon}</span>
                          <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                            {ct.label}
                          </span>
                          <code
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: 'hsl(var(--muted) / 0.5)',
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {ct.name}
                          </code>
                        </div>
                        {exists ? (
                          <CheckCircle2 size={16} style={{ color: 'hsl(142 76% 36%)' }} />
                        ) : (
                          <XCircle size={16} style={{ color: 'hsl(var(--destructive))' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Missing tables callout */}
              {result.schemaVerification.missingTables.length > 0 && (
                <div
                  className="px-5 py-4 border-t"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    backgroundColor: 'hsl(var(--destructive) / 0.04)',
                  }}
                >
                  <button
                    onClick={() => setShowMissingTables(!showMissingTables)}
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: 'hsl(var(--destructive))' }}
                  >
                    {showMissingTables ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {result.schemaVerification.missingTables.length} missing table
                    {result.schemaVerification.missingTables.length !== 1 ? 's' : ''} — run installer to fix
                  </button>
                  {showMissingTables && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {result.schemaVerification.missingTables.map((t) => (
                        <span
                          key={t}
                          className="text-xs px-2 py-0.5 rounded-full font-mono"
                          style={{
                            backgroundColor: 'hsl(var(--destructive) / 0.08)',
                            color: 'hsl(var(--destructive))',
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Sample Data Counts ── */}
            <div
              className="rounded-2xl border mb-6 overflow-hidden"
              style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
            >
              <div
                className="flex items-center gap-2 px-5 py-4 border-b"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <BarChart3 size={16} style={{ color: 'hsl(var(--primary))' }} />
                <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                  Sample Data Validation
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px" style={{ backgroundColor: 'hsl(var(--border))' }}>
                {SAMPLE_DATA_TABLES.map((t) => {
                  const count = result.sampleDataCounts?.[t.name];
                  const tableExists = result.schemaVerification.details?.find((d) => d.table === t.name)?.exists ?? false;
                  const hasData = typeof count === 'number' && count > 0;
                  const failed = count === -1;

                  return (
                    <div
                      key={t.name}
                      className="p-4"
                      style={{ backgroundColor: 'hsl(var(--card))' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {t.label}
                        </span>
                        {!tableExists ? (
                          <XCircle size={13} style={{ color: 'hsl(var(--destructive))' }} />
                        ) : failed ? (
                          <AlertTriangle size={13} style={{ color: 'hsl(38 92% 50%)' }} />
                        ) : hasData ? (
                          <CheckCircle2 size={13} style={{ color: 'hsl(142 76% 36%)' }} />
                        ) : (
                          <AlertTriangle size={13} style={{ color: 'hsl(38 92% 50%)' }} />
                        )}
                      </div>
                      <p
                        className="text-2xl font-bold"
                        style={{
                          color: !tableExists
                            ? 'hsl(var(--muted-foreground))'
                            : failed
                            ? 'hsl(38 92% 50%)'
                            : hasData
                            ? 'hsl(var(--foreground))'
                            : 'hsl(38 92% 50%)',
                        }}
                      >
                        {!tableExists ? '—' : failed ? 'Err' : count ?? 0}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {!tableExists
                          ? 'Table missing'
                          : failed
                          ? 'Query failed'
                          : hasData
                          ? 'records found' :'no data — run installer'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── All Tables in Database ── */}
            {result.tables.length > 0 && (
              <div
                className="rounded-2xl border mb-6 overflow-hidden"
                style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
              >
                <button
                  onClick={() => setShowAllTables(!showAllTables)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Database size={16} style={{ color: 'hsl(var(--primary))' }} />
                    <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      All Database Tables
                    </h2>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {result.tables.length}
                    </span>
                  </div>
                  {showAllTables ? (
                    <ChevronUp size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  ) : (
                    <ChevronDown size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                  )}
                </button>

                {showAllTables && (
                  <div className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div
                      className="grid grid-cols-3 px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                      style={{
                        color: 'hsl(var(--muted-foreground))',
                        backgroundColor: 'hsl(var(--muted) / 0.3)',
                      }}
                    >
                      <span>Table Name</span>
                      <span className="text-center">Est. Rows</span>
                      <span className="text-right">Status</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {result.tables.map((t) => {
                        const isCritical = CRITICAL_TABLES.some((ct) => ct.name === t.name);
                        return (
                          <div
                            key={t.name}
                            className="grid grid-cols-3 px-5 py-2.5 border-b last:border-b-0 items-center"
                            style={{ borderColor: 'hsl(var(--border))' }}
                          >
                            <div className="flex items-center gap-2">
                              <code
                                className="text-xs"
                                style={{ color: 'hsl(var(--foreground))' }}
                              >
                                {t.name}
                              </code>
                              {isCritical && (
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                                    color: 'hsl(var(--primary))',
                                  }}
                                >
                                  critical
                                </span>
                              )}
                            </div>
                            <span
                              className="text-sm text-center"
                              style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                              {t.estimatedRows.toLocaleString()}
                            </span>
                            <div className="flex justify-end">
                              <CheckCircle2 size={14} style={{ color: 'hsl(142 76% 36%)' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Overall Status Banner ── */}
            <div
              className="rounded-2xl border p-5 mb-6"
              style={{
                backgroundColor:
                  overallStatus === 'ok' ?'hsl(142 76% 36% / 0.06)'
                    : overallStatus === 'warning' ?'hsl(38 92% 50% / 0.06)' :'hsl(var(--destructive) / 0.06)',
                borderColor:
                  overallStatus === 'ok' ?'hsl(142 76% 36% / 0.25)'
                    : overallStatus === 'warning' ?'hsl(38 92% 50% / 0.25)' :'hsl(var(--destructive) / 0.25)',
              }}
            >
              <div className="flex items-start gap-3">
                {overallStatus === 'ok' ? (
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0" style={{ color: 'hsl(142 76% 36%)' }} />
                ) : overallStatus === 'warning' ? (
                  <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: 'hsl(38 92% 50%)' }} />
                ) : (
                  <XCircle size={20} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--destructive))' }} />
                )}
                <div>
                  <p
                    className="font-semibold text-sm mb-1"
                    style={{
                      color:
                        overallStatus === 'ok' ?'hsl(142 76% 36%)'
                          : overallStatus === 'warning' ?'hsl(38 92% 50%)' :'hsl(var(--destructive))',
                    }}
                  >
                    {overallStatus === 'ok' ?'✅ Installation verified — all systems operational'
                      : overallStatus === 'warning' ?'⚠️ Schema incomplete — some tables are missing' :'❌ Database connection failed'}
                  </p>
                  <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                    {overallStatus === 'ok'
                      ? `Connected to ${result.database} with ${result.tableCount} tables. All ${result.schemaVerification.expectedTableCount} critical tables are present.`
                      : overallStatus === 'warning'
                      ? `${result.schemaVerification.missingTables.length} critical tables are missing. Run the installer to create them.`
                      : error}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Actions ── */}
            <div className="flex flex-wrap gap-3">
              {overallStatus !== 'ok' && (
                <Link
                  href="/install"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                  }}
                >
                  Run Installer
                </Link>
              )}
              <Link
                href="/orders-dashboard"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80"
                style={{
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  backgroundColor: 'hsl(var(--card))',
                }}
              >
                Go to Dashboard
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80"
                style={{
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  backgroundColor: 'hsl(var(--card))',
                }}
              >
                Settings
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
