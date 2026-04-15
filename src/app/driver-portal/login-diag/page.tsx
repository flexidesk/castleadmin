'use client';

import { useState } from 'react';

export default function LoginDiagPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/drivers/portal-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      setResult({ status: res.status, ok: res.ok, body: json });
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-bold mb-6">Driver Login Diagnostic</h1>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="driver@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="password"
            />
          </div>
          <button
            onClick={run}
            disabled={loading || !email || !password}
            className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Login API'}
          </button>
        </div>

        {result && (
          <div className="mt-6 bg-white rounded-lg border p-6">
            <div className={`text-sm font-semibold mb-3 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
              HTTP {result.status} — {result.ok ? '✅ SUCCESS' : '❌ FAILED'}
            </div>
            <pre className="text-xs bg-gray-50 rounded p-3 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(result.body ?? result, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-500">
          <p>This page calls <code>/api/drivers/portal-login</code> directly and shows the raw response.</p>
          <p className="mt-1">If you see a <code>detail</code> field in the error, that is the exact DB error message.</p>
        </div>
      </div>
    </div>
  );
}
