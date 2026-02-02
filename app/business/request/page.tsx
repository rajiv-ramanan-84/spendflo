'use client';

import { useState, useEffect } from 'react';
import { ToastContainer, ToastProps } from '@/app/components/Toast';

interface Budget {
  id: string;
  department: string;
  subCategory: string | null;
  fiscalPeriod: string;
  budgetedAmount: number;
  currency: string;
  utilization?: {
    committedAmount: number;
    reservedAmount: number;
  };
}

export default function BusinessRequestPage() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [department, setDepartment] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [fiscalPeriod, setFiscalPeriod] = useState('FY2025');

  // Autocomplete state
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [showSubCategoryDropdown, setShowSubCategoryDropdown] = useState(false);

  // Validation state
  const [budgetCheck, setBudgetCheck] = useState<any>(null);
  const [checkingBudget, setCheckingBudget] = useState(false);

  useEffect(() => {
    fetchBudgets();
  }, []);

  async function fetchBudgets() {
    try {
      const res = await fetch('/api/budgets');
      const data = await res.json();
      setBudgets(data);
    } catch (error) {
      console.error('Failed to fetch budgets:', error);
    }
  }

  // Debounced budget check
  useEffect(() => {
    if (department && amount && parseFloat(amount) > 0) {
      const timer = setTimeout(() => {
        checkBudgetAvailability();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setBudgetCheck(null);
    }
  }, [department, subCategory, amount, fiscalPeriod]);

  async function checkBudgetAvailability() {
    setCheckingBudget(true);
    try {
      const res = await fetch('/api/budget/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
          subCategory: subCategory || undefined,
          fiscalPeriod,
          amount: parseFloat(amount),
          currency: 'USD',
        }),
      });
      const data = await res.json();
      setBudgetCheck(data);
    } catch (error) {
      console.error('Budget check failed:', error);
    } finally {
      setCheckingBudget(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Data validation
    if (!department || !amount || !description) {
      addToast('error', 'Missing required fields', 'Please fill in all required fields');
      return;
    }

    // Business logic validation
    if (!budgetCheck?.isAvailable) {
      addToast('error', 'Insufficient budget', budgetCheck?.reason || 'Budget not available for this request');
      return;
    }

    setLoading(true);

    try {
      // Reserve budget
      const res = await fetch('/api/budget/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetId: budgetCheck.budgetId,
          amount: parseFloat(amount),
          requestId: `req-${Date.now()}`,
          userId: 'business-user',
          reason: description,
        }),
      });

      const data = await res.json();

      if (data.success) {
        addToast('success', 'Request submitted!', `$${parseFloat(amount).toLocaleString()} reserved from ${department} budget`);

        // Reset form
        setDepartment('');
        setSubCategory('');
        setAmount('');
        setDescription('');
        setBudgetCheck(null);
      } else {
        addToast('error', 'Failed to reserve budget', data.error);
      }
    } catch (error: any) {
      addToast('error', 'Request failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  function addToast(type: ToastProps['type'], message: string, description?: string) {
    const id = Math.random().toString(36);
    setToasts((prev) => [...prev, { id, type, message, description, onClose: removeToast }]);
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Get unique departments
  const departments = Array.from(new Set(budgets.map((b) => b.department))).sort();

  // Get sub-categories for selected department
  const subCategories = department
    ? Array.from(new Set(budgets.filter((b) => b.department === department).map((b) => b.subCategory).filter(Boolean)))
    : [];

  // Filter departments based on input
  const filteredDepartments = departments.filter((d) =>
    d.toLowerCase().includes(department.toLowerCase())
  );

  // Filter sub-categories based on input
  const filteredSubCategories = subCategories.filter((s) =>
    s?.toLowerCase().includes(subCategory.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <a href="/" className="inline-flex items-center text-sm text-gray-600 hover:text-pink-600 mb-4">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </a>
          <h1 className="text-3xl font-bold text-gray-900">Request Budget</h1>
          <p className="mt-2 text-gray-600">Submit a purchase request with real-time budget validation</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Department - Autocomplete */}
          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Department <span className="text-pink-500">*</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setShowDepartmentDropdown(true);
                setSubCategory(''); // Reset sub-category when department changes
              }}
              onFocus={() => setShowDepartmentDropdown(true)}
              onBlur={() => setTimeout(() => setShowDepartmentDropdown(false), 200)}
              placeholder="Start typing... (e.g., Engineering, Sales)"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors text-gray-900 placeholder-gray-400"
            />

            {/* Dropdown */}
            {showDepartmentDropdown && filteredDepartments.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                {filteredDepartments.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => {
                      setDepartment(dept);
                      setShowDepartmentDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-pink-50 transition-colors text-gray-900 flex items-center justify-between group"
                  >
                    <span className="font-medium">{dept}</span>
                    <span className="text-xs text-gray-500 group-hover:text-pink-600">
                      {budgets.filter((b) => b.department === dept).length} budgets
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Validation: Data level */}
            {!department && (
              <p className="mt-2 text-xs text-gray-500">Required field</p>
            )}
          </div>

          {/* Sub-Category - Autocomplete */}
          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Sub-Category <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={subCategory}
              onChange={(e) => {
                setSubCategory(e.target.value);
                setShowSubCategoryDropdown(true);
              }}
              onFocus={() => setShowSubCategoryDropdown(true)}
              onBlur={() => setTimeout(() => setShowSubCategoryDropdown(false), 200)}
              placeholder="Start typing... (e.g., Software, Hardware)"
              disabled={!department}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />

            {/* Dropdown */}
            {showSubCategoryDropdown && filteredSubCategories.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                {filteredSubCategories.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => {
                      setSubCategory(sub || '');
                      setShowSubCategoryDropdown(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-pink-50 transition-colors text-gray-900"
                  >
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount with real-time validation */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Amount <span className="text-pink-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors text-gray-900 placeholder-gray-400"
                step="0.01"
                min="0"
              />
            </div>

            {/* Real-time budget check */}
            {checkingBudget && (
              <div className="mt-3 flex items-center text-sm text-gray-600">
                <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking budget availability...
              </div>
            )}

            {/* Business logic validation */}
            {budgetCheck && !checkingBudget && (
              <div className={`mt-3 p-4 rounded-xl border-2 ${
                budgetCheck.isAvailable
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start">
                  {budgetCheck.isAvailable ? (
                    <svg className="w-5 h-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${budgetCheck.isAvailable ? 'text-green-900' : 'text-red-900'}`}>
                      {budgetCheck.reason}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600">Available:</span>
                        <span className={`ml-1 font-semibold ${budgetCheck.isAvailable ? 'text-green-700' : 'text-red-700'}`}>
                          ${budgetCheck.available?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Total:</span>
                        <span className="ml-1 font-semibold text-gray-900">
                          ${budgetCheck.totalBudget?.toLocaleString() || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description <span className="text-pink-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you purchasing? (e.g., Annual Salesforce subscription for sales team)"
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors text-gray-900 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Fiscal Period */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Fiscal Period
            </label>
            <select
              value={fiscalPeriod}
              onChange={(e) => setFiscalPeriod(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors text-gray-900"
            >
              <option value="FY2025">FY2025</option>
              <option value="FY2026">FY2026</option>
              <option value="Q1-2025">Q1-2025</option>
              <option value="Q2-2025">Q2-2025</option>
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !budgetCheck?.isAvailable || !department || !amount || !description}
            className="w-full py-4 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </span>
            ) : (
              'Submit Request'
            )}
          </button>

          {/* Help text */}
          <p className="text-xs text-center text-gray-500">
            Your request will be sent for approval. Budget will be reserved for 48 hours.
          </p>
        </form>
      </div>
    </div>
  );
}
