'use client';

import { useState } from 'react';
import { Database, CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

interface StepResult {
  statement: string;
  status: 'ok' | 'error';
  error?: string;
}

interface InstallResult {
  success: boolean;
  message: string;
  totalStatements: number;
  successCount: number;
  errorCount: number;
  errors: StepResult[];
}

interface StatusResult {
  status: 'connected' | 'error';
  tableCount: number;
  tables: { name: string; estimatedRows: number }[];
  schemaVerification: {
    valid: boolean;
    missingTables: string[];
    foundCount: number;
    expectedTableCount: number;
  };
  sampleDataCounts: Record<string, number>;
  error?: string;
}

type Phase = 'idle' | 'checking' | 'ready' | 'installing' | 'done' | 'error';

export default function InstallPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const checkDatabase = async () => {
    setPhase('checking');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/database/status');
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Check that the API route is accessible.`);
      }
      if (!res.ok || data.status === 'error') throw new Error(data.error || 'Failed to check database status');
      setStatusResult(data);
      setPhase('ready');
    } catch (err: any) {
      setErrorMessage(err.message);
      setPhase('error');
    }
  };

  const runInstall = async () => {
    setPhase('installing');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/database/setup', { method: 'POST' });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Check that the API route is accessible.`);
      }
      if (!res.ok) throw new Error(data.error || 'Installation failed');
      setInstallResult(data);
      setPhase('done');
    } catch (err: any) {
      setErrorMessage(err.message);
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setStatusResult(null);
    setInstallResult(null);
    setErrorMessage(null);
    setShowErrors(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="rounded-xl p-2.5" style={{ backgroundColor: 'hsl(var(--primary))' }}>
              <AppLogo size={28} />
            </div>
            <span className="text-xl font-semibold" style={{ color: 'hsl(var(--foreground))' }}>CastleAdmin</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'hsl(var(--foreground))' }}>First-Time Installation</h1>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Set up your MySQL database with tables and sample data to get started quickly.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border p-6 shadow-sm" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: 'hsl(var(--primary) / 0.08)' }}>
                <Database size={32} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>Welcome to the Setup Wizard</h2>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                This wizard will create all required database tables and import sample data including drivers, orders, customers, delivery zones, and more.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                {[
                  { label: 'Database Tables', value: '35+ tables' },
                  { label: 'Sample Drivers', value: '5 drivers' },
                  { label: 'Sample Orders', value: 'Multiple orders' },
                  { label: 'Delivery Zones', value: 'Pre-configured' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: 'hsl(var(--muted) / 0.4)', border: '1px solid hsl(var(--border))' }}>
                    <p className="text-xs mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.label}</p>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{item.value}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={checkDatabase}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                Check Database Connection
              </button>
            </div>
          )}

          {/* ── CHECKING ── */}
          {phase === 'checking' && (
            <div className="text-center py-8">
              <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>Checking database connection…</p>
              <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Connecting to {process.env.NEXT_PUBLIC_DB_REST_URL ? 'configured host' : 'MySQL server'}</p>
            </div>
          )}

          {/* ── READY ── */}
          {phase === 'ready' && statusResult && (
            <div>
              <div className="flex items-center gap-3 mb-5 p-3.5 rounded-xl" style={{ backgroundColor: 'hsl(var(--success, 142 76% 36%) / 0.08)', border: '1px solid hsl(var(--success, 142 76% 36%) / 0.2)' }}>
                <CheckCircle2 size={20} style={{ color: 'hsl(142 76% 36%)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'hsl(142 76% 36%)' }}>Database Connected</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{statusResult.tableCount} tables currently in database</p>
                </div>
              </div>

              {statusResult.tableCount > 0 && (
                <div className="mb-5 p-3.5 rounded-xl" style={{ backgroundColor: 'hsl(var(--warning, 38 92% 50%) / 0.08)', border: '1px solid hsl(var(--warning, 38 92% 50%) / 0.2)' }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'hsl(38 92% 50%)' }} />
                    <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                      <span className="font-semibold">Warning:</span> {statusResult.tableCount} tables already exist. Running the installation will use <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'hsl(var(--muted))' }}>ON DUPLICATE KEY UPDATE</code> — existing data will not be overwritten.
                    </p>
                  </div>
                </div>
              )}

              {!statusResult.schemaVerification.valid && statusResult.schemaVerification.missingTables.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-medium mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Missing tables ({statusResult.schemaVerification.missingTables.length}):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {statusResult.schemaVerification.missingTables.map(t => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  Cancel
                </button>
                <button
                  onClick={runInstall}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                >
                  {statusResult.tableCount === 0 ? 'Install Now' : 'Run Installation'}
                </button>
              </div>
            </div>
          )}

          {/* ── INSTALLING ── */}
          {phase === 'installing' && (
            <div className="text-center py-8">
              <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>Installing database…</p>
              <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Creating tables and importing sample data. This may take a moment.</p>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && installResult && (
            <div>
              <div className="text-center mb-5">
                {installResult.success ? (
                  <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: 'hsl(142 76% 36%)' }} />
                ) : (
                  <AlertTriangle size={48} className="mx-auto mb-3" style={{ color: 'hsl(38 92% 50%)' }} />
                )}
                <h2 className="text-lg font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                  {installResult.success ? 'Installation Complete!' : 'Installation Finished with Warnings'}
                </h2>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{installResult.message}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'hsl(var(--muted) / 0.4)', border: '1px solid hsl(var(--border))' }}>
                  <p className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>{installResult.totalStatements}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Total</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'hsl(142 76% 36% / 0.08)', border: '1px solid hsl(142 76% 36% / 0.2)' }}>
                  <p className="text-xl font-bold" style={{ color: 'hsl(142 76% 36%)' }}>{installResult.successCount}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Succeeded</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: installResult.errorCount > 0 ? 'hsl(var(--destructive) / 0.08)' : 'hsl(var(--muted) / 0.4)', border: `1px solid ${installResult.errorCount > 0 ? 'hsl(var(--destructive) / 0.2)' : 'hsl(var(--border))'}` }}>
                  <p className="text-xl font-bold" style={{ color: installResult.errorCount > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}>{installResult.errorCount}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Failed</p>
                </div>
              </div>

              {installResult.errors.length > 0 && (
                <div className="mb-5">
                  <button
                    onClick={() => setShowErrors(!showErrors)}
                    className="flex items-center gap-2 text-sm font-medium w-full text-left"
                    style={{ color: 'hsl(var(--destructive))' }}
                  >
                    {showErrors ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    View {installResult.errors.length} error{installResult.errors.length !== 1 ? 's' : ''}
                  </button>
                  {showErrors && (
                    <div className="mt-2 rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
                      {installResult.errors.map((e, i) => (
                        <div key={i} className="p-3 border-b last:border-b-0 text-xs" style={{ borderColor: 'hsl(var(--border))' }}>
                          <p className="font-mono mb-1 truncate" style={{ color: 'hsl(var(--foreground))' }}>{e.statement}</p>
                          <p style={{ color: 'hsl(var(--destructive))' }}>{e.error}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  Run Again
                </button>
                <a
                  href="/orders-dashboard"
                  className="flex-1 py-3 rounded-xl font-semibold text-sm text-center transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                >
                  Go to Dashboard
                </a>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div className="text-center">
              <XCircle size={48} className="mx-auto mb-3" style={{ color: 'hsl(var(--destructive))' }} />
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>Connection Failed</h2>
              <p className="text-sm mb-5 p-3 rounded-xl" style={{ color: 'hsl(var(--destructive))', backgroundColor: 'hsl(var(--destructive) / 0.08)', border: '1px solid hsl(var(--destructive) / 0.2)' }}>
                {errorMessage}
              </p>
              <button
                onClick={reset}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs mt-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Already set up?{' '}
          <a href="/login" className="font-medium hover:underline" style={{ color: 'hsl(var(--primary))' }}>
            Sign in to your dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
