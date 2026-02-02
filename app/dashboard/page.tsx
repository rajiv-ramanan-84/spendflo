'use client';

import { useEffect, useState } from 'react';

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statsRes, budgetsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/budgets')
      ]);
      const statsData = await statsRes.json();
      const budgetsData = await budgetsRes.json();
      setStats(statsData);
      setBudgets(budgetsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
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
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Budget Dashboard</h1>
              <p className="mt-2 text-gray-600">Monitor budget health and utilization</p>
            </div>
            <a
              href="/"
              className="px-4 py-2 text-gray-600 hover:text-pink-600 transition-colors"
            >
              ← Back to Home
            </a>
          </div>
        </div>

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
          <div className="bg-white rounded-xl shadow-sm p-6">
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
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-900 mb-2">All budgets are healthy!</h3>
            <p className="text-gray-600">No critical budget alerts at this time.</p>
          </div>
        )}

        {/* All Budgets Table */}
        <div className="mt-8 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">All Budgets</h2>
              <p className="text-sm text-gray-600 mt-1">Complete breakdown by department and category</p>
            </div>
            <a
              href="/budgets"
              className="px-4 py-2 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-medium rounded-lg hover:from-pink-600 hover:to-pink-700 transition-all text-sm"
            >
              {budgets.length === 0 ? 'Add Budgets' : 'Modify Budgets'}
            </a>
          </div>

          {budgets.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium mb-2">No budgets found</p>
              <p className="text-sm mb-4">Upload an Excel file to get started</p>
              <a href="/fpa/upload" className="text-pink-600 hover:text-pink-700 font-medium">
                Upload Budgets →
              </a>
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
