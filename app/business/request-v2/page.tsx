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

  // AI budget suggestion state
  const [budgetSuggestion, setBudgetSuggestion] = useState<any>(null);
  const [showSuggestionConfirm, setShowSuggestionConfirm] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

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
    setBudgetCheck(null);
    setBudgetSuggestion(null);
    setShowSuggestionConfirm(false);

    try {
      // Find ALL matching budgets for this department
      const matchingBudgets = budgets.filter(b => b.department === department);

      if (matchingBudgets.length === 0) {
        setBudgetCheck({
          success: false,
          available: false,
          reason: 'No budget found for this department',
        });
        setCheckingBudget(false);
        return;
      }

      console.log(`[Budget Check] Found ${matchingBudgets.length} budget(s) for ${department}`);

      // If only one budget, proceed directly
      if (matchingBudgets.length === 1) {
        await checkSpecificBudget(matchingBudgets[0]);
        return;
      }

      // Multiple budgets - use AI to suggest which one
      console.log('[Budget Check] Multiple budgets found. Using AI to suggest category...');

      const availableBudgets = matchingBudgets.map(b => ({
        subCategory: b.subCategory,
        budgetedAmount: b.budgetedAmount,
        available: b.budgetedAmount - (b.utilization?.committedAmount || 0) - (b.utilization?.reservedAmount || 0),
      }));

      const suggestionRes = await fetch('/api/budget/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
          vendor,
          purpose,
          amount: parseFloat(amount),
          contractTerm,
          availableBudgets,
        }),
      });

      const suggestionData = await suggestionRes.json();

      if (!suggestionData.success) {
        throw new Error('Failed to get AI suggestion');
      }

      const suggestion = suggestionData.suggestion;
      console.log('[Budget Check] AI Suggestion:', suggestion);

      // If AI has low confidence or no suggestion, show FP&A contact message
      if (!suggestion.suggestedCategory || suggestion.confidence === 'low') {
        setBudgetCheck({
          success: true,
          available: false,
          reason: suggestion.alternativeMessage || 'Unable to automatically determine the correct budget category. Please contact the FP&A team for assistance.',
          contactFPA: true,
        });
        setCheckingBudget(false);
        return;
      }

      // AI suggested a category - find the matching budget
      const suggestedBudget = matchingBudgets.find(b => b.subCategory === suggestion.suggestedCategory);

      if (!suggestedBudget) {
        console.error('[Budget Check] AI suggested non-existent category');
        setBudgetCheck({
          success: true,
          available: false,
          reason: 'Unable to match this request to a budget category. Please contact the FP&A team.',
          contactFPA: true,
        });
        setCheckingBudget(false);
        return;
      }

      // Show confirmation UI
      setSelectedBudget(suggestedBudget);
      setBudgetSuggestion(suggestion);
      setShowSuggestionConfirm(true);
      setCheckingBudget(false);

    } catch (error) {
      console.error('Budget check failed:', error);
      setBudgetCheck({
        success: false,
        available: false,
        reason: 'Failed to check budget availability. Please try again or contact FP&A team.',
      });
      setCheckingBudget(false);
    }
  }

  async function checkSpecificBudget(budget: Budget) {
    try {
      console.log('[Budget Check] Checking specific budget:', {
        department: budget.department,
        subCategory: budget.subCategory,
        fiscalPeriod: budget.fiscalPeriod,
        amount: parseFloat(amount),
      });

      const res = await fetch('/api/budget/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId,
          department: budget.department,
          subCategory: budget.subCategory || null,
          fiscalPeriod: budget.fiscalPeriod,
          amount: parseFloat(amount),
          currency: 'USD',
        }),
      });
      const data = await res.json();
      console.log('[Budget Check] Response:', data);
      setBudgetCheck(data);
    } catch (error) {
      console.error('Budget check failed:', error);
      setBudgetCheck({
        success: false,
        available: false,
        reason: 'Failed to check budget. Please try again.',
      });
    } finally {
      setCheckingBudget(false);
    }
  }

  function confirmBudgetSuggestion() {
    if (selectedBudget) {
      setShowSuggestionConfirm(false);
      checkSpecificBudget(selectedBudget);
    }
  }

  function declineBudgetSuggestion() {
    setShowSuggestionConfirm(false);
    setBudgetSuggestion(null);
    setSelectedBudget(null);
    setBudgetCheck({
      success: true,
      available: false,
      reason: 'Please contact the FP&A team to determine the correct budget category for this request.',
      contactFPA: true,
    });
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

            {/* AI Budget Suggestion Confirmation */}
            {showSuggestionConfirm && budgetSuggestion && selectedBudget && (
              <div className="p-5 rounded-xl border-2 border-blue-400 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-lg">
                <div className="flex items-start mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-bold text-blue-700 mb-2">
                      AI Budget Recommendation
                    </p>
                    <p className="text-sm text-blue-900 mb-3">
                      Based on your request (<strong>{vendor}</strong> for <strong>{purpose}</strong>),
                      we recommend using the <strong>{selectedBudget.subCategory}</strong> budget category.
                    </p>
                    <div className="bg-white/60 rounded-lg p-3 mb-3 border border-blue-200">
                      <p className="text-xs text-gray-600 mb-1">AI Reasoning:</p>
                      <p className="text-sm text-gray-800 italic">{budgetSuggestion.reasoning}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-3">
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium">Category:</span>
                        <span className="ml-2 font-bold text-gray-900">{selectedBudget.subCategory}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium">Available:</span>
                        <span className="ml-2 font-bold text-green-600">
                          ${(selectedBudget.budgetedAmount - (selectedBudget.utilization?.committedAmount || 0) - (selectedBudget.utilization?.reservedAmount || 0)).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium">Confidence:</span>
                        <span className={`ml-2 font-bold ${
                          budgetSuggestion.confidence === 'high' ? 'text-green-600' :
                          budgetSuggestion.confidence === 'medium' ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {budgetSuggestion.confidence.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={confirmBudgetSuggestion}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                  >
                    ✓ Yes, use this budget
                  </button>
                  <button
                    type="button"
                    onClick={declineBudgetSuggestion}
                    className="flex-1 px-4 py-2.5 bg-white text-gray-700 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                  >
                    ✗ No, contact FP&A team
                  </button>
                </div>
              </div>
            )}

            {/* Budget status - Eye-catching banner */}
            {budgetCheck && !checkingBudget && (
              <div className={`p-5 rounded-xl border-2 shadow-lg ${
                budgetCheck.available
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                  : budgetCheck.contactFPA
                  ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-400'
                  : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-400'
              }`}>
                <div className="flex items-start">
                  {budgetCheck.available ? (
                    <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : budgetCheck.contactFPA ? (
                    <div className="flex-shrink-0 w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
                    <p className={`text-base font-bold mb-2 ${
                      budgetCheck.available ? 'text-green-700' :
                      budgetCheck.contactFPA ? 'text-yellow-700' : 'text-red-700'
                    }`}>
                      {budgetCheck.available ? '✓ Budget Available' :
                       budgetCheck.contactFPA ? '📧 Contact FP&A Team' : '✗ Insufficient Budget'}
                    </p>
                    <p className={`text-sm mb-3 ${
                      budgetCheck.available ? 'text-green-600' :
                      budgetCheck.contactFPA ? 'text-yellow-700' : 'text-red-600'
                    }`}>
                      {budgetCheck.reason}
                    </p>
                    {budgetCheck.contactFPA && (
                      <div className="mt-3 p-3 bg-white/60 rounded-lg border border-yellow-200">
                        <p className="text-sm font-medium text-gray-900 mb-2">Contact Information:</p>
                        <p className="text-sm text-gray-700">
                          Email: <a href="mailto:fpa@acme.com" className="text-blue-600 hover:underline font-medium">fpa@acme.com</a>
                        </p>
                        <p className="text-xs text-gray-600 mt-2">
                          The FP&A team will help determine the correct budget category for your request.
                        </p>
                      </div>
                    )}
                    {!budgetCheck.contactFPA && budgetCheck.budget && (
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
                    )}
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
