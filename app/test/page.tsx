'use client';

import { useState } from 'react';

export default function TestAPIPage() {
  const [endpoint, setEndpoint] = useState('check');
  const [requestBody, setRequestBody] = useState(JSON.stringify({
    customerId: 'default-customer',
    department: 'Engineering',
    subCategory: 'Software',
    fiscalPeriod: 'FY2025',
    amount: 10000,
    currency: 'USD'
  }, null, 2));
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoints = [
    { value: 'check', label: 'Check Budget', method: 'POST', path: '/api/budget/check' },
    { value: 'reserve', label: 'Reserve Budget', method: 'POST', path: '/api/budget/reserve' },
    { value: 'commit', label: 'Commit Budget', method: 'POST', path: '/api/budget/commit' },
    { value: 'release', label: 'Release Budget', method: 'POST', path: '/api/budget/release' },
  ];

  const templates: Record<string, any> = {
    check: {
      customerId: 'default-customer',
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      amount: 10000,
      currency: 'USD'
    },
    reserve: {
      budgetId: 'budget-id-here',
      amount: 5000,
      requestId: 'req-123',
      userId: 'user-456',
      reason: 'Testing reservation'
    },
    commit: {
      budgetId: 'budget-id-here',
      amount: 5000,
      requestId: 'req-123',
      userId: 'user-456',
      reason: 'Testing commitment',
      wasReserved: false
    },
    release: {
      budgetId: 'budget-id-here',
      amount: 5000,
      type: 'reserved',
      requestId: 'req-123',
      userId: 'user-456',
      reason: 'Testing release'
    }
  };

  function handleEndpointChange(value: string) {
    setEndpoint(value);
    setRequestBody(JSON.stringify(templates[value], null, 2));
    setResponse(null);
    setError(null);
  }

  async function handleTest() {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const selectedEndpoint = endpoints.find(e => e.value === endpoint);
      if (!selectedEndpoint) return;

      const body = JSON.parse(requestBody);

      const res = await fetch(selectedEndpoint.path, {
        method: selectedEndpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">API Testing Console</h1>
              <p className="mt-2 text-gray-600">Test budget integration APIs</p>
            </div>
            <a
              href="/"
              className="px-4 py-2 text-gray-600 hover:text-pink-600 transition-colors"
            >
              ← Back to Home
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Request Panel */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Request</h2>

            {/* Endpoint Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Endpoint
              </label>
              <select
                value={endpoint}
                onChange={(e) => handleEndpointChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              >
                {endpoints.map(ep => (
                  <option key={ep.value} value={ep.value}>
                    {ep.label} - {ep.method} {ep.path}
                  </option>
                ))}
              </select>
            </div>

            {/* Request Body */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Request Body (JSON)
              </label>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                rows={15}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
            </div>

            {/* Action Buttons */}
            <button
              onClick={handleTest}
              disabled={loading}
              className="w-full px-6 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-medium rounded-lg hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Send Request'}
            </button>
          </div>

          {/* Response Panel */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Response</h2>

            {!response && !error && (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Send a request to see the response</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-red-900 mb-1">Error</h3>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {response && (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center space-x-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    response.status >= 200 && response.status < 300
                      ? 'bg-green-100 text-green-800'
                      : response.status >= 400
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {response.status} {response.statusText}
                  </span>
                </div>

                {/* Response Body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Response Body
                  </label>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 text-sm font-mono">
                      {JSON.stringify(response.data, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* API Documentation */}
        <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">API Documentation</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">1. Check Budget</h3>
              <p className="text-sm text-gray-600 mb-2">Verify if sufficient budget is available for a request.</p>
              <code className="block bg-gray-100 p-3 rounded text-sm">
                POST /api/budget/check
              </code>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">2. Reserve Budget</h3>
              <p className="text-sm text-gray-600 mb-2">Soft hold on budget (48-hour reservation).</p>
              <code className="block bg-gray-100 p-3 rounded text-sm">
                POST /api/budget/reserve
              </code>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">3. Commit Budget</h3>
              <p className="text-sm text-gray-600 mb-2">Hard lock on budget (approved spend).</p>
              <code className="block bg-gray-100 p-3 rounded text-sm">
                POST /api/budget/commit
              </code>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">4. Release Budget</h3>
              <p className="text-sm text-gray-600 mb-2">Release reserved or committed budget (cancel/reject).</p>
              <code className="block bg-gray-100 p-3 rounded text-sm">
                POST /api/budget/release
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
