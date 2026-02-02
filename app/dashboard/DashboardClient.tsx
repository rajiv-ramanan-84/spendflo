'use client';

import { useEffect, useState } from 'react';
import { ToastContainer, ToastProps } from '@/app/components/Toast';
import { BudgetEditModal } from '@/app/components/BudgetEditModal';
import { ReleaseBudgetModal } from '@/app/components/ReleaseBudgetModal';
import { ExportButton } from '@/app/components/ExportButton';
import { CleanupButton } from '@/app/components/CleanupButton';
import { Header } from '@/app/components/Header';
import { getCurrentUser } from '@/app/components/UserSelector';

interface DashboardStats {
  summary: {
    totalBudget: number;
    totalCommitted: number;
    totalReserved: number;
    totalAvailable: number;
    totalUtilizationPercent: number;
  };
  health: {
    healthy: number;
    warning: number;
    highRisk: number;
    critical: number;
  };
  criticalBudgets: Array<{
    id: string;
    department: string;
    subCategory: string | null;
    totalBudget: number;
    utilized: number;
    available: number;
    utilizationPercent: number;
  }>;
  totalBudgets: number;
}

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

export function DashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  // Modal state
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<string | null>(null);
  const [releasingBudget, setReleasingBudget] = useState<Budget | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const statsRes = await fetch('/api/dashboard/stats');

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
        setBudgets([]);
      } else {
        // Set empty state if API fails
        setStats({
          summary: {
            totalBudget: 0,
            totalCommitted: 0,
            totalReserved: 0,
            totalAvailable: 0,
            totalUtilizationPercent: 0,
          },
          health: { healthy: 0, warning: 0, highRisk: 0, critical: 0 },
          criticalBudgets: [],
          totalBudgets: 0,
        });
        setBudgets([]);
        addToast('error', 'Failed to load dashboard', 'Please check database connection');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setStats({
        summary: {
          totalBudget: 0,
          totalCommitted: 0,
          totalReserved: 0,
          totalAvailable: 0,
          totalUtilizationPercent: 0,
        },
        health: { healthy: 0, warning: 0, highRisk: 0, critical: 0 },
        criticalBudgets: [],
        totalBudgets: 0,
      });
      setBudgets([]);
      addToast('error', 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBudget(budgetId: string, data: any) {
    try {
      const res = await fetch(`/api/budgets/${budgetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, userId: getCurrentUser() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      addToast('success', 'Budget updated', 'Changes saved successfully');
      fetchData();
    } catch (error: any) {
      addToast('error', 'Failed to update budget', error.message);
      throw error;
    }
  }


  async function handleDeleteBudget(budgetId: string) {
    try {
      const res = await fetch(`/api/budgets/${budgetId}?userId=${getCurrentUser()}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      addToast('success', 'Budget deleted', 'Budget removed successfully');
      fetchData();
      setDeletingBudget(null);
    } catch (error: any) {
      addToast('error', 'Failed to delete budget', error.message);
    }
  }

  async function handleReleaseBudget(budgetId: string, type: 'reserved' | 'committed' | 'both') {
    try {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;

      const committed = budget.utilization?.committedAmount || 0;
      const reserved = budget.utilization?.reservedAmount || 0;

      if (type === 'both') {
        // Release both
        if (reserved > 0) {
          await fetch('/api/budget/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              budgetId,
              amount: reserved,
              type: 'reserved',
              userId: getCurrentUser(),
              reason: 'Manual release by FP&A',
            }),
          });
        }
        if (committed > 0) {
          await fetch('/api/budget/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              budgetId,
              amount: committed,
              type: 'committed',
              userId: getCurrentUser(),
              reason: 'Manual release by FP&A',
            }),
          });
        }
        addToast('success', 'Budget released', `Released $${(reserved + committed).toLocaleString()} total`);
      } else {
        const amount = type === 'reserved' ? reserved : committed;
        await fetch('/api/budget/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            budgetId,
            amount,
            type,
            userId: getCurrentUser(),
            reason: 'Manual release by FP&A',
          }),
        });
        addToast('success', 'Budget released', `Released $${amount.toLocaleString()} from ${type}`);
      }

      fetchData();
    } catch (error: any) {
      addToast('error', 'Failed to release budget', error.message);
      throw error;
    }
  }

  function addToast(type: ToastProps['type'], message: string, description?: string) {
    const id = Math.random().toString(36);
    setToasts((prev) => [...prev, { id, type, message, description, onClose: removeToast }]);
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">Failed to load dashboard</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Modals */}
      {editingBudget && (
        <BudgetEditModal
          budget={editingBudget}
          onClose={() => setEditingBudget(null)}
          onSave={handleSaveBudget}
        />
      )}


      {releasingBudget && (
        <ReleaseBudgetModal
          budget={releasingBudget}
          onClose={() => setReleasingBudget(null)}
          onRelease={handleReleaseBudget}
        />
      )}

      {/* Delete Confirmation */}
      {deletingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this budget? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingBudget(null)}
                className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBudget(deletingBudget)}
                className="flex-1 px-4 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Budget Dashboard</h1>
              <p className="mt-2 text-gray-600">Monitor budget health and utilization</p>
            </div>
            <div className="flex gap-3">
              <CleanupButton onComplete={fetchData} />
              <ExportButton budgets={budgets} />
            </div>
          </div>
        </div>

        {/* Rest of dashboard content - summary cards, health status, budgets table */}
        {/* (Keeping the same structure as before, adding action buttons to each row) */}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-pink-500">
            <div className="text-sm font-medium text-gray-500 mb-1">Total Budget</div>
            <div className="text-3xl font-bold text-gray-900">
              ${stats.summary.totalBudget.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
            <div className="text-sm font-medium text-gray-500 mb-1">Committed</div>
            <div className="text-3xl font-bold text-gray-900">
              ${stats.summary.totalCommitted.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-yellow-500">
            <div className="text-sm font-medium text-gray-500 mb-1">Reserved</div>
            <div className="text-3xl font-bold text-gray-900">
              ${stats.summary.totalReserved.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
            <div className="text-sm font-medium text-gray-500 mb-1">Available</div>
            <div className="text-3xl font-bold text-gray-900">
              ${stats.summary.totalAvailable.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Utilization Overview */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Overall Utilization</h2>
          <div className="flex items-center">
            <div className="flex-1 bg-gray-200 rounded-full h-8">
              <div
                className="bg-gradient-to-r from-pink-500 to-pink-600 h-8 rounded-full flex items-center justify-end pr-4"
                style={{ width: `${Math.min(stats.summary.totalUtilizationPercent, 100)}%` }}
              >
                <span className="text-white font-bold text-sm">
                  {stats.summary.totalUtilizationPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Health Status */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Budget Health Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-4xl font-bold text-green-600 mb-1">{stats.health.healthy}</div>
              <div className="text-sm font-medium text-green-900">Healthy</div>
              <div className="text-xs text-green-600 mt-1">&lt; 70% utilized</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-4xl font-bold text-yellow-600 mb-1">{stats.health.warning}</div>
              <div className="text-sm font-medium text-yellow-900">Warning</div>
              <div className="text-xs text-yellow-600 mt-1">70-80% utilized</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-4xl font-bold text-orange-600 mb-1">{stats.health.highRisk}</div>
              <div className="text-sm font-medium text-orange-900">High Risk</div>
              <div className="text-xs text-orange-600 mt-1">80-90% utilized</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="text-4xl font-bold text-red-600 mb-1">{stats.health.critical}</div>
              <div className="text-sm font-medium text-red-900">Critical</div>
              <div className="text-xs text-red-600 mt-1">&gt; 90% utilized</div>
            </div>
          </div>
        </div>

        {/* Critical Budgets */}
        {stats.criticalBudgets.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h2 className="text-xl font-bold text-red-600 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Critical Budgets Requiring Attention
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sub-Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Budget</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilized</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilization</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.criticalBudgets.map((budget) => (
                    <tr key={budget.id} className="hover:bg-red-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {budget.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {budget.subCategory || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${budget.totalBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                        ${budget.utilized.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${budget.available.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-red-500 h-2 rounded-full"
                              style={{ width: `${Math.min(budget.utilizationPercent, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-red-600">
                            {budget.utilizationPercent.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stats.criticalBudgets.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center mb-8">
            <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-900 mb-2">All budgets are healthy!</h3>
            <p className="text-gray-600">No critical budget alerts at this time.</p>
          </div>
        )}

        {/* All Budgets Table with Actions */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">All Budgets</h2>
              <p className="text-sm text-gray-600 mt-1">Complete breakdown by department and category</p>
            </div>
          </div>

          {budgets.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium mb-2">No budgets found</p>
              <p className="text-sm mb-4">Click "Add Budget" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sub-Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Budgeted</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Committed</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reserved</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilization</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {budgets.map((budget) => {
                    const committed = budget.utilization?.committedAmount || 0;
                    const reserved = budget.utilization?.reservedAmount || 0;
                    const available = budget.budgetedAmount - committed - reserved;
                    const utilization = ((committed + reserved) / budget.budgetedAmount) * 100;

                    return (
                      <tr key={budget.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {budget.department}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {budget.subCategory || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {budget.fiscalPeriod}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {budget.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {budget.currency === 'GBP' ? '£' : '$'}{budget.budgetedAmount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {budget.currency === 'GBP' ? '£' : '$'}{committed.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600 font-medium">
                          {budget.currency === 'GBP' ? '£' : '$'}{reserved.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                          {budget.currency === 'GBP' ? '£' : '$'}{available.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-20 bg-gray-200 rounded-full h-2 mr-2">
                              <div
                                className={`h-2 rounded-full ${
                                  utilization >= 90 ? 'bg-red-500' :
                                  utilization >= 80 ? 'bg-orange-500' :
                                  utilization >= 70 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(utilization, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-700 font-medium">
                              {utilization.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingBudget(budget)}
                              className="text-pink-600 hover:text-pink-900"
                              title="Edit budget"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setReleasingBudget(budget)}
                              disabled={committed === 0 && reserved === 0}
                              className="text-blue-600 hover:text-blue-900 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={committed === 0 && reserved === 0 ? "No locked amounts to release" : "Release budget"}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeletingBudget(budget.id)}
                              disabled={committed > 0 || reserved > 0}
                              className="text-red-600 hover:text-red-900 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={committed > 0 || reserved > 0 ? "Cannot delete budget with commitments" : "Delete budget"}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
