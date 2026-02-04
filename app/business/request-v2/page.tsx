'use client';

import { useState, useEffect } from 'react';
import { ToastContainer, ToastProps } from '@/app/components/Toast';

interface Budget {
  id: string;
  customerId: string;
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
  const [customerId, setCustomerId] = useState<string>('');

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

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchBudgets();
  }, []);

  async function fetchBudgets() {
    try {
      const res = await fetch('/api/budgets');
      const data = await res.json();

      // Handle standardized API response
      const budgetsList = data.budgets || [];
      setBudgets(budgetsList);

      // Set customerId from first budget
      if (budgetsList.length > 0) {
        setCustomerId(budgetsList[0].customerId);
      }
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
      // Try to match imported format first
      const quarter = Math.ceil(month / 3);
      const quarterMap: Record<number, string> = {
        1: 'Jan-Mar',
        2: 'Apr-Jun',
        3: 'Jul-Sep',
        4: 'Oct-Dec'
      };
      return `${quarterMap[quarter]} ${year}`;
    }

    // For annual and one-time, match the Google Sheets import format
    return `Full Year ${year}`;
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
      // Find the matching budget to get subCategory AND fiscalPeriod
      const matchingBudget = budgets.find(b => b.department === department);

      if (!matchingBudget) {
        setBudgetCheck({
          success: false,
          available: false,
          reason: 'No budget found for this department',
        });
        setCheckingBudget(false);
        return;
      }

      console.log('[Budget Check] Checking budget:', {
        department,
        subCategory: matchingBudget.subCategory,
        fiscalPeriod: matchingBudget.fiscalPeriod,
        amount: parseFloat(amount),
      });

      const res = await fetch('/api/budget/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId,
          department,
          subCategory: matchingBudget.subCategory || null,
          fiscalPeriod: matchingBudget.fiscalPeriod, // Use the actual fiscal period from the budget!
          amount: parseFloat(amount),
          currency: 'USD',
        }),
      });
      const data = await res.json();
      console.log('[Budget Check] Response:', data);
      setBudgetCheck(data);
    } catch (error) {
      console.error('Budget check failed:', error);
    } finally {
      setCheckingBudget(false);
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!vendor.trim()) {
      errors.vendor = 'Vendor name is required';
    }

    if (!purpose.trim()) {
      errors.purpose = 'Purpose is required';
    }

    if (!amount) {
      errors.amount = 'Amount is required';
    } else if (parseFloat(amount) <= 0) {
      errors.amount = 'Amount must be greater than $0';
    }

    if (!department) {
      errors.department = 'Department is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!budgetCheck?.available) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/budget/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetId: budgetCheck.budget?.id,
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
        setFieldErrors({});
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
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="space-y-6">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Vendor / Supplier <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value);
                  if (fieldErrors.vendor) {
                    setFieldErrors(prev => ({ ...prev, vendor: '' }));
                  }
                }}
                placeholder="e.g., Salesforce, AWS, Figma"
                className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all text-gray-900 placeholder-gray-400 ${
                  fieldErrors.vendor
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-pink-500 focus:ring-pink-500/20'
                }`}
                autoFocus
              />
              {fieldErrors.vendor && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {fieldErrors.vendor}
                </p>
              )}
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                What is this for? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  if (fieldErrors.purpose) {
                    setFieldErrors(prev => ({ ...prev, purpose: '' }));
                  }
                }}
                placeholder="e.g., Annual CRM subscription for sales team"
                rows={2}
                className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all text-gray-900 placeholder-gray-400 resize-none ${
                  fieldErrors.purpose
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-pink-500 focus:ring-pink-500/20'
                }`}
              />
              {fieldErrors.purpose && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {fieldErrors.purpose}
                </p>
              )}
            </div>

            {/* Contract Term */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                        ? 'border-pink-500 bg-pink-50 text-pink-600'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-white/20'
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 text-lg">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (fieldErrors.amount) {
                      setFieldErrors(prev => ({ ...prev, amount: '' }));
                    }
                  }}
                  placeholder="0.00"
                  className={`w-full pl-8 pr-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all text-gray-900 placeholder-gray-400 ${
                    fieldErrors.amount
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-gray-300 focus:border-pink-500 focus:ring-pink-500/20'
                  }`}
                  step="0.01"
                  min="0"
                />
              </div>
              {fieldErrors.amount && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {fieldErrors.amount}
                </p>
              )}
            </div>

            {/* Department - Searchable dropdown */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Department <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={department || departmentSearch}
                onChange={(e) => {
                  setDepartmentSearch(e.target.value);
                  setDepartment('');
                  setShowDepartmentDropdown(true);
                  if (fieldErrors.department) {
                    setFieldErrors(prev => ({ ...prev, department: '' }));
                  }
                }}
                onFocus={() => setShowDepartmentDropdown(true)}
                onBlur={() => setTimeout(() => setShowDepartmentDropdown(false), 200)}
                placeholder="Start typing to search departments..."
                className={`w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 transition-all text-gray-900 placeholder-gray-400 ${
                  fieldErrors.department
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-pink-500 focus:ring-pink-500/20'
                }`}
              />

              {/* Dropdown - Shows filtered results as you type */}
              {showDepartmentDropdown && filteredDepartments.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-xl shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl">
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
                        className={`w-full px-4 py-3 text-left hover:bg-white transition-colors flex items-center justify-between group ${
                          dept === department ? 'bg-pink-50 text-pink-600' : 'text-gray-900'
                        }`}
                      >
                        <span className="font-medium">{dept}</span>
                        <span className="text-xs text-gray-500 group-hover:text-gray-600">
                          ${totalAvailable.toLocaleString()} available
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* No results message */}
              {showDepartmentDropdown && filteredDepartments.length === 0 && departmentSearch && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-xl shadow-xl p-4 text-center text-gray-600">
                  No departments found matching "{departmentSearch}"
                </div>
              )}

              {fieldErrors.department && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {fieldErrors.department}
                </p>
              )}
            </div>

            {/* Real-time budget check - Prominent at eye level */}
            {checkingBudget && (
              <div className="flex items-center justify-center text-sm text-gray-600 p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
                <svg className="animate-spin h-5 w-5 mr-3 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="font-medium text-blue-900">Checking budget availability...</span>
              </div>
            )}

            {/* Budget status - Eye-catching banner */}
            {budgetCheck && !checkingBudget && (
              <div className={`p-5 rounded-xl border-2 shadow-lg ${
                budgetCheck.available
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                  : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-400'
              }`}>
                <div className="flex items-start">
                  {budgetCheck.available ? (
                    <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className={`text-base font-bold mb-2 ${budgetCheck.available ? 'text-green-700' : 'text-red-700'}`}>
                      {budgetCheck.available ? '✓ Budget Available' : '✗ Insufficient Budget'}
                    </p>
                    <p className={`text-sm mb-3 ${budgetCheck.available ? 'text-green-600' : 'text-red-600'}`}>
                      {budgetCheck.reason}
                    </p>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium">Available:</span>
                        <span className={`ml-2 font-bold text-lg ${budgetCheck.available ? 'text-green-600' : 'text-red-600'}`}>
                          ${budgetCheck.budget?.available?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium">Total Budget:</span>
                        <span className="ml-2 font-bold text-gray-900">
                          ${budgetCheck.budget?.budgetedAmount?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium">Utilization:</span>
                        <span className="ml-2 font-bold text-gray-900">
                          {budgetCheck.utilizationPercent?.toFixed(0)}%
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
              disabled={loading || !budgetCheck?.available || !vendor || !purpose || !amount || !department}
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
              ) : !vendor || !purpose || !amount || !department ? (
                'Fill in all required fields'
              ) : !budgetCheck?.available ? (
                'Budget Not Available'
              ) : (
                'Submit Request'
              )}
            </button>

            <p className="text-xs text-center text-gray-500">
              {budgetCheck?.available ? (
                <>Budget will be reserved for 48 hours pending approval</>
              ) : vendor && purpose && amount && department ? (
                <span className="text-red-600 font-medium">Please ensure sufficient budget is available before submitting</span>
              ) : (
                <>Complete all required fields to check budget availability</>
              )}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
