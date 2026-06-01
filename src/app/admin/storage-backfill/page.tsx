'use client';

import { useState } from 'react';

export default function StorageBackfillPage() {
  const [status, setStatus] = useState<string>('idle');
  const [result, setResult] = useState<any>(null);
  const [limit, setLimit] = useState(50);

  const runBackfill = async () => {
    setStatus('loading');
    setResult(null);

    try {
      const res = await fetch('/api/v1/admin/storage/backfill-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });

      const data = await res.json();
      setResult(data);
      setStatus('success');
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
      setStatus('error');
    }
  };

  const checkStatus = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/v1/admin/storage/backfill-public');
      const data = await res.json();
      setResult(data);
      setStatus('success');
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Storage Backfill - Manga Covers</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4 items-end mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Limit</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min="1"
                max="200"
                className="border rounded px-3 py-2 w-32"
              />
            </div>
            <button
              onClick={runBackfill}
              disabled={status === 'loading'}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'loading' ? 'Running...' : 'Start Backfill'}
            </button>
            <button
              onClick={checkStatus}
              disabled={status === 'loading'}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              Check Status
            </button>
          </div>

          {result && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <pre className="text-sm overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <p className="font-medium mb-2">Info:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Backfill download covers dan upload ke R2</li>
            <li>Proses jalan di background</li>
            <li>Bisa cek progress di Import Jobs</li>
            <li>Max 200 manga per batch</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
