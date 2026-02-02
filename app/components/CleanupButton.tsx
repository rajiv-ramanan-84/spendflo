'use client';

import { useState } from 'react';

interface CleanupResult {
  duplicatesFound: number;
  budgetsDeleted: number;
  details: any[];
}

export function CleanupButton({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  async function handleCleanup() {
    setLoading(true);
    try {
      const res = await fetch('/api/cleanup-duplicates', {
        method: 'POST',
      });
      const data = await res.json();
      setResult(data);
      setShowConfirm(false);
      if (data.success) {
        setTimeout(() => {
          onComplete();
        }, 3000);
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-900 mb-1">
              Cleanup Complete!
            </p>
            <p className="text-sm text-green-700">
              Removed {result.budgetsDeleted} duplicate budgets. Found {result.duplicatesFound} duplicate groups.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-900 mb-1">
              Remove duplicate budgets?
            </p>
            <p className="text-sm text-yellow-700 mb-3">
              This will keep budgets with utilization data and remove empty duplicates.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 text-sm border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanup}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 disabled:opacity-50"
              >
                {loading ? 'Cleaning...' : 'Yes, Clean Up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="inline-flex items-center px-4 py-2 bg-yellow-50 border-2 border-yellow-300 text-yellow-700 font-medium rounded-lg hover:bg-yellow-100 transition-colors"
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
      Clean Duplicates
    </button>
  );
}
