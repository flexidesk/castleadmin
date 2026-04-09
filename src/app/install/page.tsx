'use client';

import { useEffect, useState } from 'react';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const [form, setForm] = useState({
    DB_HOST: '',
    DB_PORT: '3306',
    DB_NAME: '',
    DB_USER: '',
    DB_PASSWORD: '',
    DATABASE_SSL: false,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/install/config', { cache: 'no-store' });
      const text = await res.text();

      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }

      if (res.ok && data.config) {
        setForm({
          DB_HOST: data.config.DB_HOST || '',
          DB_PORT: data.config.DB_PORT || '3306',
          DB_NAME: data.config.DB_NAME || '',
          DB_USER: data.config.DB_USER || '',
          DB_PASSWORD: '',
          DATABASE_SSL: data.config.DATABASE_SSL === 'true',
        });
      }
    } catch {}
  };

  const updateField = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/install/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save config');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save config');
      setPhase('error');
      throw err;
    } finally {
      setSavingConfig(false);
    }
  };

  const checkDatabase = async () => {
    setPhase('checking');
    setErrorMessage(null);
    setStatusResult(null);

    try {
      await saveConfig();

      const res = await fetch('/api/database/status', { cache: 'no-store' });
      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Check that the API route is accessible.`);
      }

      if (!res.ok || data.status === 'error') {
        const msg = [data.error, data.code].filter(Boolean).join(' | ');
        throw new Error(msg || 'Failed to check database status');
      }

      setStatusResult(data);
      setPhase('ready');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to check database');
      setPhase('error');
    }
  };

  const runInstall = async () => {
    setPhase('installing');
    setErrorMessage(null);
    setInstallResult(null);

    try {
      await saveConfig();

      const res = await fetch('/api/database/setup', {
        method: 'POST',
        cache: 'no-store',
      });

      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Check that the API route is accessible.`);
      }

      if (!res.ok) {
        const msg = [data.error, data.details, data.code].filter(Boolean).join(' | ');
        throw new Error(msg || 'Installation failed');
      }

      setInstallResult(data);
      setPhase('done');
    } catch (err: any) {
      setErrorMessage(err.message || 'Installation failed');
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
    <div className="min-h-screen flex items-start justify-center px-4 py-12" style={{ backgroundColor: 'hsl(var(--background))' }}>
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
            Enter your database credentials, test the connection, then create the required tables.
          </p>
        </div>

        {/* DB Config Card */}
        <div className="rounded-2xl border p-6 shadow-sm mb-4" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'hsl(var(--foreground))' }}>Database Configuration</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Database Host</label>
              <input
                type="text"
                value={form.DB_HOST}
                onChange={(e) => updateField('DB_HOST', e.target.value)}
                placeholder="localhost"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Port</label>
              <input
                type="text"
                value={form.DB_PORT}
                onChange={(e) => updateField('DB_PORT', e.target.value)}
                placeholder="3306"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Database Name</label>
              <input
                type="text"
                value={form.DB_NAME}
                onChange={(e) => updateField('DB_NAME', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Database User</label>
              <input
                type="text"
                value={form.DB_USER}
                onChange={(e) => updateField('DB_USER', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Database Password</label>
              <input
                type="password"
                value={form.DB_PASSWORD}
                onChange={(e) => updateField('DB_PASSWORD', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                }}
              />
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                <input
                  type="checkbox"
                  checked={form.DATABASE_SSL}
                  onChange={(e) => updateField('DATABASE_SSL', e.target.checked)}
                  className="rounded"
                />
                Use SSL for database connection
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              {savingConfig ? 'Saving…' : 'Save Config'}
            </button>

            <button
              onClick={checkDatabase}
              disabled={phase === 'checking' || savingConfig}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              {phase === 'checking' ? (
                <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Checking…</span>
              ) : 'Test Connection'}
            </button>

            <button
              onClick={runInstall}
              disabled={phase === 'installing' || savingConfig}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'hsl(var(--primary) / 0.85)', color: 'hsl(var(--primary-foreground))' }}
            >
              {phase === 'installing' ? (
                <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Installing…</span>
              ) : 'Run Install'}
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="rounded-xl border p-4 mb-4 flex items-start gap-3" style={{ backgroundColor: 'hsl(var(--destructive) / 0.08)', borderColor: 'hsl(var(--destructive) / 0.3)' }}>
            <XCircle size={18} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: 'hsl(var(--destructive))' }}>Error</p>
              <p className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Status Result */}
        {statusResult && (
          <div className="rounded-2xl border p-5 mb-4 shadow-sm" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'hsl(var(--foreground))' }}>Database Status</h3>

            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} style={{ color: 'hsl(142 76% 36%)' }} />
              <span className="text-sm font-medium" style={{ color: 'hsl(142 76% 36%)' }}>Connected</span>
              <span className="text-xs ml-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>{statusResult.tableCount} tables found</span>
            </div>

            {statusResult.schemaVerification.missingTables.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Missing tables ({statusResult.schemaVerification.missingTables.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {statusResult.schemaVerification.missingTables.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }}>{t}</span>
                  ))}
                </div>
              </div>
            )}

            <pre className="text-xs rounded-lg p-3 overflow-auto max-h-48" style={{ backgroundColor: 'hsl(var(--muted) / 0.5)', color: 'hsl(var(--foreground))' }}>
              {JSON.stringify(statusResult, null, 2)}
            </pre>

            <div className="flex gap-3 mt-4">
              <button
                onClick={reset}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                Reset
              </button>
              <button
                onClick={runInstall}
                disabled={phase === 'installing'}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                {phase === 'installing' ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Installing…</span>
                ) : (statusResult.tableCount === 0 ? 'Install Now' : 'Run Installation')}
              </button>
            </div>
          </div>
        )}

        {/* Install Result */}
        {installResult && (
          <div className="rounded-2xl border p-5 shadow-sm" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="text-center mb-4">
              {installResult.success ? (
                <CheckCircle2 size={40} className="mx-auto mb-2" style={{ color: 'hsl(142 76% 36%)' }} />
              ) : (
                <AlertTriangle size={40} className="mx-auto mb-2" style={{ color: 'hsl(38 92% 50%)' }} />
              )}
              <h3 className="text-base font-semibold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                {installResult.success ? 'Installation Complete!' : 'Installation Finished with Warnings'}
              </h3>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{installResult.message}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total', value: installResult.totalStatements },
                { label: 'Succeeded', value: installResult.successCount },
                { label: 'Failed', value: installResult.errorCount },
              ].map((item) => (
                <div key={item.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: 'hsl(var(--muted) / 0.4)', border: '1px solid hsl(var(--border))' }}>
                  <p className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>{item.value}</p>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.label}</p>
                </div>
              ))}
            </div>

            {installResult.errors.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowErrors(!showErrors)}
                  className="flex items-center gap-2 text-sm font-medium w-full text-left"
                  style={{ color: 'hsl(var(--destructive))' }}
                >
                  {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {installResult.errors.length} error{installResult.errors.length !== 1 ? 's' : ''}
                </button>
                {showErrors && (
                  <div className="mt-2 space-y-2">
                    {installResult.errors.map((e, i) => (
                      <div key={i} className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'hsl(var(--destructive) / 0.06)', border: '1px solid hsl(var(--destructive) / 0.2)' }}>
                        <p className="font-mono mb-1 opacity-70">{e.statement}</p>
                        <p style={{ color: 'hsl(var(--destructive))' }}>{e.error}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <pre className="text-xs rounded-lg p-3 overflow-auto max-h-48" style={{ backgroundColor: 'hsl(var(--muted) / 0.5)', color: 'hsl(var(--foreground))' }}>
              {JSON.stringify(installResult, null, 2)}
            </pre>

            <button
              onClick={reset}
              className="w-full mt-4 py-2.5 rounded-xl font-semibold text-sm border transition-opacity hover:opacity-80"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              Start Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
