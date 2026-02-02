'use client';

import { useState, useEffect } from 'react';

interface BudgetEditModalProps {
  budget: any;
  onClose: () => void;
  onSave: (budgetId: string, data: any) => Promise<void>;
}

export function BudgetEditModal({ budget, onClose, onSave }: BudgetEditModalProps) {
  const [budgetedAmount, setBudgetedAmount] = useState(budget.budgetedAmount.toString());
  const [currency, setCurrency] = useState(budget.currency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const committed = budget.utilization?.committedAmount || 0;
  const reserved = budget.utilization?.reservedAmount || 0;
  const minAmount = committed + reserved;

  async function handleSave() {
    const amount = parseFloat(budgetedAmount);

    // Validation
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (amount < minAmount) {
      setError(`Cannot reduce below committed + reserved ($${minAmount.toLocaleString()})`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onSave(budget.id, {
        budgetedAmount: amount,
        currency,
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Edit Budget</h2>
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
          <div className="text-sm text-gray-600 mb-1">Budget Details</div>
          <div className="font-semibold text-gray-900">{budget.department}</div>
          {budget.subCategory && (
            <div className="text-sm text-gray-600">{budget.subCategory}</div>
          )}
          <div className="text-xs text-gray-500 mt-1">{budget.fiscalPeriod}</div>
        </div>

        {/* Current Utilization */}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Committed:</span>
            <span className="font-semibold text-blue-600">${committed.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Reserved:</span>
            <span className="font-semibold text-yellow-600">${reserved.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t">
            <span className="text-gray-600">Minimum allowed:</span>
            <span className="font-semibold text-gray-900">${minAmount.toLocaleString()}</span>
          </div>
        </div>

        {/* Edit Fields */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Budgeted Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={budgetedAmount}
                onChange={(e) => setBudgetedAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
                step="0.01"
                min={minAmount}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Must be at least ${minAmount.toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
            >
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
