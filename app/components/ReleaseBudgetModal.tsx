'use client';

import { useState } from 'react';

interface ReleaseBudgetModalProps {
  budget: any;
  onClose: () => void;
  onRelease: (budgetId: string, type: 'reserved' | 'committed' | 'both') => Promise<void>;
}

export function ReleaseBudgetModal({ budget, onClose, onRelease }: ReleaseBudgetModalProps) {
  const [loading, setLoading] = useState(false);
  const [releaseType, setReleaseType] = useState<'reserved' | 'committed' | 'both'>('reserved');

  const committed = budget.utilization?.committedAmount || 0;
  const reserved = budget.utilization?.reservedAmount || 0;

  async function handleRelease() {
    setLoading(true);
    try {
      await onRelease(budget.id, releaseType);
      onClose();
    } catch (error) {
      console.error('Release failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Release Budget</h2>
            <p className="text-sm text-gray-600 mt-1">Free up locked budget amounts</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Budget Info */}
        <div className="mb-6 p-4 bg-gray-50 rounded-xl">
          <div className="font-semibold text-gray-900 text-lg">{budget.department}</div>
          {budget.subCategory && (
            <div className="text-sm text-gray-600">{budget.subCategory}</div>
          )}
          <div className="text-xs text-gray-500 mt-1">{budget.fiscalPeriod}</div>
        </div>

        {/* Current Amounts */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-2 border-yellow-200">
            <div>
              <div className="text-xs font-semibold text-yellow-700 uppercase">Reserved</div>
              <div className="text-sm text-gray-600">Pending approval</div>
            </div>
            <div className="text-xl font-bold text-yellow-700">
              ${reserved.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
            <div>
              <div className="text-xs font-semibold text-blue-700 uppercase">Committed</div>
              <div className="text-sm text-gray-600">Approved spend</div>
            </div>
            <div className="text-xl font-bold text-blue-700">
              ${committed.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Release Options */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            What would you like to release?
          </label>
          <div className="space-y-2">
            <button
              onClick={() => setReleaseType('reserved')}
              disabled={reserved === 0}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                releaseType === 'reserved'
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-gray-200 hover:border-pink-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">Reserved only</div>
                  <div className="text-sm text-gray-600">Release pending approvals</div>
                </div>
                <div className="text-lg font-bold text-yellow-600">
                  ${reserved.toLocaleString()}
                </div>
              </div>
            </button>

            <button
              onClick={() => setReleaseType('committed')}
              disabled={committed === 0}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                releaseType === 'committed'
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-gray-200 hover:border-pink-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">Committed only</div>
                  <div className="text-sm text-gray-600">Release approved spend</div>
                </div>
                <div className="text-lg font-bold text-blue-600">
                  ${committed.toLocaleString()}
                </div>
              </div>
            </button>

            <button
              onClick={() => setReleaseType('both')}
              disabled={reserved === 0 && committed === 0}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                releaseType === 'both'
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-gray-200 hover:border-pink-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">Both reserved & committed</div>
                  <div className="text-sm text-gray-600">Release all locked amounts</div>
                </div>
                <div className="text-lg font-bold text-red-600">
                  ${(reserved + committed).toLocaleString()}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-red-700">
              <strong>Warning:</strong> This action will immediately free up the selected budget amounts. This cannot be undone.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRelease}
            disabled={loading || (reserved === 0 && committed === 0)}
            className="flex-1 px-4 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Releasing...' : 'Release Budget'}
          </button>
        </div>
      </div>
    </div>
  );
}
