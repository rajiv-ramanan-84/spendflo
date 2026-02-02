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

export default function BusinessRequestV2Page() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state - MINIMAL FIELDS
  const [vendor, setVendor] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [contractTerm, setContractTerm] = useState<'monthly' | 'annual' | 'one-time'>('annual');
  const [department, setDepartment] = useState('');

  // UI state
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState('');
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

  // Auto-detect fiscal period based on contract term
  function getFiscalPeriod(term: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (term === 'monthly') {
      const quarter = Math.ceil(month / 3);
      return `Q${quarter}-${year}`;
    }

    // For annual and one-time, use fiscal year
    return `FY${year}`;
  }

  // Smart vendor-to-department mapping
  function suggestDepartmentFromVendor(vendorName: string): string {
    const lower = vendorName.toLowerCase();

    const mappings: Record<string, string> = {
      'salesforce': 'Sales',
      'hubspot': 'Sales',
      'aws': 'Engineering',
      'azure': 'Engineering',
      'google': 'Engineering',
      'figma': 'Engineering',
      'github': 'Engineering',
      'jira': 'Engineering',
      'slack': 'Engineering',
      'zoom': 'Engineering',
      'notion': 'Engineering',
      'asana': 'Engineering',
      'stripe': 'Engineering',
      'mailchimp': 'Marketing',
      'google ads': 'Marketing',
      'facebook': 'Marketing',
      'linkedin': 'Marketing',
      'quickbooks': 'Finance',
      'gusto': 'HR',
      'rippling': 'HR',
      'workday': 'HR',
    };

    for (const [key, dept] of Object.entries(mappings)) {
      if (lower.includes(key)) {
        return dept;
      }
    }

    return '';
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
  }, [department, amount, contractTerm]);

  async function checkBudgetAvailability() {
    setCheckingBudget(true);
    try {
      const fiscalPeriod = getFiscalPeriod(contractTerm);

      const res = await fetch('/api/budget/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
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

    if (!vendor || !purpose || !amount || !department) {
      addToast('error', 'Missing information', 'Please fill in all required fields');
      return;
    }

    if (!budgetCheck?.isAvailable) {
      addToast('error', 'Budget unavailable', budgetCheck?.reason || 'Insufficient budget for this request');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/budget/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetId: budgetCheck.budgetId,
          amount: parseFloat(amount),
          requestId: `req-${Date.now()}`,
          userId: 'business-user',
          reason: `${vendor} - ${purpose} (${contractTerm})`,
        }),
      });

      const data = await res.json();

      if (data.success) {
        addToast('success', 'Request submitted!', `Reserved $${parseFloat(amount).toLocaleString()} from ${department}`);

        // Reset form
        setVendor('');
        setPurpose('');
        setAmount('');
        setDepartment('');
        setBudgetCheck(null);
      } else {
        addToast('error', 'Submission failed', data.error);
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

  // Filtered departments based on search
  const filteredDepartments = departments.filter((dept) =>
    dept.toLowerCase().includes(departmentSearch.toLowerCase())
  );

  // Auto-suggest department when vendor changes
  useEffect(() => {
    if (vendor && !department) {
      const suggested = suggestDepartmentFromVendor(vendor);
      if (suggested && departments.includes(suggested)) {
        setDepartment(suggested);
      }
    }
  }, [vendor]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="max-w-2xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <a href="/" className="inline-flex items-center text-sm text-gray-600 hover:text-pink-600 mb-6 transition-colors">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </a>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Request Budget</h1>
          <p className="text-gray-600">Quick approval for your purchase</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Vendor / Supplier
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g., Salesforce, AWS, Figma"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all text-white placeholder-gray-500"
                autoFocus
              />
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                What is this for?
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g., Annual CRM subscription for sales team"
                rows={2}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all text-white placeholder-gray-500 resize-none"
              />
            </div>

            {/* Contract Term */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Contract Term
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'monthly', label: 'Monthly', icon: '📅' },
                  { value: 'annual', label: 'Annual', icon: '📆' },
                  { value: 'one-time', label: 'One-time', icon: '⚡' },
                ].map((term) => (
                  <button
                    key={term.value}
                    type="button"
                    onClick={() => setContractTerm(term.value as any)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      contractTerm === term.value
                        ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="text-2xl mb-1">{term.icon}</div>
                    <div className="text-sm font-medium">{term.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all text-white placeholder-gray-500"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            {/* Department - Searchable dropdown */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Department
              </label>
              <input
                type="text"
                value={department || departmentSearch}
                onChange={(e) => {
                  setDepartmentSearch(e.target.value);
                  setDepartment('');
                  setShowDepartmentDropdown(true);
                }}
                onFocus={() => setShowDepartmentDropdown(true)}
                onBlur={() => setTimeout(() => setShowDepartmentDropdown(false), 200)}
                placeholder="Start typing to search departments..."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all text-white placeholder-gray-500"
              />

              {/* Dropdown - Shows filtered results as you type */}
              {showDepartmentDropdown && filteredDepartments.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl">
                  {filteredDepartments.map((dept) => {
                    const deptBudgets = budgets.filter((b) => b.department === dept);
                    const totalAvailable = deptBudgets.reduce((sum, b) => {
                      const committed = b.utilization?.committedAmount || 0;
                      const reserved = b.utilization?.reservedAmount || 0;
                      return sum + (b.budgetedAmount - committed - reserved);
                    }, 0);

                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => {
                          setDepartment(dept);
                          setDepartmentSearch('');
                          setShowDepartmentDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors flex items-center justify-between group ${
                          dept === department ? 'bg-pink-500/10 text-pink-400' : 'text-white'
                        }`}
                      >
                        <span className="font-medium">{dept}</span>
                        <span className="text-xs text-gray-500 group-hover:text-gray-400">
                          ${totalAvailable.toLocaleString()} available
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* No results message */}
              {showDepartmentDropdown && filteredDepartments.length === 0 && departmentSearch && (
                <div className="absolute z-10 w-full mt-2 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-xl p-4 text-center text-gray-400">
                  No departments found matching "{departmentSearch}"
                </div>
              )}
            </div>

            {/* Real-time budget check */}
            {checkingBudget && (
              <div className="flex items-center text-sm text-gray-400 p-4 bg-white/5 rounded-xl border border-white/10">
                <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking budget...
              </div>
            )}

            {/* Budget status */}
            {budgetCheck && !checkingBudget && (
              <div className={`p-4 rounded-xl border-2 ${
                budgetCheck.isAvailable
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="flex items-start">
                  {budgetCheck.isAvailable ? (
                    <svg className="w-5 h-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${budgetCheck.isAvailable ? 'text-green-400' : 'text-red-400'}`}>
                      {budgetCheck.reason}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-gray-400">Available:</span>
                        <span className={`ml-1 font-semibold ${budgetCheck.isAvailable ? 'text-green-400' : 'text-red-400'}`}>
                          ${budgetCheck.available?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Total:</span>
                        <span className="ml-1 font-semibold text-white">
                          ${budgetCheck.totalBudget?.toLocaleString() || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !budgetCheck?.isAvailable || !vendor || !purpose || !amount || !department}
              className="w-full py-4 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-pink-500/25 disabled:shadow-none"
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

            <p className="text-xs text-center text-gray-500">
              Budget will be reserved for 48 hours pending approval
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
