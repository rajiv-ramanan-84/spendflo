'use client';

import { useState } from 'react';

interface AddBudgetModalProps {
  onClose: () => void;
  onAdd: (data: any) => Promise<void>;
}

export function AddBudgetModal({ onClose, onAdd }: AddBudgetModalProps) {
  const [department, setDepartment] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [fiscalPeriod, setFiscalPeriod] = useState('FY2025');
  const [budgetedAmount, setBudgetedAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd() {
    // Validation
    if (!department || !budgetedAmount || !fiscalPeriod) {
      setError('Please fill in all required fields');
      return;
    }

    const amount = parseFloat(budgetedAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onAdd({
        department,
        subCategory: subCategory || null,
        fiscalPeriod,
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
          <h2 className="text-2xl font-bold text-gray-900">Add Budget</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Fields */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Department <span className="text-pink-500">*</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g., Engineering, Sales, Marketing"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Sub-Category <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder="e.g., Software, Hardware, Tools"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Fiscal Period <span className="text-pink-500">*</span>
            </label>
            <select
              value={fiscalPeriod}
              onChange={(e) => setFiscalPeriod(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
            >
              <option value="FY2025">FY2025</option>
              <option value="FY2026">FY2026</option>
              <option value="Q1-2025">Q1-2025</option>
              <option value="Q2-2025">Q2-2025</option>
              <option value="Q3-2025">Q3-2025</option>
              <option value="Q4-2025">Q4-2025</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Budgeted Amount <span className="text-pink-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={budgetedAmount}
                onChange={(e) => setBudgetedAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
                step="0.01"
                min="0"
              />
            </div>
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
            onClick={handleAdd}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Budget'}
          </button>
        </div>
      </div>
    </div>
  );
}
