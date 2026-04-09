'use client';

import { useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Play, Clock, AlertCircle, CheckCircle, Database, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

interface SelectResult {
  type: 'SELECT';
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  execTimeMs: number;
}

interface MutationResult {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER';
  affectedRows: number;
  insertId: number | null;
  changedRows: number;
  execTimeMs: number;
  message: string;
}

type QueryResult = SelectResult | MutationResult;

interface HistoryEntry {
  sql: string;
  timestamp: string;
  success: boolean;
}

const EXAMPLE_QUERIES = [
  { label: 'List all tables', sql: 'SHOW TABLES' },
  { label: 'Show drivers', sql: 'SELECT * FROM drivers LIMIT 20' },
  { label: 'Show orders', sql: 'SELECT * FROM orders LIMIT 20' },
  { label: 'Count rows per table', sql: `SELECT table_name, table_rows\nFROM information_schema.tables\nWHERE table_schema = DATABASE()\nORDER BY table_name` },
  { label: 'Show settings', sql: 'SELECT * FROM settings LIMIT 50' },
];

export default function SqlQueryContent() {
  const [sql, setSql] = useState('SELECT * FROM drivers LIMIT 20');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runQuery = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/database/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql.trim() }),
        cache: 'no-store',
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
      }

      if (!res.ok) {
        const msg = [data.error, data.code, data.sqlState].filter(Boolean).join(' | ');
        throw new Error(msg || 'Query failed');
      }

      setResult(data);
      setHistory((prev) => [
        { sql: sql.trim(), timestamp: new Date().toLocaleTimeString(), success: true },
        ...prev.slice(0, 19),
      ]);
    } catch (err: any) {
      setError(err.message || 'Query execution failed');
      setHistory((prev) => [
        { sql: sql.trim(), timestamp: new Date().toLocaleTimeString(), success: false },
        ...prev.slice(0, 19),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
          >
            <Database size={20} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              SQL Query Tool
            </h1>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Run SELECT, INSERT, UPDATE, and DELETE queries directly against the database
            </p>
          </div>
        </div>

        {/* Example Queries */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => setSql(ex.sql)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:opacity-80"
              style={{
                borderColor: 'hsl(var(--border))',
                backgroundColor: 'hsl(var(--secondary))',
                color: 'hsl(var(--foreground))',
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
        >
          <div
            className="flex items-center justify-between px-4 py-2 border-b"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}
          >
            <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              SQL Editor — Ctrl+Enter to run
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSql('')}
                className="p-1.5 rounded hover:opacity-70 transition-opacity"
                title="Clear editor"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={runQuery}
                disabled={loading || !sql.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
              >
                <Play size={14} />
                {loading ? 'Running...' : 'Run Query'}
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={8}
            spellCheck={false}
            className="w-full p-4 font-mono text-sm resize-y outline-none"
            style={{
              backgroundColor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              minHeight: '160px',
            }}
            placeholder="Enter SQL query here..."
          />
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-3 p-4 rounded-xl border"
            style={{
              borderColor: 'hsl(var(--destructive) / 0.3)',
              backgroundColor: 'hsl(var(--destructive) / 0.05)',
            }}
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'hsl(var(--destructive))' }}>
                Query Error
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
          >
            {/* Result header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--secondary))' }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle size={16} style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                  {result.type === 'SELECT'
                    ? `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} returned`
                    : result.message}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <Clock size={12} />
                {result.execTimeMs}ms
              </div>
            </div>

            {/* SELECT table */}
            {result.type === 'SELECT' && result.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'hsl(var(--secondary))' }}>
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b whitespace-nowrap"
                          style={{
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b last:border-0 hover:opacity-80 transition-opacity"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        {result.columns.map((col) => (
                          <td
                            key={col}
                            className="px-4 py-2.5 font-mono text-xs max-w-xs truncate"
                            style={{ color: 'hsl(var(--foreground))' }}
                            title={String(row[col] ?? '')}
                          >
                            {row[col] === null ? (
                              <span style={{ color: 'hsl(var(--muted-foreground))' }}>NULL</span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SELECT empty */}
            {result.type === 'SELECT' && result.rows.length === 0 && (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Query returned no rows.
              </div>
            )}

            {/* Mutation result details */}
            {result.type !== 'SELECT' && (
              <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Affected Rows</p>
                  <p className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{result.affectedRows}</p>
                </div>
                {result.type === 'INSERT' && result.insertId !== null && (
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Insert ID</p>
                    <p className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{result.insertId}</p>
                  </div>
                )}
                {result.type === 'UPDATE' && (
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Changed Rows</p>
                    <p className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{result.changedRows}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Query History */}
        {history.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
          >
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
              style={{ color: 'hsl(var(--foreground))' }}
            >
              <span>Query History ({history.length})</span>
              {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showHistory && (
              <div className="border-t divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {history.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => setSql(entry.sql)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                  >
                    <span
                      className="mt-0.5 shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: entry.success ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs truncate" style={{ color: 'hsl(var(--foreground))' }}>
                        {entry.sql}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {entry.timestamp}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
