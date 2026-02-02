'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/app/components/Header';
import { getCurrentUser } from '@/app/components/UserSelector';

interface RequestLog {
  id: string;
  budgetId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  reason: string | null;
  createdAt: string;
  budget: {
    department: string;
    subCategory: string | null;
    fiscalPeriod: string;
  };
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'reserved' | 'committed' | 'released'>('all');

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    try {
      const res = await fetch('/api/audit');
      const data = await res.json();

      // Filter for reserve/commit/release actions
      const userRequests = data.filter((log: RequestLog) =>
        ['RESERVE', 'COMMIT', 'RELEASE'].includes(log.action)
      );

      setRequests(userRequests);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = requests.filter((req) => {
    if (filter === 'all') return true;
    if (filter === 'reserved') return req.action === 'RESERVE';
    if (filter === 'committed') return req.action === 'COMMIT';
    if (filter === 'released') return req.action === 'RELEASE';
    return true;
  });

  function getStatusBadge(action: string) {
    const styles = {
      RESERVE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      COMMIT: 'bg-green-100 text-green-800 border-green-200',
      RELEASE: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    const labels = {
      RESERVE: 'Reserved',
      COMMIT: 'Committed',
      RELEASE: 'Released',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${styles[action as keyof typeof styles]}`}>
        {labels[action as keyof typeof labels]}
      </span>
    );
  }

  function extractAmount(value: string | null): number {
    if (!value) return 0;
    // Extract number from strings like "committed:250000,reserved:50000" or just "5000"
    const match = value.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  if (loading) {
    return (
      <div>
        <Header />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading requests...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Budget Requests</h1>
          <p className="mt-2 text-gray-600">Track all your budget requests and their status</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-semibold text-gray-700">Filter:</span>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-pink-100 text-pink-700 border-2 border-pink-300'
                  : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:border-pink-300'
              }`}
            >
              All ({requests.length})
            </button>
            <button
              onClick={() => setFilter('reserved')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'reserved'
                  ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-300'
                  : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:border-yellow-300'
              }`}
            >
              Reserved ({requests.filter((r) => r.action === 'RESERVE').length})
            </button>
            <button
              onClick={() => setFilter('committed')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'committed'
                  ? 'bg-green-100 text-green-700 border-2 border-green-300'
                  : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:border-green-300'
              }`}
            >
              Approved ({requests.filter((r) => r.action === 'COMMIT').length})
            </button>
            <button
              onClick={() => setFilter('released')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'released'
                  ? 'bg-gray-100 text-gray-700 border-2 border-gray-400'
                  : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:border-gray-400'
              }`}
            >
              Released ({requests.filter((r) => r.action === 'RELEASE').length})
            </button>
          </div>
        </div>

        {/* Requests List */}
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium text-gray-900 mb-2">No requests found</p>
            <p className="text-sm text-gray-600 mb-4">
              {filter === 'all' ? 'You haven\'t submitted any budget requests yet' : `No ${filter} requests found`}
            </p>
            <a
              href="/business/request-v2"
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all"
            >
              Submit New Request
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <div
                key={request.id}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow border-l-4 border-pink-500"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      {getStatusBadge(request.action)}
                      <span className="text-lg font-bold text-gray-900">
                        {request.budget.department}
                        {request.budget.subCategory && ` / ${request.budget.subCategory}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <span className="text-sm text-gray-600">Amount:</span>
                        <span className="ml-2 text-sm font-semibold text-gray-900">
                          ${extractAmount(request.newValue).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Period:</span>
                        <span className="ml-2 text-sm font-semibold text-gray-900">
                          {request.budget.fiscalPeriod}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Submitted by:</span>
                        <span className="ml-2 text-sm font-semibold text-gray-900">
                          {request.changedBy}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Date:</span>
                        <span className="ml-2 text-sm font-semibold text-gray-900">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {request.reason && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-xs font-semibold text-gray-600 uppercase">Reason:</span>
                        <p className="text-sm text-gray-900 mt-1">{request.reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="ml-6 text-right">
                    <div className="text-xs text-gray-500">
                      {new Date(request.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {filteredRequests.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {requests.filter((r) => r.action === 'RESERVE').length}
                </div>
                <div className="text-sm text-gray-600">Pending Approval</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {requests.filter((r) => r.action === 'COMMIT').length}
                </div>
                <div className="text-sm text-gray-600">Approved</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {requests.filter((r) => r.action === 'RELEASE').length}
                </div>
                <div className="text-sm text-gray-600">Cancelled/Released</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
